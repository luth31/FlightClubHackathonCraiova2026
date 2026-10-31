import os
import json
import tempfile
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

TEST_ROOT=Path(tempfile.mkdtemp(prefix='aerodesk-tests-'))
os.environ['AERODESK_DATABASE_URL']=f'sqlite:///{TEST_ROOT}/test.db'
os.environ['AERODESK_STORAGE_DIR']=str(TEST_ROOT/'storage')
os.environ['AERODESK_CORPUS_DIR']=str(TEST_ROOT/'corpus')
os.environ['AERODESK_AIRPORT_ID']='dunarea'
os.environ['AERODESK_EXTRACTION_ENABLED']='false'
os.environ['AERODESK_AIRPORT_NAME']='Aeroportul Dunărea'
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
    response=client.post('/api/auth/login',json={'user_id':'admin','password':'AeroDesk2026!'})
    assert response.status_code==200,response.text
    return client

@pytest.fixture
def db():
    with SessionLocal() as session: yield session

@pytest.fixture
def pdf_bytes():
    return (corpus/'pdfs'/'test-contract.pdf').read_bytes()

def login(client,user='admin'):
    response=client.post('/api/auth/login',json={'user_id':user,'password':'AeroDesk2026!'})
    assert response.status_code==200,response.text
    return client
