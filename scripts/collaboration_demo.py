"""Local four-airport demo. The loopback relay is not a production VPN/mTLS gateway."""
import argparse
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import httpx

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'.runtime'/'collaboration-demo'
AIRPORTS={'craiova':'Aeroportul Craiova','sibiu':'Aeroportul Sibiu','cluj':'Aeroportul Cluj','iasi':'Aeroportul Iași'}
IDS=list(AIRPORTS)
PASSWORD='FlyLeaf2026!'
NAMES={
 'craiova':['Ana Ionescu','Mihai Dumitrescu','Elena Popa','Radu Marinescu','Ioana Stancu','Sorin Pavel','Andrei Neagu'],
 'sibiu':['Alexandru Mureșan','Mihai Popescu','Elena Stan','Radu Pop','Irina Luca','Ioana Rusu','Robert Ionescu'],
 'cluj':['Mara Georgescu','Daria Marin','Teodora Dobre','Paul Rusu','Diana Pavel','Vlad Munteanu','Matei Luca'],
 'iasi':['Andrei Constantinescu','Cristina Matei','Oana Dumitru','Dan Pavel','Laura Tudor','Victor Ilie','Mihnea Radu'],
}


def environments():
    urls={key:f'http://127.0.0.1:{5184+index}' for index,key in enumerate(IDS)}
    nodes=[]
    for index,key in enumerate(IDS):
        folder=RUNTIME/key;folder.mkdir(parents=True,exist_ok=True)
        token=folder/'gateway-token'
        if not token.exists():token.write_text(secrets.token_urlsafe(48),encoding='utf-8')
        # Preserve the already-running Craiova workspace and its documents.
        existing=ROOT/'.runtime'/'qa.db'
        database=existing if key=='craiova' and existing.exists() else folder/'airport.db'
        storage=ROOT/'.runtime'/'qa-storage' if database==existing else folder/'storage'
        env={'FLYLEAF_AIRPORT_ID':key,'FLYLEAF_AIRPORT_NAME':AIRPORTS[key],
            'FLYLEAF_AUTH_MODE':'demo','FLYLEAF_COOKIE_SECURE':'false',
            'FLYLEAF_DATABASE_URL':'sqlite:///'+database.as_posix(),
            'FLYLEAF_STORAGE_DIR':str(storage),'FLYLEAF_CORPUS_DIR':str(ROOT/'data'),
            'FLYLEAF_SEED_DOCUMENTS':'true' if key=='craiova' else 'false',
            'FLYLEAF_EXTRACTION_ENABLED':'true',
            'FLYLEAF_EXCHANGE_URL':'', 'FLYLEAF_EXCHANGE_TOKEN_FILE':str(token),
            'FLYLEAF_EXCHANGE_PEERS':json.dumps({other:f'http://127.0.0.1:8030/{key}/{other}' for other in IDS if other!=key}),
            'FLYLEAF_DEMO_LOGIN_TARGET':'http://127.0.0.1:8030',
            'FLYLEAF_CORS_ORIGINS':json.dumps([urls[key],urls[key].replace('127.0.0.1','localhost')]),
            'FLYLEAF_API_PROXY_TARGET':f'http://127.0.0.1:{8014+index}'}
        nodes.append({'id':key,'name':AIRPORTS[key],'api_port':8014+index,'web_port':5184+index,'url':urls[key],'env':env})
    return nodes


def seed(identifier):
    node=next(n for n in environments() if n['id']==identifier)
    os.environ.update(node['env']);sys.path.insert(0,str(ROOT/'backend'));os.chdir(ROOT/'backend')
    from alembic import command
    from alembic.config import Config
    from app.main import app  # registers all models
    from app.seed import seed as seed_workspace
    from app.database import SessionLocal
    from app.people.models import User, Session
    from app.people.names import split_name
    from app.collaboration import participation
    from app.collaboration.schemas import ParticipationRequest
    from app.core.audit import record
    from sqlalchemy import delete
    from demo_documents import install_demo_documents
    marker=RUNTIME/identifier/'initialized.json'
    command.upgrade(Config('alembic.ini'),'head');seed_workspace()
    with SessionLocal() as db:
        if not marker.exists():
            for uid,name in zip(('admin','manager','reviewer','finance','hr','technical-head','technician'),NAMES[identifier]):
                person=db.get(User,uid);person.name=name
                for key,value in split_name(name).items():setattr(person,key,value)
                person.email=f'{uid}@{identifier}.example'
            # Retire sessions created through the former automatic password fallback, once only.
            db.execute(delete(Session));db.commit()
            director=db.get(User,'admin')
            revision=participation.snapshot(db,director)['revision']
            participation.update(db,director,ParticipationRequest(enabled=identifier!='iasi',revision=revision))
            record(db,director,'Scenariu demo inițializat',detail='Patru aeroporturi fictive; trei participante și Iași dezactivat.')
        # Upgrade only by adding new originals. Existing approved files, shares,
        # accounts, sessions and participation settings are never rewritten.
        install_demo_documents(db,identifier,node['env']['FLYLEAF_STORAGE_DIR'])
        db.commit()
    if not marker.exists():marker.write_text(json.dumps({'airport':identifier,'seeded':True}),encoding='utf-8')


def relay():
    from demo_login import authenticate
    nodes={n['id']:n for n in environments()}
    tokens={key:Path(n['env']['FLYLEAF_EXCHANGE_TOKEN_FILE']).read_text().strip() for key,n in nodes.items()}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def answer(self,status,body=b'',content_type='application/json',cookies=()):
            self.send_response(status);self.send_header('Content-Type',content_type)
            self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)))
            for cookie in cookies:self.send_header('Set-Cookie',cookie)
            self.end_headers();self.wfile.write(body)
        def do_POST(self):
            if self.path!='/auth/login':return self.answer(405)
            origin=self.headers.get('Origin')
            allowed={f'http://{host}:{node["web_port"]}' for node in nodes.values() for host in ('127.0.0.1','localhost')}
            if origin and origin not in allowed:return self.answer(403)
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<=0 or length>16384:return self.answer(413)
                if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.answer(415)
                payload=json.loads(self.rfile.read(length))
                hostname=urlsplit('http://'+self.headers.get('Host','')).hostname
                status,result,cookies=authenticate(nodes,payload,hostname)
                self.answer(status,json.dumps(result,ensure_ascii=False).encode('utf-8'),cookies=cookies)
            except (ValueError,UnicodeError):self.answer(400)
        def do_PATCH(self):self.answer(405)
        do_DELETE=do_PATCH
        def do_GET(self):
            path=urlsplit(self.path)
            match=re.fullmatch(r'/(craiova|sibiu|cluj|iasi)/(craiova|sibiu|cluj|iasi)/outgoing/(collaboration|shares(?:/share-[A-Za-z0-9-]+/file)?)',path.path)
            if not match:return self.answer(404)
            source,target,route=match.groups()
            if source==target or self.headers.get('Origin') or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+tokens[source]):
                return self.answer(403)
            headers={key:self.headers.get(key,'') for key in ('X-Requester-Id','X-Requester-Roles','X-Requester-Department')}
            headers.update({'Authorization':'Bearer '+tokens[target],'X-Peer-Airport':source})
            try:
                response=httpx.get(f'http://127.0.0.1:{nodes[target]["api_port"]}/api/exchange/{route}'+('?' +path.query if path.query else ''),
                    headers=headers,timeout=8,follow_redirects=False)
                self.answer(response.status_code,response.content,response.headers.get('Content-Type','application/json'))
            except httpx.HTTPError:self.answer(503,b'{"detail":"Demo peer unavailable"}')
    print('Local demo relay listening on 127.0.0.1:8030',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8030),Handler).serve_forever()


def bootstrap():
    from demo_documents import document_ids
    marker=RUNTIME/'conversations.json'
    upgrade_marker=RUNTIME/'document-scenario-2026-02.json'
    if marker.exists() and upgrade_marker.exists():return
    clients={}
    def send(airport,path,body=None):
        response=clients[airport].request('POST' if body is not None else 'GET','/api'+path,json=body)
        response.raise_for_status();return response.json()
    try:
        for node in environments():
            client=httpx.Client(base_url=f'http://127.0.0.1:{node["api_port"]}',timeout=30);clients[node['id']]=client
            for attempt in range(40):
                try:
                    if client.get('/api/health').status_code==200:break
                except httpx.HTTPError:pass
                time.sleep(.25)
            send(node['id'],'/auth/login',{'user_id':'admin','password':PASSWORD})
        def message(source,target,subject,body,key,category='request',share_id=None):
            return send(source,'/collaboration',{'recipient_airport_id':target,'recipient_user_id':'admin',
                'subject':subject,'body':body,'category':category,'share_id':share_id,'idempotency_key':key})
        def find_thread(source,target,subject):
            return next((item for item in send(source,'/collaboration')['requests']
                if item['requester_airport_id']==source and item['recipient_airport_id']==target
                and item['subject']==subject),None)
        def reviewed_copy(source,document_id,target='craiova'):
            # Reuse the grant after an interrupted bootstrap so retries keep the same payload.
            existing=send(source,'/shares')['items']
            grant=next((item for item in existing if item['document_id']==document_id
                and item['recipient_airport_id']==target and item['status']=='active'),None)
            if grant:return grant
            preview=send(source,f'/documents/{document_id}/share-preview',{'redact_terms':[]})
            return send(source,f'/documents/{document_id}/shares',{'preview_id':preview['preview_id'],
                'reviewed':True,'expires_at':'2030-12-31','recipient_airport_id':target})
        reception_subject='Model pentru recepția serviciilor de mentenanță'
        cluj_subject='Șablon verificat pentru recepția mentenanței'
        if not marker.exists():
            message('craiova','sibiu',reception_subject,
                'Aveți un exemplu verificat care include piesele înlocuite? Vrem să îl adaptăm și să îl aprobăm local.','demo-craiova-sibiu-request')
            message('sibiu','craiova','Cum verificați solicitările de schimbare a IBAN-ului?',
                'Căutăm experiență privind confirmarea independentă a modificărilor. Discutăm numai controlul administrativ, fără datele unui caz real.',
                'demo-sibiu-craiova-problem','problem')
            if not find_thread('cluj','craiova',cluj_subject):
                grant=reviewed_copy('cluj',document_ids('cluj')['reception'])
                message('cluj','craiova',cluj_subject,'Vă transmit modelul de proces-verbal pentru recepția serviciilor de mentenanță. Include piesele înlocuite, verificările și responsabilitățile de recepție. Îl puteți adapta și aproba local.',
                    'demo-cluj-craiova-document-v2','document',grant['id'])
            closed=message('craiova','cluj','Checklist pentru verificarea documentelor unei facturi',
                'Ne-ar ajuta un exemplu al câmpurilor verificate înainte de aprobare.','demo-craiova-cluj-resolved')
            send('cluj','/collaboration')
            send('cluj',f'/collaboration/{closed["id"]}/messages',{'body':'Verificăm referința contractului, recepția serviciului, suma și aprobările.','idempotency_key':'demo-cluj-checklist-reply'})
            send('craiova',f'/collaboration/{closed["id"]}/status',{'status':'resolved','idempotency_key':'demo-craiova-checklist-closed'})
            marker.write_text(json.dumps({'seeded':True}),encoding='utf-8')

        # Add the actual model to an already existing conversation. New originals
        # and appended messages preserve the evidence and hashes of the old demo.
        request=find_thread('craiova','sibiu',reception_subject)
        if not request:raise RuntimeError('The Craiova–Sibiu reception request is missing; no existing history was modified.')
        send('sibiu','/collaboration')
        detail=send('sibiu',f'/collaboration/{request["id"]}')
        grant=reviewed_copy('sibiu',document_ids('sibiu')['reception'])
        if not any(item.get('attachment',{}).get('share_id')==grant['id'] for item in detail['messages'] if item.get('attachment')):
            if not detail['can_reply']:
                print('Document scenario upgrade deferred: the original reception conversation no longer accepts replies.',flush=True)
                return
            send('sibiu',f'/collaboration/{request["id"]}/messages',{'body':
                'Bună, Ana,\n\nAm atașat modelul de proces-verbal, revizia 02, în format PDF (2 pagini). '
                'La secțiunea 03 am separat denumirea piesei, cantitatea și valoarea opțională, pentru a putea urmări ulterior costurile. '
                'Pagina a doua păstrează verificările, eventualele remedieri și persoanele care confirmă recepția.\n\n'
                'Îl puteți adapta la circuitul vostru și aproba local înainte de utilizare.\n\nAlexandru Mureșan',
                'share_id':grant['id'],'idempotency_key':'demo-sibiu-reception-pdf-v2'})
        cluj=find_thread('cluj','craiova',cluj_subject)
        if cluj:
            cluj_detail=send('cluj',f'/collaboration/{cluj["id"]}')
            cluj_grant=reviewed_copy('cluj',document_ids('cluj')['reception'])
            if cluj_detail['can_reply'] and not any(item.get('attachment',{}).get('share_id')==cluj_grant['id']
                    for item in cluj_detail['messages'] if item.get('attachment')):
                send('cluj',f'/collaboration/{cluj["id"]}/messages',{'body':
                    'Atașez formularul complet, revizia 02: lucrări executate și piese înlocuite pe prima pagină; verificări, remedieri și confirmarea recepției pe pagina a doua. Câmpurile se adaptează și se aprobă în aeroportul vostru.',
                    'share_id':cluj_grant['id'],'idempotency_key':'demo-cluj-reception-pdf-v2'})
        for _ in range(2):
            for identifier in IDS:send(identifier,'/collaboration')
        upgrade_marker.write_text(json.dumps({'seeded':True,'sibiu_request_id':request['id'],'sibiu_share_id':grant['id'],
            'revision':'2026-02'},ensure_ascii=False),encoding='utf-8')
        print('Demo conversations and reviewed two-page PDF attachments ready.',flush=True)
    finally:
        for client in clients.values():client.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','seed','gateway','bootstrap']);parser.add_argument('airport',nargs='?')
    args=parser.parse_args()
    if args.command=='prepare':
        (RUNTIME/'network.json').write_text(json.dumps(environments(),ensure_ascii=False,indent=2),encoding='utf-8')
        print(RUNTIME/'network.json')
    elif args.command=='seed':seed(args.airport)
    elif args.command=='gateway':relay()
    else:bootstrap()
