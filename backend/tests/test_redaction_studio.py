import io
import json
import fitz
import httpx
import pytest
from pydantic import SecretStr
from reportlab.pdfgen import canvas
from conftest import login
from app.config import settings
from app.llm import service as llm
from app.sharing import studio
from app.core.exceptions import DomainError
from test_workflows import approved


def repeat_pdf():
    stream=io.BytesIO();c=canvas.Canvas(stream)
    for page in range(2):
        c.drawString(50,750,'Elena Popa contact personal')
        c.drawString(50,710,'Elena Popa responsabil public')
        c.showPage()
    c.save();return stream.getvalue()


def setup_document(admin):
    id=approved(admin,repeat_pdf())
    data=admin.get(f'/api/documents/{id}/redaction-layout').json()
    return id,data,{'source_version':data['source_version'],'source_sha256':data['source_sha256']}


def test_exact_single_and_recurring_redaction_and_immutable_original(admin):
    id,data,binding=setup_document(admin)
    matches=admin.post(f'/api/documents/{id}/redaction-matches',json={**binding,'term':'Elena Popa'}).json()['items']
    assert len(matches)==4
    image=admin.get(f'/api/documents/{id}/redaction-pages/1',params=binding)
    assert image.status_code==200 and image.content.startswith(b'\x89PNG')
    def copy(ids):
        result=admin.post(f'/api/documents/{id}/share-preview',json={**binding,'word_ids':ids})
        assert result.status_code==200,result.text
        preview_image=admin.get(f'/api/share-previews/{result.json()["preview_id"]}/pages/1')
        assert preview_image.status_code==200 and preview_image.content.startswith(b'\x89PNG')
        assert admin.get(f'/api/share-previews/{result.json()["preview_id"]}/pages/999').status_code==404
        with fitz.open(stream=admin.get(result.json()['file_url']).content,filetype='pdf') as pdf:
            return '\n'.join(p.get_text() for p in pdf)
    assert copy(matches[0]['word_ids']).count('Elena Popa')==3
    assert copy([i for m in matches for i in m['word_ids']]).count('Elena Popa')==0
    with fitz.open(stream=admin.get(f'/api/documents/{id}/file').content,filetype='pdf') as pdf:
        assert '\n'.join(p.get_text() for p in pdf).count('Elena Popa')==4
    assert admin.post(f'/api/documents/{id}/share-preview',json={**binding,'word_ids':['p1-w99999']}).status_code==422
    assert admin.post(f'/api/documents/{id}/share-preview',json={'word_ids':matches[0]['word_ids']}).status_code==422
    assert admin.post(f'/api/documents/{id}/share-preview',json={**binding,'source_sha256':'0'*64,'word_ids':matches[0]['word_ids']}).status_code==409
    admin.patch(f'/api/documents/{id}',json={'title':'New source revision'})
    assert admin.post(f'/api/documents/{id}/redaction-analysis',json=binding).status_code==409
    assert admin.get(f'/api/documents/{id}/redaction-pages/1',params=binding).status_code==409


def answer(ids,refs=None):
    return {'summary':'Verifică scopul comunicării.','suggestions':[{'word_ids':ids,'category':'Date personale','reason':'Contactul personal nu este necesar pentru modelul reutilizabil.','legal_basis_ids':refs or ['gdpr-5'],'caution':'Verifică rolul public înainte de eliminare.'}]}


def test_ai_context_grounding_and_no_automatic_redaction(admin,monkeypatch):
    id,data,binding=setup_document(admin)
    ids=[w['id'] for w in data['pages'][0]['words'][:2]]
    seen={}
    def call(**kwargs):
        seen.update(kwargs)
        return answer(ids),'gpt-6-luna'
    monkeypatch.setattr(llm,'structured_response',call)
    r=admin.post(f'/api/documents/{id}/redaction-analysis',json={**binding,'context':'Model pentru partener','purpose':'Model reutilizabil'})
    assert r.status_code==200,r.text
    assert seen['payload']['context']=='Model pentru partener'
    assert seen['payload']['purpose']=='Model reutilizabil'
    assert 'untrusted' in seen['instructions']
    assert r.json()['suggestions'][0]['word_ids']==ids
    assert r.json()['source_sha256']==binding['source_sha256']
    assert all(b['url'].startswith('https://') for b in r.json()['legal_bases'])
    assert admin.get(f'/api/documents/{id}').json()['version']==binding['source_version']


def test_source_changed_while_luna_runs_is_rejected(admin,monkeypatch):
    id,data,binding=setup_document(admin)
    def call(**kwargs):
        assert admin.patch(f'/api/documents/{id}',json={'title':'Concurrent revision'}).status_code==200
        return answer([data['pages'][0]['words'][0]['id']]),'gpt-6-luna'
    monkeypatch.setattr(llm,'structured_response',call)
    assert admin.post(f'/api/documents/{id}/redaction-analysis',json=binding).status_code==409


@pytest.mark.parametrize('ids,refs', [(['p99-w0'],['gdpr-5']),(['p1-w0'],['invented-law']),(['p1-w0','p1-w2'],['gdpr-5']),(['p1-w0','p1-w0'],['gdpr-5'])])
def test_ungrounded_ai_output_fails_closed(admin,monkeypatch,ids,refs):
    id,_,binding=setup_document(admin)
    monkeypatch.setattr(llm,'structured_response',lambda **kw:(answer(ids,refs),'gpt-6-luna'))
    assert admin.post(f'/api/documents/{id}/redaction-analysis',json=binding).status_code==502


def test_access_before_external_call_and_key_unavailable(client,monkeypatch):
    monkeypatch.setattr(settings,'openai_api_key',SecretStr(''))
    login(client,'admin')
    id,_,binding=setup_document(client)
    assert client.post(f'/api/documents/{id}/redaction-analysis',json=binding).status_code==503
    login(client,'technician')
    for suffix in ('redaction-layout','redaction-pages/1'):
        assert client.get(f'/api/documents/{id}/{suffix}',params=binding).status_code in (403,404)
    assert client.post(f'/api/documents/{id}/redaction-analysis',json=binding).status_code in (403,404)
    login(client,'admin')
    assert client.get('/api/documents/test-hr/redaction-layout').status_code in (403,404)


def test_preview_render_owner_and_integrity(admin, collaboration_enabled):
    from pathlib import Path
    from app.database import SessionLocal
    from app.sharing.models import SharePreview
    id,_,binding=setup_document(admin)
    preview=admin.post(f'/api/documents/{id}/share-preview',json=binding).json()
    url=f'/api/share-previews/{preview["preview_id"]}/pages/1'
    login(admin,'reviewer')
    assert admin.get(url).status_code==404
    login(admin,'admin')
    with SessionLocal() as db:
        item=db.get(SharePreview,preview['preview_id'])
        Path(item.file_path).write_bytes(b'%PDF-tampered')
    assert admin.get(url).status_code==409
    assert admin.get(preview['file_url']).status_code==409


def test_responses_adapter_contract(monkeypatch):
    monkeypatch.setattr(settings,'openai_api_key',SecretStr('test-key-not-real'))
    captured={}
    def handler(request):
        captured.update(json.loads(request.content))
        assert str(request.url)=='https://api.openai.com/v1/responses'
        assert request.headers['authorization']=='Bearer test-key-not-real'
        return httpx.Response(200,json={'status':'completed','output':[{'type':'reasoning'},{'type':'message','content':[{'type':'output_text','text':json.dumps({'summary':'ok','suggestions':[]})}]}]})
    real_client=httpx.Client
    monkeypatch.setattr(llm.httpx,'Client',lambda **kw:real_client(transport=httpx.MockTransport(handler),**kw))
    result,model=llm.structured_response(instructions='instruction',payload={'context':'test'},schema=studio.Analysis.model_json_schema(),task='redaction')
    assert result['summary']=='ok' and model=='gpt-6-luna'
    assert captured['store'] is False and captured['text']['format']['strict'] is True
    assert captured['text']['format']['schema']['additionalProperties'] is False
    assert captured['model']=='gpt-6-luna'


@pytest.mark.parametrize('status,payload,expected',[(429,{},429),(401,{},502),(200,{'status':'incomplete'},502),(200,{'status':'completed','output':[{'type':'message','content':[{'type':'refusal'}]}]},422),(200,{'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'bad json'}]}]},502)])
def test_provider_failures_are_safe(monkeypatch,status,payload,expected):
    monkeypatch.setattr(settings,'openai_api_key',SecretStr('test-key-not-real'))
    real_client=httpx.Client
    monkeypatch.setattr(llm.httpx,'Client',lambda **kw:real_client(transport=httpx.MockTransport(lambda r:httpx.Response(status,json=payload)),**kw))
    with pytest.raises(DomainError) as error:
        llm.structured_response(instructions='test',payload={},schema={},task='redaction')
    assert error.value.status==expected
    assert 'test-key-not-real' not in error.value.message
