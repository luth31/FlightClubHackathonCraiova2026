import os
import json
import tempfile
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

TEST_ROOT=Path(tempfile.mkdtemp(prefix='flyleaf-tests-'))
os.environ['FLYLEAF_DATABASE_URL']=f'sqlite:///{TEST_ROOT}/test.db'
os.environ['FLYLEAF_STORAGE_DIR']=str(TEST_ROOT/'storage')
os.environ['FLYLEAF_CORPUS_DIR']=str(TEST_ROOT/'corpus')
os.environ['FLYLEAF_AIRPORT_ID']='craiova'
os.environ['FLYLEAF_EXTRACTION_ENABLED']='false'
os.environ['FLYLEAF_AIRPORT_NAME']='Aeroportul Craiova'
from reportlab.pdfgen import canvas
corpus=TEST_ROOT/'corpus'; (corpus/'pdfs').mkdir(parents=True)
records=[]
for id,title,category,department,status,confidentiality in [
 ('test-contract','Contract mentenanta scari','Contract','Achiziții','approved','internal'),
 ('test-review','Contract servicii electrice','Contract','Achiziții','in_review','internal'),
 ('test-hr','Dosar personal confidential','Resurse umane','Resurse umane','approved','restricted'),
 ('test-tech','Raport mentenanta SP-02','Raport de mentenanță','Tehnic','approved','internal'),
 ('test-procedure','Procedura documentelor','Procedură','Conformitate','approved','public')]:
 path=corpus/'pdfs'/f'{id}.pdf'
 c=canvas.Canvas(str(path));c.drawString(50,780,title);c.drawString(50,750,'Furnizor: Exemplu Tehnic SRL');c.drawString(50,720,'SecretAccount123');c.drawString(50,690,'Date fictive pentru demonstratie');c.save()
 records.append({'id':id,'title':title,'category':category,'department':department,'status':status,'confidentiality':confidentiality,'filename':path.name,'created_at':'2026-10-01','expires_at':'2026-11-15','supplier':'Exemplu Tehnic SRL','value':1000,'summary':title,'metadata':{'supplier_iban':'RO49AAAA1B31007593840000','supplier_contact':'contracte@exemplu.example','demo_iban_valid_checksum':True},'owner':'Ioana Stancu' if department=='Resurse umane' else 'Elena Popa'})
(corpus/'seed-manifest.json').write_text(json.dumps({'documents':records}))
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.people.models import User,Delegation

@pytest.fixture
def client():
    with TestClient(app) as c:
        from app.extraction.worker import drain
        drain()
        yield c

@pytest.fixture
def admin(client):
    response=client.post('/api/auth/login',json={'user_id':'admin','password':'FlyLeaf2026!'})
    assert response.status_code==200,response.text
    return client

@pytest.fixture
def db():
    with SessionLocal() as session: yield session

@pytest.fixture
def pdf_bytes():
    return (corpus/'pdfs'/'test-contract.pdf').read_bytes()

def login(client,user='admin'):
    response=client.post('/api/auth/login',json={'user_id':user,'password':'FlyLeaf2026!'})
    assert response.status_code==200,response.text
    return client


@pytest.fixture
def collaboration_enabled(client, db):
    """Existing document-sharing tests explicitly opt in to the new workspace."""
    from app.collaboration.models import CollaborationParticipation
    row = db.get(CollaborationParticipation, 'craiova')
    previous = row.enabled if row else None
    if row is None:
        row = CollaborationParticipation(airport_id='craiova', enabled=True)
        db.add(row)
    row.enabled = True
    db.commit()
    yield
    db.rollback()
    if previous is None:
        db.delete(row)
    else:
        row.enabled = previous
    db.commit()
