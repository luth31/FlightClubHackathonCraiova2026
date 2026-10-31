import uuid

from sqlalchemy import desc, select, text

from app.contracts.models import AmendmentDraft
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import can_read, has_role
from app.documents.service import get_document
from app.documents.models import Document
from app.people.models import User


def can_author_proposal(user, contract):
    # Approval-only delegation does not grant permission to draft amendments.
    return bool(
        user.active and can_read(user, contract)
        and (has_role(user, 'director') or (
            has_role(user, 'reviewer') and user.department == contract.department
        ))
    )


def can_propose_amendment(user, contract):
    return bool(
        contract.category == 'Contract' and contract.validated
        and contract.status in ('approved', 'signed')
        and can_author_proposal(user, contract)
    )


def get_contract(db, user, contract_id):
    contract = get_document(db, contract_id, user)
    if contract.category != 'Contract':
        raise DomainError('Contractul de bază nu a fost găsit.', 404)
    return contract


def require_drafting_authority(user, contract):
    if not can_author_proposal(user, contract):
        raise DomainError('Propunerea este în responsabilitatea departamentului contractului sau a directorului.', 403)
    if contract.status not in ('approved', 'signed') or not contract.validated:
        raise DomainError('Propunerile se înregistrează pentru un contract validat, aprobat sau semnat.', 409)


def generated_document(db, draft):
    return db.get(Document, draft.generated_document_id) if draft.generated_document_id else None


def generated_document_editable(db, draft):
    if not draft.generated_document_id:
        return True
    document = generated_document(db, draft)
    return bool(document and document.status == 'draft' and not document.validated)


def generated_draft(db, document):
    return db.scalar(select(AmendmentDraft).where(AmendmentDraft.generated_document_id == document.id))


def generated_pdf_is_current(db, document):
    draft = generated_draft(db, document)
    if not draft:
        return True
    contract = db.get(Document, draft.contract_id)
    return bool(
        contract and contract.airport_id == document.airport_id
        and contract.status in ('approved', 'signed') and contract.validated
        and contract.version == draft.source_version
        and draft.revision == draft.generated_revision
        and document.version == draft.generated_document_version
    )


def require_current_generated_pdf(db, document):
    # Review must apply to the current saved proposal and its source contract.
    if not generated_pdf_is_current(db, document):
        raise DomainError('Acest PDF nu mai corespunde propunerii și contractului de bază. Verifică propunerea și PDF-ul curent înainte de avizare.', 409)


def require_manual_revision_allowed(db, document):
    if generated_draft(db, document):
        raise DomainError('Acest PDF este generat dintr-o propunere. Editează ciorna actului adițional și regenerează PDF-ul.', 409)


def generated_amendment_info(db, user, document):
    draft = generated_draft(db, document)
    if not draft:
        return None
    contract = db.get(Document, draft.contract_id)
    readable = bool(contract and can_read(user, contract))
    return {
        'draft_id': draft.id,
        'contract_id': contract.id if readable else None,
        'contract_number': contract.number if readable else None,
        'revision': draft.revision,
        'generated_revision': draft.generated_revision,
        'pdf_outdated': draft.revision != draft.generated_revision or document.version != draft.generated_document_version,
        'source_changed': not contract or contract.version != draft.source_version,
        'current': generated_pdf_is_current(db, document),
    }


def serialize_draft(db, user, contract, draft):
    creator = db.get(User, draft.created_by)
    document = generated_document(db, draft)
    source_changed = draft.source_version != contract.version
    can_edit = (
        draft.status == 'draft' and not source_changed
        and can_propose_amendment(user, contract)
        and (draft.created_by == user.id or has_role(user, 'director'))
        and generated_document_editable(db, draft)
    )
    pdf_outdated = bool(document and (
        draft.generated_revision != draft.revision or document.version != draft.generated_document_version
    ))
    readable = bool(document and can_read(user, document))
    fields = (
        'id', 'contract_id', 'source_version', 'title', 'reason',
        'clause_reference', 'current_wording', 'proposed_wording',
        'proposed_effective_date', 'status', 'revision', 'created_by',
        'created_at', 'updated_at',
        'generated_document_id', 'generated_revision', 'generated_document_version',
    )
    return {
        **{field: getattr(draft, field) for field in fields},
        'contract_number': contract.number,
        'created_by_name': creator.name if creator else draft.created_by,
        'can_edit': bool(can_edit),
        'source_changed': source_changed,
        'generated_document_status': document.status if readable else None,
        'pdf_outdated': pdf_outdated,
        'can_generate_pdf': bool(can_edit and (not draft.generated_document_id or pdf_outdated)),
        'document_url': f'#document/{document.id}' if readable else None,
        'pdf_file_url': f'/api/documents/{document.id}/file?version={draft.generated_document_version}' if readable else None,
    }


def list_drafts(db, user, contract_id):
    contract = get_contract(db, user, contract_id)
    drafts = db.scalars(select(AmendmentDraft).where(
        AmendmentDraft.contract_id == contract.id,
    ).order_by(desc(AmendmentDraft.updated_at), desc(AmendmentDraft.id))).all()
    return {
        'items': [serialize_draft(db, user, contract, draft) for draft in drafts],
        'total': len(drafts),
    }


def form_values(payload):
    return payload.model_dump(mode='json', exclude={'source_version', 'revision'})


def create_draft(db, user, contract_id, payload):
    db.execute(text('BEGIN IMMEDIATE'))
    contract = get_contract(db, user, contract_id)
    require_drafting_authority(user, contract)
    if payload.source_version != contract.version:
        raise DomainError('Contractul de bază s-a schimbat. Reîncarcă documentul înainte de a propune modificări.', 409)
    timestamp = now()
    draft = AmendmentDraft(
        id='amendment-' + uuid.uuid4().hex,
        contract_id=contract.id, source_version=contract.version,
        created_by=user.id, created_at=timestamp, updated_at=timestamp,
        revision=1, status='draft', **form_values(payload),
    )
    db.add(draft)
    record(db, user, 'Propunere de act adițional creată', contract,
        f'Propunere {draft.id} · revizia 1 · contract versiunea {contract.version}')
    db.commit()
    return serialize_draft(db, user, contract, draft)


def update_draft(db, user, contract_id, draft_id, payload):
    db.execute(text('BEGIN IMMEDIATE'))
    contract = get_contract(db, user, contract_id)
    draft = db.get(AmendmentDraft, draft_id)
    if not draft or draft.contract_id != contract.id:
        raise DomainError('Propunerea nu a fost găsită.', 404)
    require_drafting_authority(user, contract)
    if draft.created_by != user.id and not has_role(user, 'director'):
        raise DomainError('Doar autorul propunerii sau directorul poate modifica această ciornă.', 403)
    if draft.status != 'draft':
        raise DomainError('Propunerea nu mai poate fi modificată ca ciornă.', 409)
    if draft.source_version != contract.version:
        raise DomainError('Contractul de bază s-a schimbat. Pornește o propunere nouă pe versiunea curentă.', 409)
    if payload.revision != draft.revision:
        raise DomainError('Propunerea a fost modificată de un coleg. Reîncarcă formularul înainte de salvare.', 409)
    if not generated_document_editable(db, draft):
        raise DomainError('PDF-ul propunerii a fost validat sau trimis spre avizare. Ciorna nu mai poate fi modificată în acest stadiu.', 409)
    values = form_values(payload)
    if all(getattr(draft, field) == value for field, value in values.items()):
        return serialize_draft(db, user, contract, draft)
    # Saving proposal text never updates the base contract or its PDF versions.
    for field, value in values.items():
        setattr(draft, field, value)
    draft.revision += 1
    draft.updated_at = now()
    record(db, user, 'Propunere de act adițional actualizată', contract,
        f'Propunere {draft.id} · revizia {draft.revision} · contract versiunea {draft.source_version}')
    db.commit()
    return serialize_draft(db, user, contract, draft)
