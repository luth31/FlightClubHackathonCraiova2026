#!/usr/bin/env python3
"""Upload and sign the seven Demo PDFs as standalone register documents.

Run from the repository: python scripts/upload_demo_documents.py
Requires the airport API container to be running. No extra Python packages are
needed on the host; document services run inside the existing API container.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time


DOCUMENTS = [
    ('Demo_referat_necesitate.pdf', 'necessity', 'DEMO-NEC-001'),
    ('Demo_caiet_sarcini.pdf', 'specifications', 'DEMO-CS-001'),
    ('Demo_contract.pdf', 'contract', 'DEMO-CON-001'),
    ('Demo_document_livrare.pdf', 'inbound_delivery', 'DEMO-LIV-001'),
    ('Demo_raport_servicii.pdf', 'service_report', 'DEMO-SRV-001'),
    ('Demo_proces_verbal_receptie.pdf', 'acceptance', 'DEMO-PVR-001'),
    ('Demo_factura.pdf', 'invoice', 'DEMO-FAC-001'),
]
COMMENT = 'Pregătire automată a PDF-urilor Demo pentru asociere ulterioară la un dosar.'
REPORT_PREFIX = 'DEMO_UPLOAD_REPORT='


def run_inside(config):
    from sqlalchemy import select, text
    from app.config import settings
    from app.core.signing import verify_file
    from app.database import SessionLocal
    from app.documents import service as documents
    from app.documents.models import Document
    from app.people.models import User
    from app.procurement import catalog
    from app.procurement.models import ProcurementCaseDocument
    from app.tasks import service as tasks
    from app.workflows.service import apply_action

    if settings.airport_id != config['airport']:
        raise RuntimeError('The selected container belongs to a different airport.')
    with SessionLocal() as db:
        uploader = db.get(User, config['uploader'])
        if not uploader or not uploader.active or uploader.airport_id != settings.airport_id:
            raise RuntimeError('The uploader must be an active account in this airport.')

    def act(ident, action):
        with SessionLocal() as db:
            doc = db.get(Document, ident)
            kind = {'validate': 'validation', 'approve': 'approval', 'sign': 'signature'}.get(action)
            task = tasks.current_task(db, doc, kind) if kind else None
            actor = db.get(User, task.assigned_to if task else config['uploader'])
            if not actor or not actor.active:
                raise RuntimeError(f'{action}: no active assigned person for {doc.title}.')
            name = actor.name
            apply_action(db, actor, ident, action, COMMENT, expected_version=doc.version)
            print(f'  {action}: {name}', flush=True)

    report = []
    for entry in config['documents']:
        content = base64.b64decode(entry['content'], validate=True)
        digest = hashlib.sha256(content).hexdigest()
        if digest != entry['sha256']:
            raise RuntimeError(f"File integrity mismatch: {entry['filename']}")
        marker = f"standalone-demo-v1:{entry['template']}:{digest}"
        with SessionLocal() as db:
            # Serialize the lookup and creation so concurrent runs cannot make
            # duplicate standalone documents. Already attached copies stay intact.
            db.execute(text('BEGIN IMMEDIATE'))
            taken = set(db.scalars(select(ProcurementCaseDocument.document_id)))
            matching = [doc for doc in db.scalars(select(Document).where(
                Document.airport_id == settings.airport_id,
                Document.created_by == config['uploader']).order_by(Document.created_at.desc()))
                if doc.id not in taken and doc.extra.get('demo_register_import') == marker
                and documents.current_version(db, doc).sha256 == digest]
            doc = matching[0] if matching else None
            if doc is None:
                uploader = db.get(User, config['uploader'])
                template = catalog.get_template(entry['template'])
                doc = documents.create_document(db, uploader, content, entry['filename'],
                    Path(entry['filename']).stem, template['category'], 'Achiziții',
                    procurement_template=entry['template'], auto_extract=True, commit=False)
                doc.extra = {**doc.extra, 'demo_register_import': marker,
                    'tags': ['Demo', 'Pregătit pentru dosar']}
                db.commit()
                print(f"Uploaded {entry['filename']} ({doc.id})", flush=True)
            else:
                print(f"Reusing {entry['filename']} ({doc.id})", flush=True)
            ident = doc.id

        deadline = time.monotonic() + config['timeout']
        while True:
            with SessionLocal() as db:
                doc = db.get(Document, ident)
                status = doc.extra.get('extraction_status')
                if status == 'ready':
                    errors = catalog.document_errors(doc, entry['template'])
                    if errors:
                        raise RuntimeError(f"{entry['filename']}: {' '.join(errors)}")
                    if doc.number != entry['number']:
                        raise RuntimeError(f"{entry['filename']}: extracted document number differs from the Demo PDF.")
                    break
                if status == 'failed':
                    raise RuntimeError(f"Extraction failed for {entry['filename']}; retry extraction in the app.")
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Extraction timed out for {entry['filename']}. Rerun the script when it completes.")
            time.sleep(0.5)

        # Each call records the actual assigned person and enforces the existing
        # permission, metadata, version and file-integrity checks.
        with SessionLocal() as db:
            doc = db.get(Document, ident)
            state, validated = doc.status, doc.validated
        if state == 'draft':
            if not validated:
                act(ident, 'validate')
            act(ident, 'submit')
            state = 'in_review'
        if state == 'in_review':
            act(ident, 'approve')
            state = 'approved'
        if state == 'approved':
            act(ident, 'sign')

        with SessionLocal() as db:
            doc = db.get(Document, ident)
            version = documents.current_version(db, doc)
            attached = db.scalar(select(ProcurementCaseDocument.id).where(
                ProcurementCaseDocument.document_id == ident))
            if doc.status != 'signed' or attached or not version.signed_path:
                raise RuntimeError(f'{doc.title}: document is not signed and available for association.')
            signature = verify_file(version.signed_path, version.signer_id, version.certificate_fingerprint)
            if not signature['integrity'] or documents.file_hash(version.signed_path) != version.signed_sha256:
                raise RuntimeError(f'{doc.title}: signature integrity verification failed.')
            report.append({'id': ident, 'title': doc.title, 'number': doc.number,
                'template': entry['template'], 'status': doc.status, 'version': doc.version,
                'approved_by': version.approved_by, 'signed_by': version.signer_id,
                'signature_verified': True, 'attached_to_case': False})
            print(f'  Signed and available in the register: {doc.title}', flush=True)
    print(REPORT_PREFIX + json.dumps(report, ensure_ascii=False), flush=True)


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--airport', choices=['craiova', 'sibiu'], default='craiova')
    parser.add_argument('--folder', type=Path, default=root / 'data/pdfs/Demo')
    parser.add_argument('--uploader', default='admin', help='Active uploader account ID (default: admin).')
    parser.add_argument('--timeout', type=int, default=180, help='Extraction wait per PDF, in seconds.')
    parser.add_argument('--dry-run', action='store_true', help='List the PDFs without changing the app.')
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    entries = []
    for filename, template, number in DOCUMENTS:
        content = (args.folder / filename).read_bytes()
        if not content.startswith(b'%PDF-') or len(content) > 25 * 1024 * 1024:
            raise RuntimeError(f'Invalid or oversized PDF: {filename}')
        entries.append({'filename': filename, 'template': template, 'number': number,
            'sha256': hashlib.sha256(content).hexdigest(),
            'content': base64.b64encode(content).decode('ascii')})
    if args.dry_run:
        for entry in entries:
            print(f"{entry['filename']} -> {entry['template']} -> validate, approve, sign")
        print(f'{len(entries)} standalone documents; airport: {args.airport}. No changes made.')
        return
    config = {'airport': args.airport, 'uploader': args.uploader,
        'timeout': args.timeout, 'documents': entries}
    # Send both the script and PDFs over stdin: no container rebuild, shell
    # interpolation, user browser/session, or temporary copies are needed.
    source = Path(__file__).read_text(encoding='utf-8')
    source += '\nrun_inside(json.loads(' + repr(json.dumps(config)) + '))\n'
    process = subprocess.Popen(['docker', 'compose', 'exec', '-T', f'{args.airport}-api',
        'python', '-u', '-', '--inside'], cwd=root, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding='utf-8')
    output, _ = process.communicate(source)
    report = None
    for line in output.splitlines():
        if line.startswith(REPORT_PREFIX):
            report = json.loads(line[len(REPORT_PREFIX):])
        else:
            print(line)
    if process.returncode:
        raise RuntimeError('Upload/signing stopped. Completed documents are retained; rerun to resume.')
    if report is None or len(report) != len(DOCUMENTS):
        raise RuntimeError('The container did not return a complete upload report.')
    target = root / '.runtime/procurement-register' / f'{args.airport}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\nReady: {len(report)} signed PDFs in the register, with no dosar associations.')
    print(f'Report: {target}')


if __name__ == '__main__' and '--inside' not in sys.argv:
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        sys.exit(1)
