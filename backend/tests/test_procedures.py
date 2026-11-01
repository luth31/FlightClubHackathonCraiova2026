"""Contract tests for real procedure content, grounded AI, review and partner access."""
from copy import deepcopy
import fitz
import pytest
from sqlalchemy import delete, select
from app.documents.models import Document, DocumentVersion
from app.operations.models import StrategyAnalysis
from app.operations.procedures import engine
from app.operations.procedures.catalog import templates
from app.tasks.models import WorkflowTask
from conftest import login


@pytest.fixture(autouse=True)
def clear_analyses(client, db):
    db.execute(delete(StrategyAnalysis)); db.commit()


def result_for(payload):
    selected = next(e for e in payload['evidence'] if e['kind'] == 'gate_open' and e['delay_minutes'] > 0)
    refs = [e['event_id'] for e in payload['evidence'] if e['group_id'] == selected['group_id'] and e['kind'] in ('gate_open', 'departure')]
    base = deepcopy(next(item for item in templates() if item['code'] == 'SOP-GATE-01'))
    return {'summary': 'Deschiderea întârziată a porții se repetă; confirmarea din timp merită testată.',
        'limitations': ['Cauza se verifică împreună cu responsabilul rotației.'], 'recommendations': [{
            'kind': 'amend', 'sop_code': base['code'], 'title': 'Confirmarea agentului de rezervă înainte de deschiderea porții',
            'problem': 'Poarta s-a deschis după reperul planificat în rotațiile citate.',
            'rationale': 'Confirmarea mai devreme poate reduce timpul de căutare; ipoteza trebuie verificată.',
            'proposed_rule': 'Testați confirmarea agentului și rezervei cu zece minute înainte de deschidere.',
            'evidence_ids': refs, 'priority': 'high', 'owner': base['owner'],
            **{key: base[key] for key in ('purpose','trigger','prerequisites','steps','escalation','records','metrics')},
            'assumptions': ['Rezerva este disponibilă și calificată.'], 'risks': ['Nu se reduc controalele de siguranță.'],
            'pilot': 'Coordonatorul verifică două săptămâni de rotații și oprește pilotul la un risc nou.',
            'success_criteria': 'Scăderea deschiderilor întârziate față de două săptămâni comparabile, fără incidente.'}]}


def connect(monkeypatch):
    calls = []
    monkeypatch.setattr(engine.llm, 'configured', lambda: True)
    def respond(**kwargs):
        calls.append(kwargs)
        return result_for(kwargs['payload']), 'test-luna'
    monkeypatch.setattr(engine.llm, 'structured_response', respond)
    return calls


def test_library_has_complete_distinct_original_procedures(admin):
    result = admin.get('/api/operations/sops')
    assert result.status_code == 200
    data = result.json()
    assert len(data['items']) == 12
    assert len({item['code'] for item in data['items']}) == 12
    for item in data['items']:
        assert len(item['steps']) >= 5
        assert item['prerequisites'] and item['records'] and item['escalation'] and item['metrics'] and item['source_refs']
        assert all(step['when'] and step['owner'] and step['record'] and len(step['action']) > 20 for step in item['steps'])
    login(admin, 'technician')
    data = admin.get('/api/operations/sops').json()
    assert not data['can_draft'] and not data['can_share']
    assert admin.post('/api/operations/sops/SOP-GATE-01/draft').status_code == 403
    assert admin.post('/api/operations/strategy-analysis').status_code == 403


def test_template_draft_pdf_idempotence_and_workflow(admin, db):
    result = admin.post('/api/operations/sops/SOP-GATE-01/draft')
    assert result.status_code == 200, result.text
    identifier = result.json()['document_id']
    assert admin.post('/api/operations/sops/SOP-GATE-01/draft').json()['document_id'] == identifier
    doc = db.get(Document, identifier)
    assert doc.status == 'draft' and not doc.validated
    version = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == identifier))
    with fitz.open(version.file_path) as pdf:
        text = ''.join(page.get_text() for page in pdf)
        assert len(pdf) >= 2 and all(word in text for word in ('responsabilități', 'escaladare', 'Indicatori', 'Surse'))
    assert db.scalar(select(WorkflowTask).where(WorkflowTask.document_id == identifier)).type == 'validation'
    assert admin.post(f'/api/documents/{identifier}/share-preview', json={'redact_terms': []}).status_code == 409


def test_analysis_uses_actual_events_metrics_and_procedures_caches_and_grounds_numbers(admin, db, monkeypatch):
    calls = connect(monkeypatch)
    result = admin.post('/api/operations/strategy-analysis')
    assert result.status_code == 200, result.text
    analysis = result.json()['analysis']
    assert len(calls) == 1 and not result.json()['cached']
    payload = calls[0]['payload']
    assert payload['metrics']['completed_departures'] >= 56
    assert payload['procedures'] and payload['evidence']
    assert all(e['actual_at'] and 'actor' not in e and 'detail' not in e for e in payload['evidence'])
    assert 'Mara Stoica' not in str(payload)
    proposal = analysis['recommendations'][0]
    # Two milestone citations from one flight must NOT double count delay.
    assert proposal['impact']['completed_departures'] == 1
    assert proposal['impact']['observed_delay_minutes'] == proposal['evidence'][0]['flight_delay_minutes']
    assert proposal['impact']['estimated_savings'] is None
    repeat = admin.post('/api/operations/strategy-analysis')
    assert repeat.json()['cached'] and len(calls) == 1
    assert repeat.json()['analysis']['id'] == analysis['id']
    draft = admin.post(f"/api/operations/strategy-analysis/{analysis['id']}/recommendations/{proposal['id']}/draft")
    assert draft.status_code == 200, draft.text
    doc = db.get(Document, draft.json()['document_id'])
    assert doc.status == 'draft' and doc.extra['metadata']['analysis_id'] == analysis['id']
    assert doc.extra['metadata']['evidence'] == proposal['evidence']
    assert admin.get('/api/operations/strategy-analysis').json()['analysis']['recommendations'][0]['document_id'] == doc.id
    # Local tenant guard even if the attacker knows a valid recommendation ID.
    row = db.get(StrategyAnalysis, analysis['id']); row.airport_id = 'sibiu'; db.commit()
    assert admin.post(f"/api/operations/strategy-analysis/{analysis['id']}/recommendations/{proposal['id']}/draft").status_code == 404


def test_fabricated_evidence_rejected_and_failure_does_not_replace_good_analysis(admin, db, monkeypatch):
    calls = connect(monkeypatch)
    original = admin.post('/api/operations/strategy-analysis').json()['analysis']
    # Alter a real stored input to produce a new evidence fingerprint.
    admin.post('/api/operations/control', json={'action':'reset'})
    admin.post('/api/operations/control', json={'action':'advance_to','target_seconds':1500})
    def invalid(**kwargs):
        value = result_for(kwargs['payload']); value['recommendations'][0]['evidence_ids'] = ['invented-event']
        return value, 'test-luna'
    monkeypatch.setattr(engine.llm, 'structured_response', invalid)
    response = admin.post('/api/operations/strategy-analysis')
    assert response.status_code == 502, response.text
    assert admin.get('/api/operations/strategy-analysis').json()['analysis']['id'] == original['id']
    assert db.scalar(select(StrategyAnalysis).where(StrategyAnalysis.status == 'failed')) is not None


def test_new_procedure_creates_full_draft_and_joins_library(admin, monkeypatch):
    connect(monkeypatch)
    def novel(**kwargs):
        value = result_for(kwargs['payload']); value['recommendations'][0].update(kind='new', sop_code=None)
        return value, 'test-luna'
    monkeypatch.setattr(engine.llm, 'structured_response', novel)
    analysis = admin.post('/api/operations/strategy-analysis').json()['analysis']
    proposal = analysis['recommendations'][0]
    assert proposal['sop_code'].startswith('SOP-AI-')
    result = admin.post(f"/api/operations/strategy-analysis/{analysis['id']}/recommendations/{proposal['id']}/draft")
    assert result.status_code == 200
    assert any(item['code'] == proposal['sop_code'] for item in admin.get('/api/operations/sops').json()['items'])


def test_only_senior_roles_share_approved_sop_and_peer_access_revokes(admin, db, monkeypatch, tmp_path, collaboration_enabled):
    from test_exchange import gateway_headers
    # Another model avoids state from the earlier draft test; use the real review API.
    identifier = admin.post('/api/operations/sops/SOP-NET-11/draft').json()['document_id']
    for action in ('validate', 'submit'):
        response = admin.post(f'/api/documents/{identifier}/actions', json={'action': action, 'version': 1})
        assert response.status_code == 200, response.text
    login(admin, 'reviewer')
    approved = admin.post(f'/api/documents/{identifier}/actions', json={'action': 'approve', 'version': 1})
    assert approved.status_code == 200, approved.text
    login(admin, 'technician')
    assert admin.get(f'/api/documents/{identifier}').status_code == 200
    assert any(item['documents'] for item in admin.get('/api/operations/sops').json()['items'] if item['code'] == 'SOP-NET-11')
    doc = db.get(Document, identifier)
    doc.confidentiality = 'restricted'; db.commit()
    assert admin.get(f'/api/documents/{identifier}').status_code == 404
    doc.confidentiality = 'internal'; db.commit()
    login(admin, 'reviewer')
    from app.extraction.worker import drain
    drain()
    preview = admin.post(f'/api/documents/{identifier}/share-preview', json={'redact_terms': []})
    assert preview.status_code == 200, preview.text
    body = {'preview_id': preview.json()['preview_id'], 'reviewed': True, 'expires_at': '2026-12-31', 'recipient_airport_id': 'sibiu'}
    for actor in ('technician', 'manager', 'finance'):
        login(admin, actor)
        assert admin.post(f'/api/documents/{identifier}/share-preview', json={'redact_terms': []}).status_code == 403
        assert admin.post(f'/api/documents/{identifier}/shares', json=body).status_code == 403
    login(admin, 'reviewer')
    shared = admin.post(f'/api/documents/{identifier}/shares', json=body)
    assert shared.status_code == 201, shared.text
    headers = gateway_headers(monkeypatch, tmp_path)
    share_id = shared.json()['id']
    download = admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers)
    assert download.status_code == 200 and download.content.startswith(b'%PDF')
    assert admin.post(f'/api/shares/{share_id}/revoke').status_code == 200
    assert admin.get(f'/api/exchange/shares/{share_id}/file', headers=headers).status_code == 403


def test_new_approved_pdf_is_used_instead_of_old_structured_steps(admin, db, monkeypatch):
    import io
    from reportlab.pdfgen import canvas
    from app.extraction.worker import drain
    calls = connect(monkeypatch)
    identifier = admin.post('/api/operations/sops/SOP-MET-08/draft').json()['document_id']
    out = io.BytesIO(); pdf = canvas.Canvas(out)
    pdf.drawString(50,750,'LOCAL WEATHER REVISION TWO - notify the shift coordinator before replanning.'); pdf.save()
    response = admin.post(f'/api/documents/{identifier}/versions', files={'file':('revision-two.pdf',out.getvalue(),'application/pdf')})
    assert response.status_code == 201, response.text
    for action in ('validate','submit'):
        assert admin.post(f'/api/documents/{identifier}/actions',json={'action':action,'version':2}).status_code == 200
    login(admin,'reviewer')
    assert admin.post(f'/api/documents/{identifier}/actions',json={'action':'approve','version':2}).status_code == 200
    drain()
    response = admin.post('/api/operations/strategy-analysis')
    assert response.status_code == 200, response.text
    procedure = next(p for p in calls[0]['payload']['procedures'] if p['code'] == 'SOP-MET-08')
    assert procedure['document_version'] == 2 and procedure['document_id'] == identifier
    assert 'LOCAL WEATHER REVISION TWO' in procedure['current_document_text']
    assert procedure['steps'] == []


def test_running_snapshot_rejects_duplicate_call_and_is_visible_after_navigation(admin, db, monkeypatch):
    calls = connect(monkeypatch)
    analysis = admin.post('/api/operations/strategy-analysis').json()['analysis']
    row = db.get(StrategyAnalysis, analysis['id']); row.status = 'running'; db.commit()
    assert admin.get('/api/operations/strategy-analysis').json()['running'] is True
    assert admin.post('/api/operations/strategy-analysis').status_code == 409
    assert len(calls) == 1
