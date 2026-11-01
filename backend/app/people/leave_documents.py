"""Immutable, access-controlled paperwork for the leave workflow."""
from datetime import date
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.core.audit import now, record
from app.documents.models import Document
from app.documents.service import current_version, serialize, store_version


def document_id(leave_id):
    return f'doc-{leave_id}'


def is_leave_document(document):
    metadata = (getattr(document, 'extra', None) or {}).get('metadata', {})
    identifier = metadata.get('leave_request_id')
    return bool(identifier and document.id == document_id(identifier)
                and metadata.get('managed_by') == 'leave_workflow')


def linked_leave(db, document):
    if not is_leave_document(document):
        return None
    from app.people.models import LeaveRequest, User
    leave = db.get(LeaveRequest, document.extra['metadata']['leave_request_id'])
    person = db.get(User, leave.user_id) if leave else None
    return leave if person and person.airport_id == document.airport_id else None


def reference(db, leave):
    document = db.get(Document, document_id(leave.id))
    if not document or not is_leave_document(document):
        return {'document_id': None}
    return {'document_id': document.id, 'document_number': document.number,
            'document_version': document.version,
            'document_url': f'/api/documents/{document.id}/file'}


def _fonts():
    # Ship the fonts with the application: native and minimal Docker images
    # must render Romanian diacritics identically, without system font installs.
    directory = Path(__file__).resolve().parents[1] / 'assets' / 'fonts'
    if 'FlyLeafLeave' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('FlyLeafLeave', str(directory / 'DejaVuSans.ttf')))
        pdfmetrics.registerFont(TTFont('FlyLeafLeaveBold', str(directory / 'DejaVuSans-Bold.ttf')))
        pdfmetrics.registerFontFamily('FlyLeafLeave', normal='FlyLeafLeave', bold='FlyLeafLeaveBold')


def render_pdf(leave, person, number, created_at, *, approver=None, comment='', decided_at=None):
    _fonts()
    ink, muted, green = (colors.HexColor(v) for v in ('#17332d', '#60716b', '#2b6b54'))
    body = ParagraphStyle('leave-body', fontName='FlyLeafLeave', fontSize=10, leading=16, textColor=ink)
    small = ParagraphStyle('leave-small', parent=body, fontSize=8, leading=12, textColor=muted)
    label = ParagraphStyle('leave-label', parent=small, fontName='FlyLeafLeaveBold')
    title = ParagraphStyle('leave-title', parent=body, fontName='FlyLeafLeaveBold', fontSize=24, leading=30)
    heading = ParagraphStyle('leave-heading', parent=body, fontName='FlyLeafLeaveBold', fontSize=12, spaceBefore=18, spaceAfter=8)
    p = lambda value, style=body: Paragraph(escape(str(value)).replace('\n', '<br/>'), style)
    start, end = date.fromisoformat(leave.starts_at), date.fromisoformat(leave.ends_at)
    decision = {'pending': 'În așteptarea aprobării', 'approved': 'Aprobată', 'rejected': 'Respinsă'}[leave.status]
    output = BytesIO()
    pdf = SimpleDocTemplate(output, pagesize=A4, leftMargin=52, rightMargin=52,
        topMargin=76, bottomMargin=65, title=f'Cerere de concediu - {person.name}',
        author='FlyLeaf', subject='Document intern de resurse umane')

    def page_frame(canvas, document):
        width, height = A4
        canvas.setFillColor(green); canvas.rect(0, height-7, width, 7, stroke=0, fill=1)
        canvas.setFont('FlyLeafLeaveBold', 11); canvas.setFillColor(ink)
        canvas.drawString(52, height-39, 'FlyLeaf / ' + settings.airport_name)
        canvas.setFont('FlyLeafLeave', 8); canvas.setFillColor(muted)
        canvas.drawRightString(width-52, height-39, 'RESURSE UMANE')
        canvas.setStrokeColor(colors.HexColor('#dce5df')); canvas.line(52, 48, width-52, 48)
        canvas.drawString(52, 33, 'Acces restricționat - solicitant și persoane autorizate')
        canvas.drawRightString(width-52, 33, f'{document.page}')

    story = [p(number, label), Spacer(1, 10), p('Cerere de concediu', title),
             Spacer(1, 7), p(decision, ParagraphStyle('leave-state', parent=body, textColor=green)), Spacer(1, 22)]
    fields = [('Solicitant', person.name), ('Funcție', person.job_title or person.role),
              ('Departament', person.department), ('Perioadă solicitată', f'{start:%d.%m.%Y} - {end:%d.%m.%Y}'),
              ('Durată calendaristică', f'{(end-start).days+1} zile, inclusiv capetele intervalului'),
              ('Tip / motiv', leave.reason), ('Înregistrată la', created_at[:19].replace('T', ' ') + ' UTC')]
    table = Table([[p(k, label), p(v)] for k, v in fields], colWidths=[145, A4[0]-249], hAlign='LEFT')
    table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'), ('LEFTPADDING',(0,0),(-1,-1),12),
        ('RIGHTPADDING',(0,0),(-1,-1),12), ('TOPPADDING',(0,0),(-1,-1),10), ('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('BACKGROUND',(0,0),(0,-1),colors.HexColor('#f1f5f2')),
        ('LINEBELOW',(0,0),(-1,-1),0.5,colors.HexColor('#e1e7e3'))]))
    story.extend([table, p('Solicitare', heading),
        p(f'Solicit aprobarea absenței pentru perioada {start:%d.%m.%Y} - {end:%d.%m.%Y}, cu motivul menționat mai sus.'),
        Spacer(1, 8), p('Durata în zile lucrătoare și soldul de concediu se verifică în evidența de personal, potrivit programului angajatului.', small)])
    if approver:
        story.extend([p('Decizie înregistrată', heading), p(f'{decision} de {approver.name} ({approver.job_title or approver.role}).'),
            p('Data deciziei: ' + (decided_at or created_at)[:19].replace('T', ' ') + ' UTC', small),
            p(comment or 'Fără observații suplimentare.')])
    else:
        story.extend([p('Circuit de aprobare', heading), p('Cererea a fost transmisă pentru o decizie independentă în FlyLeaf. Absența devine aprobată numai după această decizie.')])
    story.extend([Spacer(1, 20), p('Document generat din cererea înregistrată în FlyLeaf. Identitatea solicitantului și decizia sunt consemnate în jurnal; această înregistrare nu reprezintă o semnătură electronică calificată.', small)])
    pdf.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return output.getvalue()


def write_request(db, actor, leave, person, created_files):
    identifier = document_id(leave.id)
    existing = db.get(Document, identifier)
    if existing:
        return existing
    created_at = now()
    document = Document(id=identifier, title=f'Cerere de concediu - {person.name}',
        number=f'FL-RU-{settings.reference_date.year}-{leave.id.removeprefix("leave-").upper()}',
        category='Resurse umane', department='Resurse umane', status='in_review',
        created_at=created_at, updated_at=created_at, owner=person.name, owner_id=person.id,
        created_by=person.id, confidentiality='restricted', airport_id=person.airport_id,
        summary=f'{leave.reason}: {leave.starts_at} - {leave.ends_at}.',
        searchable_text=f'{person.name} {leave.reason} {leave.starts_at} {leave.ends_at}',
        version=1, validated=True, extra={'filename':f'{leave.id}.pdf', 'tags':['Concediu'],
            'metadata':{'managed_by':'leave_workflow', 'leave_request_id':leave.id, 'request_status':'pending'},
            'related_ids':[], 'source_refs':[]})
    db.add(document); db.flush()
    _store(db, document, render_pdf(leave, person, document.number, created_at), actor,
           'Cerere de concediu înregistrată', created_files)
    record(db, actor, 'Document de concediu generat', document, f'Cererea {leave.id}; versiunea 1.')
    return document


def write_decision(db, actor, leave, person, comment, created_files):
    document = db.get(Document, document_id(leave.id))
    if not document:
        # Requests recorded before this feature retain their original pending
        # state as v1 when their first decision is entered.
        state = leave.status
        leave.status = 'pending'
        document = write_request(db, actor, leave, person, created_files)
        leave.status = state
    previous = current_version(db, document)
    previous.snapshot = serialize(document)
    decided_at = now()
    document.version += 1
    document.status = 'approved' if leave.status == 'approved' else 'archived'
    document.updated_at = decided_at
    document.extra = {**document.extra, 'metadata':{**document.extra['metadata'],
        'request_status':leave.status, 'decision_by':actor.name, 'decided_at':decided_at, 'decision_comment':comment}}
    content = render_pdf(leave, person, document.number, document.created_at,
        approver=actor, comment=comment, decided_at=decided_at)
    version = _store(db, document, content, actor, 'Decizie de concediu: ' + ('aprobată' if leave.status == 'approved' else 'respinsă'), created_files)
    if leave.status == 'approved':
        version.approved_by, version.approved_at = actor.id, decided_at
    return document


def _store(db, document, content, actor, comment, created_files):
    path = settings.storage_dir / 'documents' / document.id / f'v{document.version}.pdf'
    if path.exists():
        raise RuntimeError('A leave document version already exists; refusing to overwrite it.')
    created_files.append(path)
    return store_version(db, document, content, f'{document.id}.pdf', actor, comment, snapshot=serialize(document))


def discard_files(paths):
    for path in paths:
        path.unlink(missing_ok=True)
        if path.parent.exists() and not any(path.parent.iterdir()):
            path.parent.rmdir()
