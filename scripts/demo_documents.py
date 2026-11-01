"""Readable administrative templates for the local collaboration demonstration."""
from pathlib import Path
import hashlib

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak


AIRPORT_NAMES = {'craiova': 'Aeroportul Craiova', 'sibiu': 'Aeroportul Sibiu',
    'cluj': 'Aeroportul Cluj', 'iasi': 'Aeroportul Iași'}
REVISION = '2026-02'
INK = colors.HexColor('#17394A')
MUTED = colors.HexColor('#576D77')
TEAL = colors.HexColor('#167B73')
RULE = colors.HexColor('#CDD9DD')
PALE = colors.HexColor('#EFF5F6')
WIDTH = A4[0] - 84


def _fonts():
    if 'FlyLeafDoc' in pdfmetrics.getRegisteredFontNames():
        return
    candidates = [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]
    regular, bold = next(((regular, bold) for regular, bold in candidates if regular.exists() and bold.exists()), (None, None))
    if not regular:
        raise RuntimeError('The Romanian demo PDFs require Arial or DejaVu Sans TrueType fonts.')
    pdfmetrics.registerFont(TTFont('FlyLeafDoc', str(regular)))
    pdfmetrics.registerFont(TTFont('FlyLeafDoc-Bold', str(bold)))
    pdfmetrics.registerFontFamily('FlyLeafDoc', normal='FlyLeafDoc', bold='FlyLeafDoc-Bold', italic='FlyLeafDoc', boldItalic='FlyLeafDoc-Bold')


def _styles():
    return {
        'title': ParagraphStyle('title', fontName='FlyLeafDoc-Bold', fontSize=21, leading=25, textColor=INK, spaceAfter=9),
        'body': ParagraphStyle('body', fontName='FlyLeafDoc', fontSize=9, leading=13, textColor=INK),
        'small': ParagraphStyle('small', fontName='FlyLeafDoc', fontSize=8, leading=11, textColor=MUTED),
        'section': ParagraphStyle('section', fontName='FlyLeafDoc-Bold', fontSize=10, leading=14, textColor=TEAL, spaceBefore=16, spaceAfter=7),
        'cell': ParagraphStyle('cell', fontName='FlyLeafDoc', fontSize=8.3, leading=11.5, textColor=INK),
        'head': ParagraphStyle('head', fontName='FlyLeafDoc-Bold', fontSize=8, leading=11, textColor=INK),
        'check': ParagraphStyle('check', fontName='FlyLeafDoc', fontSize=9, leading=12, textColor=INK, alignment=TA_CENTER),
    }


def _p(text, style='body'):
    return Paragraph(text, _styles()[style])


def _section(number, text):
    return _p(f'{number:02d} &nbsp; {text}', 'section')


def _table(headers, rows, widths, heights=None):
    data = [[_p(item, 'head') for item in headers]]
    data.extend([[_p(str(item), 'cell') for item in row] for row in rows])
    table = Table(data, colWidths=widths, rowHeights=heights, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PALE),
        ('GRID', (0, 0), (-1, -1), .5, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return table


def _fields(rows):
    data = [[_p(f'<b>{label}</b><br/>{value}', 'cell') for label, value in row] for row in rows]
    table = Table(data, colWidths=[WIDTH / len(rows[0])] * len(rows[0]), hAlign='LEFT')
    table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), .5, RULE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    return table


def _note(text):
    table = Table([[_p(text, 'small')]], colWidths=[WIDTH])
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE),
        ('BOX', (0, 0), (-1, -1), .5, RULE), ('LEFTPADDING', (0, 0), (-1, -1), 11),
        ('RIGHTPADDING', (0, 0), (-1, -1), 11), ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
    return table


def _chrome(airport, code):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(INK)
        canvas.setFont('FlyLeafDoc-Bold', 10)
        canvas.drawString(42, A4[1] - 40, AIRPORT_NAMES[airport].upper())
        canvas.setFont('FlyLeafDoc', 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(A4[0] - 42, A4[1] - 40, 'ȘABLON ADMINISTRATIV')
        canvas.setStrokeColor(TEAL)
        canvas.setLineWidth(1.5)
        canvas.line(42, A4[1] - 51, A4[0] - 42, A4[1] - 51)
        canvas.setFont('FlyLeafDoc', 7.7)
        canvas.drawString(42, A4[1] - 67, f'{code}   /   Revizia 02   /   01.11.2026')
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(.5)
        canvas.line(42, 49, A4[0] - 42, 49)
        canvas.setFont('FlyLeafDoc', 7)
        canvas.drawString(42, 36, 'FlyLeaf · Exemplu demonstrativ · Adaptare și aprobare locală înainte de utilizare')
        canvas.drawRightString(A4[0] - 42, 36, f'{doc.page} / 2')
        canvas.restoreState()
    return draw


def reception_template(path, airport):
    """Two-page blank form, deliberately containing no real signatures or operational data."""
    _fonts()
    blank = '........................................................................'
    story = [
        _p('Proces-verbal de recepție<br/>servicii de mentenanță', 'title'),
        _p('Model pentru documentarea lucrării executate, a pieselor înlocuite și a rezultatului recepției. Se completează pentru fiecare intervenție.', 'small'),
        _section(1, 'Referințe și identificare'),
        _fields([
            [('Număr proces-verbal', blank), ('Data recepției', '........ / ........ / ................')],
            [('Contract / comandă de lucru', blank), ('Furnizor / prestator', blank)],
            [('Echipament / utilaj', blank), ('Număr de inventar / identificator', blank)],
            [('Loc de desfășurare a lucrării', blank), ('Perioada intervenției', 'De la ........................ până la ........................')],
        ]),
        _section(2, 'Lucrări executate'),
        _table(['Nr.', 'Operațiune / serviciu', 'Constatare și rezultat', 'Document suport'],
            [[str(i), '', '', ''] for i in range(1, 4)], [28, 166, 184, WIDTH - 378], [28, 34, 34, 34]),
        _section(3, 'Piese și materiale înlocuite'),
        _table(['Denumire / cod piesă', 'Cant.', 'U.M.', 'Valoare*', 'Observații / trasabilitate'],
            [['', '', '', '', ''] for _ in range(3)], [163, 43, 43, 74, WIDTH - 323], [28, 32, 32, 32]),
        Spacer(1, 7),
        _p('* Opțional: valoarea se înscrie împreună cu moneda și referința documentului justificativ. Câmpul nu înlocuiește verificarea facturii.', 'small'),
        Spacer(1, 12),
        _p('<b>Anexe:</b> [ ] fișă de intervenție &nbsp; [ ] raport / probe &nbsp; [ ] documente piese &nbsp; [ ] altele: ................', 'small'),
        PageBreak(),
        _p('Verificare și rezultat<br/>al recepției', 'title'),
        _p('Continuarea procesului-verbal nr. ................................ din ................................', 'small'),
        _section(4, 'Verificări documentate'),
        _table(['Element verificat', 'Da', 'Nu', 'N/A'], [
            ['Operațiunile executate sunt identificate în documentele anexate.', '[ ]', '[ ]', '[ ]'],
            ['Piesele și cantitățile înlocuite sunt înregistrate la secțiunea 03.', '[ ]', '[ ]', '[ ]'],
            ['Rezultatul probelor / verificărilor aplicabile este consemnat.', '[ ]', '[ ]', '[ ]'],
            ['Diferențele față de comandă sunt explicate și documentate.', '[ ]', '[ ]', '[ ]'],
            ['Anexele necesare circuitului intern sunt disponibile.', '[ ]', '[ ]', '[ ]'],
        ], [WIDTH - 114, 38, 38, 38]),
        _section(5, 'Decizie și eventuale remedieri'),
        _p('[ ] Recepție acceptată &nbsp;&nbsp; [ ] Acceptată cu rezerve &nbsp;&nbsp; [ ] Recepție neacceptată'),
        Spacer(1, 9),
        _table(['Observație / măsură solicitată', 'Responsabil', 'Termen / confirmare'],
            [['', '', ''], ['', '', '']], [WIDTH - 230, 115, 115], [28, 38, 38]),
        Spacer(1, 8),
        _p('Documentul consemnează recepția serviciilor. Autorizarea utilizării echipamentului urmează procedurile locale aplicabile.', 'small'),
        _section(6, 'Persoane care confirmă recepția'),
        _table(['Rol', 'Nume și funcție', 'Data', 'Semnătură'], [
            ['Reprezentant beneficiar', '', '', ''],
            ['Reprezentant prestator', '', '', ''],
            ['Responsabil verificare', '', '', ''],
        ], [133, 171, 76, WIDTH - 380], [28, 31, 31, 31]),
        Spacer(1, 13),
        _note('<b>Pentru reutilizare:</b> adaptați câmpurile și responsabilitățile la organizarea aeroportului. Verificați formularul și aprobați-l local înainte de introducerea în circuit.'),
    ]
    document = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=42, rightMargin=42,
        topMargin=88, bottomMargin=62, title='Proces-verbal de recepție servicii de mentenanță',
        author=AIRPORT_NAMES[airport], subject='Șablon administrativ demonstrativ · fără date operaționale reale')
    chrome = _chrome(airport, 'MENT / PV-RECEPȚIE')
    document.build(story, onFirstPage=chrome, onLaterPages=chrome)


def invoice_checklist(path, airport):
    _fonts()
    blank = '........................................................................'
    story = [
        _p('Fișă de verificare<br/>documente de factură', 'title'),
        _p('Model de colectare a referințelor și de urmărire a documentelor necesare circuitului intern de verificare. Se completează înainte de înaintare.', 'small'),
        _section(1, 'Identificarea dosarului'),
        _fields([
            [('Număr fișă / data verificării', blank), ('Responsabil dosar / departament', blank)],
            [('Furnizor', blank), ('Factură: număr / data emiterii', blank)],
            [('Contract / comandă asociată', blank), ('Valoare / monedă', blank)],
            [('Serviciu / bun facturat', blank), ('Perioadă / dată de livrare', blank)],
        ]),
        _section(2, 'Documente și concordanțe de verificat'),
        _table(['Verificare', 'Referință / observație', 'Da', 'Nu', 'N/A'], [
            ['Contractul / comanda este identificat(ă).', '', '[ ]', '[ ]', '[ ]'],
            ['Documentul de recepție este disponibil.', '', '[ ]', '[ ]', '[ ]'],
            ['Serviciul și perioada corespund recepției.', '', '[ ]', '[ ]', '[ ]'],
            ['Cantitățile și valorile au documente suport.', '', '[ ]', '[ ]', '[ ]'],
            ['Piesele / materialele sunt identificate, dacă este cazul.', '', '[ ]', '[ ]', '[ ]'],
            ['Avizele interne necesare sunt atașate.', '', '[ ]', '[ ]', '[ ]'],
            ['Eventualele diferențe sunt explicate.', '', '[ ]', '[ ]', '[ ]'],
        ], [213, WIDTH - 309, 32, 32, 32]),
        Spacer(1, 16),
        _note('Bifați <b>N/A</b> numai pentru elementele care nu se aplică și explicați motivul în coloana de observații. Această fișă nu reprezintă o aprobare de plată.'),
        PageBreak(),
        _p('Clarificări și circuit<br/>de validare', 'title'),
        _p('Continuarea fișei nr. ................................ pentru factura nr. ................................', 'small'),
        _section(3, 'Documente lipsă și clarificări solicitate'),
        _table(['Document / clarificare', 'Solicitat de la', 'Termen', 'Primit / închis la'],
            [['', '', '', ''] for _ in range(4)], [213, 112, 76, WIDTH - 401], [28, 39, 39, 39, 39]),
        _section(4, 'Starea dosarului'),
        _p('[ ] Pregătit pentru circuitul intern de validare<br/>[ ] În așteptarea documentelor / clarificărilor din secțiunea 03<br/>[ ] Retrimis pentru completare'),
        Spacer(1, 10),
        _fields([[('Observație pentru următorul responsabil', blank + '<br/>' + blank),
                  ('Persoana / departamentul destinatar', blank + '<br/>Data înaintării: ................................')]]),
        _section(5, 'Trasabilitatea verificării'),
        _table(['Etapă', 'Nume / funcție', 'Data', 'Semnătură / referință'], [
            ['Pregătirea documentelor', '', '', ''],
            ['Verificare administrativă', '', '', ''],
            ['Înaintare în circuit', '', '', ''],
        ], [139, 141, 76, WIDTH - 356], [28, 33, 33, 33]),
        Spacer(1, 17),
        _note('<b>Control separat:</b> solicitările de modificare a datelor bancare se verifică prin procedura locală și un canal de contact confirmat independent. Nu se validează o modificare doar pe baza acestui formular sau a unui mesaj primit.'),
    ]
    document = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=42, rightMargin=42,
        topMargin=88, bottomMargin=62, title='Fișă de verificare documente de factură',
        author=AIRPORT_NAMES[airport], subject='Șablon administrativ demonstrativ · fără date financiare reale')
    chrome = _chrome(airport, 'FIN / VERIFICARE-DOSAR')
    document.build(story, onFirstPage=chrome, onLaterPages=chrome)


def document_ids(airport):
    return {'reception': f'demo-{airport}-reception-{REVISION}',
        'invoice': f'demo-{airport}-invoice-checklist-{REVISION}'}


def install_demo_documents(db, airport, storage):
    """Add new immutable sample originals; never rewrite an already shared PDF."""
    from app.core.audit import now
    from app.documents.models import Document, DocumentVersion
    from app.people.models import User
    ids = document_ids(airport)
    definitions = [
        ('reception', 'Proces-verbal de recepție servicii de mentenanță', 'MENT-PV-02', reception_template,
            'Formular de recepție cu lucrări executate, piese înlocuite, verificări, remedieri și semnături.'),
        ('invoice', 'Fișă de verificare documente de factură', 'FIN-VD-02', invoice_checklist,
            'Checklist pentru colectarea documentelor de factură, clarificări și urmărirea circuitului intern.'),
    ]
    for kind, title, number, generate, summary in definitions:
        identifier = ids[kind]
        if db.get(Document, identifier):
            continue
        folder = Path(storage) / 'documents' / identifier
        folder.mkdir(parents=True, exist_ok=True)
        filename = ('Proces-verbal-receptie-mentenanta' if kind == 'reception' else 'Checklist-verificare-factura') + f'-{airport.title()}-rev02.pdf'
        path = folder / filename
        generate(path, airport)
        stamp = now()
        db.add(Document(id=identifier, title=title, number=f'{airport.upper()}-{number}', category='Procedură',
            department='Conformitate', status='approved', created_at=stamp, updated_at=stamp,
            owner=db.get(User, 'reviewer').name, owner_id='reviewer', created_by='admin', confidentiality='public',
            summary=summary, searchable_text=summary, validated=True, airport_id=airport,
            extra={'filename': filename, 'tags': ['demo', 'șablon', 'colaborare'],
                'metadata': {'revision': '02', 'reference_date': '2026-11-01', 'demo': True}, 'related_ids': []}))
        db.flush()
        db.add(DocumentVersion(id=identifier + '-v1', document_id=identifier, version=1, file_path=str(path),
            filename=filename, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), created_at=stamp,
            created_by='admin', approved_by='reviewer', approved_at=stamp,
            comment='Șablon demonstrativ pregătit pentru partajare; aprobarea are loc în scenariul demo.', snapshot={}))
    return ids
