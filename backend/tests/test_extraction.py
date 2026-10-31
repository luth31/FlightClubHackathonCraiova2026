"""Exercise real local OCR, durable jobs, permission boundaries and scan redaction."""
import hashlib
import io
import time
import uuid
from pathlib import Path
import fitz
from reportlab.pdfgen import canvas
from sqlalchemy import select, text
from app.config import settings
from app.database import SessionLocal
from app.documents.models import Document, DocumentVersion
from app.extraction.models import Extraction
from app.extraction import service, worker
from app.extraction.engine import extract
from conftest import login
from test_workflows import act, assign_review


def pdf(lines=None, scan=False):
    stream=io.BytesIO(); c=canvas.Canvas(stream)
    for i,line in enumerate(lines or ['Archive '+uuid.uuid4().hex,'Furnizor: Example Local SRL','Elena Popa','Valoare: 12500 RON']):
        c.drawString(50,760-i*35,line)
    c.save();content=stream.getvalue()
    if scan:
        with fitz.open(stream=content,filetype='pdf') as original, fitz.open() as out:
            p=out.new_page(width=original[0].rect.width,height=original[0].rect.height)
            p.insert_image(p.rect,stream=original[0].get_pixmap(dpi=200).tobytes('png'))
            content=out.tobytes()
    return content


def upload_pending(admin, content):
    response=admin.post('/api/documents',files={'file':('local.pdf',content,'application/pdf')},data={'title':'Local extraction fixture','category':'Contract','department':'Achiziții'})
    assert response.status_code==201,response.text
    return response.json()['id']


def job_for(document_id):
    with SessionLocal() as db:
        d=db.get(Document,document_id)
        v=db.scalar(select(DocumentVersion).where(DocumentVersion.document_id==d.id,DocumentVersion.version==d.version))
        return db.get(Extraction,service.key(v.sha256))


def test_upload_queues_then_ocr_populates_metadata_and_search(admin):
    content=pdf(['LocalScanUniqueReference','Furnizor: Example Local SRL','Elena Popa','Valoare: 12500 RON'],scan=True)
    id=upload_pending(admin,content)
    before=admin.get(f'/api/documents/{id}/extraction').json()
    assert before['status']=='queued' and 'page' not in before
    assert admin.get(f'/api/documents/{id}').json()['supplier'] is None
    worker.drain()
    after=admin.get(f'/api/documents/{id}/extraction').json()
    assert after['status']=='ready' and after['ocr_pages']==1
    assert after['page']['method']=='ocr' and after['page']['confidence'] is None
    assert 'Elena Popa' in after['page']['text']
    doc=admin.get(f'/api/documents/{id}').json()
    assert doc['supplier']=='Example Local SRL' and doc['value']==12500
    assert not doc['validated'] and not doc['extraction_evidence'][0]['validated']
    assert id in {x['id'] for x in admin.get('/api/documents?q=LocalScanUniqueReference').json()['items']}
    assert admin.get(f'/api/documents/{id}/file').content==content


def test_duplicate_bytes_and_metadata_versions_reuse_cache(admin,monkeypatch):
    content=pdf();a=upload_pending(admin,content);worker.drain()
    first=job_for(a)
    monkeypatch.setattr(worker.subprocess,'run',lambda *a,**k: (_ for _ in ()).throw(AssertionError('cache missed')))
    b=upload_pending(admin,content)
    assert job_for(b).id==first.id and job_for(b).status=='ready'
    response=admin.patch(f'/api/documents/{a}',json={'supplier':None,'value':None})
    assert response.status_code==200 and response.json()['supplier'] is None
    assert response.json()['value'] is None
    assert job_for(a).attempts==1
    assert not worker.run_one()


def test_late_job_cannot_overwrite_new_pdf_or_manual_fields(admin):
    old=pdf(['RetiredVersionToken','Furnizor: Old Company SRL'])
    id=upload_pending(admin,old)
    with SessionLocal() as db:
        old_job=db.get(Extraction,job_for(id).id)
        old_job.status='processing';old_job.token='old-worker';old_job.started_at=time.time();db.commit()
        old_path=old_job.source_path
    new=pdf(['CurrentVersionToken','Furnizor: New Company SRL'])
    assert admin.post(f'/api/documents/{id}/versions',files={'file':('new.pdf',new,'application/pdf')}).status_code==201
    assert admin.patch(f'/api/documents/{id}',json={'supplier':'Human Verified SRL','value':None}).status_code==200
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        item=db.get(Extraction,service.key(hashlib.sha256(old).hexdigest()))
        item.result=extract(old_path,settings.tessdata_dir);item.status='ready';service.publish(db,item);db.commit()
    worker.drain()
    doc=admin.get(f'/api/documents/{id}').json()
    assert doc['supplier']=='Human Verified SRL' and doc['value'] is None
    assert id not in {d['id'] for d in admin.get('/api/documents?q=RetiredVersionToken').json()['items']}
    assert id in {d['id'] for d in admin.get('/api/documents?q=CurrentVersionToken').json()['items']}


def test_validated_metadata_not_replaced_by_background_result(admin):
    id=upload_pending(admin,pdf())
    assert act(admin,id,'validate').status_code==200
    worker.drain()
    d=admin.get(f'/api/documents/{id}').json()
    assert d['validated'] and d['supplier'] is None and d['extraction_evidence']==[]


def test_expired_worker_lease_is_reclaimed(admin):
    id=upload_pending(admin,pdf())
    with SessionLocal() as db:
        job=db.get(Extraction,job_for(id).id);job.status='processing';job.token='dead-worker';job.started_at=time.time()-worker.LEASE_SECONDS-1;job.attempts=1;db.commit()
    worker.drain()
    assert job_for(id).status=='ready' and job_for(id).attempts==2


def test_failed_parse_can_retry_without_reupload(admin,monkeypatch):
    id=upload_pending(admin,pdf())
    with monkeypatch.context() as patch:
        patch.setattr(worker.subprocess,'run',lambda *a,**kw: (_ for _ in ()).throw(RuntimeError('failure')))
        worker.drain()
    assert job_for(id).status=='failed'
    assert admin.post(f'/api/documents/{id}/extraction/retry').json()['status']=='queued'
    worker.drain()
    assert job_for(id).status=='ready'


def test_source_tampering_fails_closed(admin):
    id=upload_pending(admin,pdf());job=job_for(id);path=Path(job.source_path);original=path.read_bytes()
    path.write_bytes(pdf(['Tampered PDF']))
    worker.drain()
    assert job_for(id).status=='failed'
    assert admin.get(f'/api/documents/{id}/extraction').status_code==409
    path.write_bytes(original)


def test_cached_text_endpoint_obeys_hr_and_technician_boundaries(client):
    login(client,'manager')
    assert client.get('/api/documents/test-hr/extraction').status_code==404
    login(client,'technician')
    assert client.get('/api/documents/test-tech/extraction').status_code==403


def test_no_hundred_page_truncation_and_hybrid_routing(tmp_path):
    with fitz.open() as doc:
        for i in range(101):
            p=doc.new_page();p.insert_text((40,80),f'Page {i+1} UniqueLastPageToken' if i==100 else f'Page {i+1} Native document text')
        path=tmp_path/'long.pdf';doc.save(path)
    result=extract(path,settings.tessdata_dir)
    assert len(result['pages'])==101 and 'UniqueLastPageToken' in result['text']
    with fitz.open(stream=pdf(scan=True),filetype='pdf') as scan, fitz.open(stream=pdf(),filetype='pdf') as native:
        scan[0].insert_text((30,30),'Digital header')
        native.insert_pdf(scan);path=tmp_path/'hybrid.pdf';native.save(path)
    result=extract(path,settings.tessdata_dir)
    assert [p['method'] for p in result['pages']]==['native','ocr']
    assert 'Elena Popa' in result['pages'][1]['text']


def test_scan_redaction_removes_image_pixels_and_reuses_text(admin,tmp_path,monkeypatch):
    content=pdf(['Elena Popa','Keep this public information','Furnizor: Local Test SRL'],scan=True)
    id=upload_pending(admin,content);worker.drain()
    for action in ('validate','submit'): assert act(admin,id,action).status_code==200
    assign_review(admin,id);assert act(admin,id,'approve').status_code==200
    # Layout must read the persisted result, without reopening/parsing the PDF.
    from app.sharing import studio
    with monkeypatch.context() as patch:
        patch.setattr(studio.fitz,'open',lambda *a,**k: (_ for _ in ()).throw(AssertionError('reparse')))
        layout=admin.get(f'/api/documents/{id}/redaction-layout').json()
    selected=[w for w in layout['pages'][0]['words'] if w['text'] in ('Elena','Popa')]
    assert len(selected)==2
    binding={'source_version':layout['source_version'],'source_sha256':layout['source_sha256']}
    response=admin.post(f'/api/documents/{id}/share-preview',json={**binding,'word_ids':[w['id'] for w in selected]})
    assert response.status_code==200,response.text
    copy=admin.get(response.json()['file_url']).content
    with fitz.open(stream=copy,filetype='pdf') as result:
        p=result[0];tp=p.get_textpage_ocr(language='ron+eng',dpi=200,full=True,tessdata=str(settings.tessdata_dir))
        text=p.get_text(textpage=tp)
        assert 'Elena' not in text and 'Popa' not in text and 'public information' in text
        # Actual pixel change at each selected box, not just an invisible annotation.
        for w in selected:
            clip=fitz.Rect(w['rect']);pix=p.get_pixmap(clip=clip)
            assert pix.samples.count(255) < len(pix.samples)//2
    assert admin.get(f'/api/documents/{id}/file').content==content


def test_exhausted_lease_does_not_block_other_jobs(admin):
    next_id=upload_pending(admin,pdf())
    exhausted=upload_pending(admin,pdf())
    with SessionLocal() as db:
        item=db.get(Extraction,job_for(exhausted).id)
        item.status='processing';item.started_at=0;item.attempts=worker.MAX_ATTEMPTS;db.commit()
    worker.drain()
    assert job_for(exhausted).status=='failed'
    assert job_for(next_id).status=='ready'


def test_worker_losing_lease_cannot_publish(admin,monkeypatch):
    id=upload_pending(admin,pdf())
    job_id=job_for(id).id
    real_run=worker.subprocess.run
    def replaced(*args,**kwargs):
        result=real_run(*args,**kwargs)
        with SessionLocal() as db:
            item=db.get(Extraction,job_id);item.token='replacement-worker';item.started_at=0;db.commit()
        return result
    with monkeypatch.context() as patch:
        patch.setattr(worker.subprocess,'run',replaced)
        assert worker.run_one()
    item=job_for(id)
    assert item.status=='processing' and item.result is None and item.token=='replacement-worker'
    worker.drain()
    assert job_for(id).status=='ready'
