"""One cache per file hash/pipeline, shared by search, evidence and AI consumers."""
import time
from sqlalchemy import select
from app.core.exceptions import DomainError
from app.documents.models import Document, DocumentVersion
from app.extraction.engine import PIPELINE
from app.extraction.models import Extraction


def key(sha256):
    return f'{sha256}:{PIPELINE}'


def enqueue(db, version, document=None):
    item = db.get(Extraction, key(version.sha256))
    if not item:
        item = Extraction(id=key(version.sha256), sha256=version.sha256, pipeline=PIPELINE,
                          source_path=version.file_path, status='queued', created_at=time.time(), attempts=0)
        db.add(item)
        db.flush()
    if document:
        document.extra = {**document.extra, 'extraction_status': item.status}
        if item.status == 'ready': apply_result(document, item)
    return item


def backfill(db):
    # Also runs on an existing installation. Durable cache rows prevent reparsing
    # empty scans on every startup. Only current document versions are scheduled.
    for doc, version in db.execute(select(Document, DocumentVersion).join(
        DocumentVersion, (DocumentVersion.document_id == Document.id) &
        (DocumentVersion.version == Document.version))):
        enqueue(db, version, doc)
    db.commit()


def apply_result(doc, item):
    from app.documents.service import evidence_from_text, suggested_values
    result = item.result
    doc.searchable_text = result['text']
    extra = {**doc.extra, 'extraction_status': 'ready', 'page_count': len(result['pages']),
             'ocr_pages': result['ocr_pages'], 'extraction_notice':
             'Texte extrase local. Verifică valorile în documentul original.'}
    # Background completion must never replace human-approved or edited fields.
    if not doc.validated and doc.status == 'draft' and doc.created_by != 'seed':
        evidence = evidence_from_text([p['text'] for p in result['pages']])
        for e in evidence:
            p = result['pages'][e['page']-1]
            e['method'] = p['method'] + '+pattern'
            e['confidence'] = None  # A rule match is not a calibrated probability.
        extra['extraction_evidence'] = evidence
        for field, value in suggested_values(evidence).items():
            if field not in extra.get('edited_fields', []) and getattr(doc, field) is None:
                setattr(doc, field, value)
    doc.extra = extra


def publish(db, item):
    # Join against CURRENT versions under the worker's write lock. A slow job for
    # v1 cannot index or alter v2 if v2 contains a different PDF.
    docs = db.scalars(select(Document).join(DocumentVersion,
        (DocumentVersion.document_id == Document.id) & (DocumentVersion.version == Document.version)
    ).where(DocumentVersion.sha256 == item.sha256)).all()
    for doc in docs:
        if item.status == 'ready': apply_result(doc, item)
        else: doc.extra = {**doc.extra, 'extraction_status': item.status}


def summary(db, version):
    item = db.get(Extraction, key(version.sha256))
    result = item.result if item and item.result else {}
    return {'status': item.status if item else 'queued', 'source_version': version.version,
            'source_sha256': version.sha256, 'pipeline': PIPELINE,
            'page_count': len(result.get('pages', [])), 'ocr_pages': result.get('ocr_pages', 0),
            'elapsed_ms': result.get('elapsed_ms'), 'error': item.error if item else None}


def cached_result(db, version):
    item = db.get(Extraction, key(version.sha256))
    if not item or item.status != 'ready':
        raise DomainError('Textul documentului se procesează local. Revino după finalizarea extragerii.', 409)
    return item.result


def retry(db, version, document):
    item = enqueue(db, version)
    if item.status == 'failed':
        item.status = 'queued'
        item.error = None
        item.attempts = 0
        item.token = None
        item.source_path = version.file_path
        document.extra = {**document.extra, 'extraction_status': 'queued'}
    db.commit()
    return summary(db, version)
