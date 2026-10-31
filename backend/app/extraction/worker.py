"""SQLite-backed background worker. The CPU work runs outside the API process."""
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from sqlalchemy import select, text, or_, and_
from app.config import settings
from app.database import SessionLocal
from app.extraction.models import Extraction
from app.extraction.service import publish

log = logging.getLogger(__name__)
JOB_TIMEOUT = 300
LEASE_SECONDS = JOB_TIMEOUT + 60
MAX_ATTEMPTS = 3


def claim():
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        while True:
            item = db.scalar(select(Extraction).where(or_(Extraction.status == 'queued', and_(
                Extraction.status == 'processing', Extraction.started_at < time.time()-LEASE_SECONDS
            ))).order_by(Extraction.created_at.desc()).limit(1))
            if not item: return None
            if item.attempts >= MAX_ATTEMPTS:
                item.status = 'failed'
                item.error = 'Procesarea a fost întreruptă repetat. Poți reîncerca.'
                publish(db, item)
                db.commit()
                db.execute(text('BEGIN IMMEDIATE'))
                continue
            break
        item.token = uuid.uuid4().hex
        item.status = 'processing'
        item.started_at = time.time()
        item.attempts += 1
        db.commit()
        return item.id, item.token, item.source_path, item.sha256


def run_one():
    claimed = claim()
    if not claimed: return False
    job_id, token, path, digest = claimed
    result = error = None
    try:
        with tempfile.TemporaryDirectory(prefix='aerodesk-extraction-') as directory:
            output = Path(directory) / 'result.json'
            # Whitelist environment: the parser process has no OpenAI key. Its
            # only inputs are a local PDF and the bundled Romanian/English models.
            env = {k: v for k, v in os.environ.items() if k in ('PATH', 'SYSTEMROOT', 'LANG', 'TMPDIR')}
            env['OMP_THREAD_LIMIT'] = '1'
            subprocess.run([sys.executable, '-m', 'app.extraction.engine', path, digest,
                            str(settings.tessdata_dir), str(output)],
                           cwd=Path(__file__).resolve().parents[2], env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           check=True, timeout=JOB_TIMEOUT)
            if output.stat().st_size > 100 * 1024 * 1024: raise ValueError('result-too-large')
            result = json.loads(output.read_text(encoding='utf-8'))
    except subprocess.TimeoutExpired:
        error = 'Procesarea a depășit 5 minute. Împarte documentul în fișiere mai mici și reîncearcă.'
    except Exception:
        error = 'Extragerea locală nu a reușit. Verifică PDF-ul și modelele OCR, apoi reîncearcă.'
        log.warning('Local extraction failed for job %s', job_id[:12])
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        item = db.get(Extraction, job_id)
        # A reclaimed job must not be overwritten by its previous worker.
        if not item or item.token != token or item.status != 'processing': return True
        item.result = result
        item.error = error
        item.status = 'failed' if error else 'ready'
        item.completed_at = time.time()
        item.token = None
        publish(db, item)
        db.commit()
    return True


def drain():
    """Deterministic maintenance/test entry point; not called by HTTP requests."""
    while run_one(): pass


def start():
    stop = threading.Event()
    def loop():
        while not stop.is_set():
            try:
                worked = run_one()
            except Exception:
                log.exception('Background extraction worker will retry')
                worked = False
            stop.wait(.05 if worked else .5)
    thread = threading.Thread(target=loop, name='document-extraction', daemon=True)
    thread.start()
    return stop, thread
