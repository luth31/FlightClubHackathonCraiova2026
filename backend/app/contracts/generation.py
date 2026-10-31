import uuid
from pathlib import Path

from sqlalchemy import text

from app.config import settings
from app.contracts import amendments
from app.contracts.models import AmendmentDraft
from app.contracts.pdf import render_amendment_pdf
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import has_role
from app.documents.models import Document
from app.documents.service import current_version, file_hash, serialize, store_version, validate_pdf
from app.people.models import User
from app.tasks.service import on_new_version


def generate_pdf(db, user, contract_id, draft_id, payload):
    db.execute(text('BEGIN IMMEDIATE'))
    contract = amendments.get_contract(db, user, contract_id)
    draft = db.get(AmendmentDraft, draft_id)
    if not draft or draft.contract_id != contract.id:
        raise DomainError('Propunerea nu a fost găsită.', 404)
    amendments.require_drafting_authority(user, contract)
    if draft.created_by != user.id and not has_role(user, 'director'):
        raise DomainError('Doar autorul propunerii sau directorul poate genera acest PDF.', 403)
    if draft.status != 'draft' or draft.source_version != contract.version:
        raise DomainError('Contractul de bază s-a schimbat sau propunerea nu mai este o ciornă.', 409)
    if payload.revision != draft.revision:
        raise DomainError('Propunerea s-a schimbat. Reîncarcă lista înainte de generarea PDF-ului.', 409)
    if not amendments.generated_document_editable(db, draft):
        raise DomainError('PDF-ul validat, trimis spre avizare, aprobat sau semnat nu poate fi regenerat.', 409)

    source = current_version(db, contract)
    source_path = Path(source.signed_path or source.file_path)
    if not source_path.is_file() or file_hash(source_path) != (source.signed_sha256 or source.sha256):
        raise DomainError('Integritatea contractului de bază nu poate fi confirmată.', 409)
    document = amendments.generated_document(db, draft)
    if document and not amendments.serialize_draft(db, user, contract, draft)['pdf_outdated']:
        # Repeated clicks reuse the existing PDF instead of creating duplicates.
        version = current_version(db, document)
        if not Path(version.file_path).is_file() or file_hash(version.file_path) != version.sha256:
            raise DomainError('PDF-ul generat nu mai corespunde amprentei înregistrate.', 409)
        return amendments.serialize_draft(db, user, contract, draft)

    number = document.number if document else f'AA-{settings.reference_date.year}-{uuid.uuid4().hex[:6].upper()}'
    content = render_amendment_pdf(contract, draft, settings.airport_name, number)
    texts = validate_pdf(content)
    timestamp = now()
    if not document:
        creator = db.get(User, draft.created_by)
        document = Document(
            id='doc-' + uuid.uuid4().hex[:12], title=draft.title, number=number,
            category='Act adițional', department=contract.department,
            status='draft', validated=False, version=1,
            created_at=timestamp, updated_at=timestamp,
            owner=creator.name, created_by=draft.created_by,
            supplier=contract.supplier, currency=contract.currency,
            value=None, expires_at=None, confidentiality=contract.confidentiality,
            airport_id=contract.airport_id, summary='', searchable_text='', extra={},
        )
        db.add(document)
        db.flush()
    else:
        previous = current_version(db, document)
        previous.snapshot = serialize(document)
        document.version += 1
        document.updated_at = timestamp
        document.title = draft.title

    # Store proposal terms on the addendum; never update the base agreement.
    document.searchable_text = '\n'.join(texts)
    document.summary = f'Proiect de act adițional pentru {contract.number}. Necesită validare și avizare.'
    document.extra = {
        'filename': f'{number}.pdf', 'tags': ['Propunere', 'Act adițional'],
        'related_ids': [contract.id], 'source_refs': [],
        'page_count': len(texts), 'extraction_status': 'generated-template',
        'extraction_evidence': [],
        'extraction_notice': 'PDF generat din ciorna salvată; conținutul necesită verificare umană.',
        'metadata': {
            'contract_id': contract.id, 'contract_number': contract.number,
            'source_version': draft.source_version, 'amendment_draft_id': draft.id,
            'amendment_revision': draft.revision,
            'clause_reference': draft.clause_reference,
            'proposed_effective_date': draft.proposed_effective_date,
        },
    }
    store_version(db, document, content, f'{number}.pdf', user,
        f'PDF generat din propunerea {draft.id}, revizia {draft.revision}.',
        snapshot=serialize(document))
    db.flush()
    draft.generated_document_id = document.id
    draft.generated_revision = draft.revision
    draft.generated_document_version = document.version
    draft.updated_at = timestamp
    db.flush()
    on_new_version(db, document, user)
    record(db, user, 'PDF de act adițional generat', document,
        f'Propunere {draft.id} · revizia {draft.revision} · contract {contract.number}, versiunea {draft.source_version}')
    record(db, user, 'PDF al propunerii generat', contract,
        f'Document {document.number} · versiunea PDF {document.version} · propunere {draft.id}, revizia {draft.revision}')
    db.commit()
    return amendments.serialize_draft(db, user, contract, draft)
