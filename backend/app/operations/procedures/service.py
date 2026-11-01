import hashlib
import json
from sqlalchemy import select, text
from app.config import settings
from app.core.audit import now, record
from app.core.exceptions import DomainError
from app.core.security import can_read, has_role, page_permissions
from app.documents.models import Document
from app.documents.service import store_version, serialize
from app.operations.procedures.catalog import templates, get_template
from app.operations.procedures.pdf import render
from app.operations import service as operations


def allowed(user):
    return has_role(user, 'director') or (has_role(user, 'reviewer') and user.department == 'Conformitate')


def require_editor(user):
    if not allowed(user):
        raise DomainError('Această acțiune aparține directorului sau responsabilului de conformitate.', 403)


def documents(db, user):
    return [doc for doc in db.scalars(select(Document).where(Document.airport_id == user.airport_id).order_by(Document.updated_at.desc()))
        if doc.extra.get('metadata', {}).get('sop_code') and can_read(user, doc)]


def library(db, user):
    operations.airport_for(user)
    docs = documents(db, user)
    def brief(doc):
        return {'id': doc.id, 'title': doc.title, 'status': doc.status, 'version': doc.version,
            'can_share': page_permissions(user)['sharing'] and doc.status in ('approved', 'signed'),
            'updated_at': doc.updated_at}
    items = []
    codes = set()
    for template in templates():
        codes.add(template['code'])
        linked = [doc for doc in docs if doc.extra['metadata']['sop_code'] == template['code']]
        items.append({**template, 'documents': [brief(doc) for doc in linked]})
    # New procedures suggested by Luna join the library once somebody creates a draft.
    for doc in docs:
        metadata = doc.extra['metadata']
        if metadata['sop_code'] not in codes and metadata.get('procedure'):
            codes.add(metadata['sop_code'])
            items.append({**metadata['procedure'], 'status': 'local', 'documents': [brief(d) for d in docs if d.extra['metadata']['sop_code'] == metadata['sop_code']]})
    return {'items': items, 'can_draft': allowed(user), 'can_share': page_permissions(user)['sharing'],
        'partner': {'id': 'sibiu' if user.airport_id == 'craiova' else 'craiova',
                    'name': 'Aeroportul Sibiu' if user.airport_id == 'craiova' else 'Aeroportul Craiova'},
        'notice': 'Modele de lucru; documentele aprobate și copiile partajate au propriul flux de avizare.'}


def create_document(db, user, procedure, *, key, proposal=None, metadata=None):
    require_editor(user)
    identifier = 'doc-procedure-' + hashlib.sha256(f'{user.airport_id}:{key}'.encode()).hexdigest()[:20]
    # Serialize only persistence, not LLM or PDF generation.
    existing = db.get(Document, identifier)
    if existing:
        if not can_read(user, existing): raise DomainError('Ciorna există deja în fluxul de avizare.', 403)
        return {'document_id': existing.id, 'status': existing.status, 'title': existing.title}
    content = render(procedure, settings.airport_name, proposal)
    db.commit(); db.execute(text('BEGIN IMMEDIATE'))
    existing = db.get(Document, identifier)
    if existing:
        if not can_read(user, existing): raise DomainError('Ciorna există deja în fluxul de avizare.', 403)
        db.commit()
        return {'document_id': existing.id, 'status': existing.status, 'title': existing.title}
    values = {'sop_code': procedure['code'], 'procedure': procedure, 'proposal_only': True, **(metadata or {})}
    doc = Document(id=identifier, title=procedure['code'] + ' · ' + procedure['title'], number=procedure['code'] + '-' + identifier[-6:].upper(),
        category='Procedură', department='Conformitate', status='draft', created_at=now(), updated_at=now(),
        owner=user.name, owner_id=user.id, created_by=user.id, confidentiality='internal', summary=procedure['purpose'],
        searchable_text=json.dumps(procedure, ensure_ascii=False), version=1, validated=False, airport_id=user.airport_id,
        extra={'filename': procedure['code'] + '.pdf', 'metadata': values, 'tags': ['SOP', procedure['area']],
               'related_ids': [], 'source_refs': procedure['source_refs']})
    db.add(doc); db.flush()
    store_version(db, doc, content, doc.extra['filename'], user, 'Procedură pentru validare locală și avizare.', snapshot=serialize(doc))
    from app.tasks.service import on_new_version
    on_new_version(db, doc, user)
    record(db, user, 'Ciornă SOP creată', doc, procedure['code'] + '; necesită validare și avizare înainte de partajare.')
    db.commit()
    return {'document_id': doc.id, 'status': doc.status, 'title': doc.title}


def draft_template(db, user, code):
    operations.airport_for(user)
    require_editor(user)
    procedure = get_template(code)
    if not procedure: raise DomainError('Modelul SOP nu există.', 404)
    return create_document(db, user, procedure, key='template:' + code + ':' + procedure['revision'])
