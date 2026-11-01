import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

function install(window){
  for(const name of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','CustomEvent','MouseEvent','FormData','Node','Element'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.ResizeObserver=class {observe(){} disconnect(){}};
}
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/sharing/Coordination.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {Coordination}=module.exports;
const sharingBundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/sharing/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const sharingModule={exports:{}};new Function('require','module','exports',sharingBundle.outputFiles[0].text)(createRequire(import.meta.url),sharingModule,sharingModule.exports);
const {SharingPage}=sharingModule.exports;initial.window.close();

const remoteContact={id:'remote-director',name:'Alexandru Mureșan',email:'director@sibiu.example',job_title:'Director aeroport',department:'Conducere',role:'director'};
const sender={...remoteContact,id:'admin',name:'Tyler Durden',email:'director@craiova.example'};
const base={unread:false,last_sequence:1,starred:false,archived:false,category:'request',requester_contact:sender,recipient_contact:remoteContact,id:'request-1',direction:'outgoing',subject:'Cum predați tura?',topic:'Proceduri',status:'open',created_at:'2026-11-01T08:00:00Z',updated_at:'2026-11-01T08:00:00Z',partner_name:'Aeroportul Sibiu',message_count:1,last_message:'Căutăm un model de predare a turei.',pending_delivery:false};
const message={id:'message-1',body:'Căutăm un model de predare a turei.',kind:'request',author_airport_id:'craiova',author_airport_name:'Aeroportul Craiova',author_role:'director',created_at:base.created_at,is_local:true,delivery:'received',attachment:null};
const share={id:'share-1',document_id:'doc-1',document_title:'Predarea turei — copie',source_version:2,recipient_airport:'Aeroportul Sibiu',recipient_airport_id:'sibiu',recipient_department:null,expires_at:'2026-12-01',created_at:base.created_at,status:'active'};
const doc={id:'doc-1',title:'Procedura predării turei',number:'SOP-1',category:'Procedură',department:'Operațiuni',status:'approved',version:2,tags:[],metadata:{},filename:'sop.pdf',related_ids:[],validated:true,created_at:base.created_at,file_url:'/api/documents/doc-1/file',permissions:{can_edit:false,can_review:false,can_sign:false,can_share:true}};

async function setup(t,{empty=false,connected=true,createFails=0,replyFails=0,incoming=false,attachmentStatus,documentCount=1,sharingPage=false,canCreate=true,participationEnabled=true,canManage=true,partners}={}){
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/#sharing',pretendToBeVisual:true});install(dom.window);
  const requests=empty?[]:[{...base,direction:incoming?'incoming':'outgoing'}];
  let detail={...base,direction:incoming?'incoming':'outgoing',connected,can_reply:true,can_resolve:!incoming,can_decline:incoming,messages:[{...message}]};
  if(attachmentStatus)detail.messages.push({...message,id:'message-attachment',body:'Procedura noastră',is_local:false,author_airport_name:'Aeroportul Sibiu',attachment:{share_id:'remote-share',title:'Model primit',source_airport_id:'sibiu',source_version:3,status:attachmentStatus,file_url:'/api/received/remote-share/file'}});
  let participation={enabled:participationEnabled,revision:1,can_manage:canManage,updated_at:base.created_at};
  const posts=[],notifications=[],opened=[],reads=[];let holdDetail=false,releaseDetail,uploaded;
  let holdMailbox=false,releaseMailbox,holdInbox=false,releaseInbox;
  const sharedCopies=[share,{...share,id:'department-only',document_title:'Confidențial departament',recipient_department:'Tehnic'},{...share,id:'revoked',document_title:'Document revocat',status:'revoked'}];
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input),location.origin),path=url.pathname,body=options.body instanceof FormData?Object.fromEntries(options.body):options.body?JSON.parse(options.body):undefined;
    if(!options.method||options.method==='GET')reads.push(url.pathname+url.search);
    if(['POST','PATCH'].includes(options.method))posts.push({path,body});
    if(path.endsWith('/file')&&url.searchParams.get('representation')==='info')return Response.json({pages:2});
    if(path.endsWith('/file')&&url.searchParams.get('representation')==='png')return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
    if(path==='/api/collaboration'&&options.method==='POST'){
      if(createFails-->0)return Response.json({detail:'Legătura a fost întreruptă. Reîncearcă.'},{status:503});
      detail={...detail,subject:body.subject,topic:body.topic,messages:[{...message,body:body.body}]};requests.push({...detail});return Response.json(detail);
    }
    if(path==='/api/collaboration/participation'){participation={...participation,enabled:body.enabled,revision:participation.revision+1};return Response.json(participation)}
    if(path==='/api/collaboration'){
      const response=Response.json({participation,sender,partner:{id:'sibiu',name:'Aeroportul Sibiu'},local_airport:{id:'craiova',name:'Aeroportul Craiova'},can_create:connected&&canCreate&&participation.enabled,connected,requests,partners:partners??[{id:'sibiu',name:'Aeroportul Sibiu',connected,configured:true,sharing_enabled:participation.enabled,participation_enabled:true,contacts:participation.enabled?[remoteContact]:[],last_synced_at:base.created_at,departments:[{name:'Tehnic',label:'Tehnic și operațiuni'}]}]});
      if(holdInbox){holdInbox=false;return new Promise(resolve=>{releaseInbox=()=>resolve(response)})}
      return response;
    }
    if(path==='/api/collaboration/request-1/messages'){
      if(replyFails-->0)return Response.json({detail:'Răspunsul nu a putut fi livrat.'},{status:503});
      detail={...detail,messages:[...detail.messages,{...message,id:`message-${detail.messages.length+1}`,kind:'reply',body:body.body,attachment:body.share_id?{share_id:body.share_id,title:share.document_title,source_airport_id:'craiova',source_version:2,status:'active',file_url:'/api/shares/share-1/file'}:null}]};return Response.json(detail);
    }
    if(path==='/api/collaboration/request-1/status'){detail={...detail,status:body.status,can_reply:false,can_resolve:false,can_decline:false,messages:[...detail.messages,{...message,id:'status-1',kind:body.status,body:''}]};return Response.json(detail)}
    if(path==='/api/collaboration/request-1'){
      const response=Response.json(detail);
      if(holdDetail){holdDetail=false;return new Promise(resolve=>{releaseDetail=()=>resolve(response)})}
      return response;
    }
    if(path==='/api/collaboration/request-1/mailbox'){
      const save=()=>{Object.assign(requests[0],body);if(body.read_sequence!==undefined)requests[0].unread=body.read_sequence===0;return Response.json(body)};
      if(holdMailbox){holdMailbox=false;return new Promise(resolve=>{releaseMailbox=(success=true)=>resolve(success?save():Response.json({detail:'Preferința nu a putut fi salvată.'},{status:503}))})}
      return save();
    }
    if(path==='/api/collaboration/airports'){
      const candidates=partners??[{id:'sibiu',name:'Aeroportul Sibiu',iata:'SBZ',city:'Sibiu',country:'Romania',connected,configured:true,sharing_enabled:participation.enabled,participation_enabled:true,contacts:participation.enabled?[remoteContact]:[],departments:[]}];
      const q=(url.searchParams.get('q')||'').toLowerCase();
      const found=candidates.filter(a=>(url.searchParams.get('available')!=='true'||a.participation_enabled)&&(!q||a.name.toLowerCase().includes(q)));
      return Response.json({items:found,total:found.length,offset:0,limit:12,local_airport:{id:'craiova',name:'Craiova'}});
    }
    if(path==='/api/shares')return Response.json({items:sharedCopies});
    if(path==='/api/documents'&&options.method==='POST'){
      uploaded={...doc,id:'doc-upload',title:body.title,status:'draft',validated:false,version:1,file_url:'/api/documents/doc-upload/file',permissions:{can_validate:true,can_submit:false,can_review:false,can_share:true}};
      return Response.json(uploaded,{status:201});
    }
    if(path==='/api/documents/doc-upload/actions'){
      if(body.action==='validate')uploaded={...uploaded,validated:true,permissions:{...uploaded.permissions,can_submit:true}};
      if(body.action==='submit')uploaded={...uploaded,status:'in_review',permissions:{...uploaded.permissions,can_review:true}};
      if(body.action==='approve')uploaded={...uploaded,status:'approved'};
      return Response.json(uploaded);
    }
    if(path==='/api/documents'){
      const all=documentCount===1?[doc]:Array.from({length:documentCount},(_,index)=>({...doc,id:`doc-${index+1}`,title:`Procedura ${index+1}`}));
      const items=url.searchParams.get('status')==='signed'?[]:all;
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      return Response.json({items:items.slice(offset,offset+limit),total:items.length});
    }
    if(path==='/api/documents/doc-1')return Response.json(doc);
    if(path==='/api/documents/doc-1/extraction')return Response.json({status:'completed'});
    if(path==='/api/documents/doc-1/redaction-layout')return Response.json({source_version:2,source_sha256:'source-hash',pages:[{number:1,width:600,height:800,words:[{id:'p1-w1',text:'Procedură',rect:[10,10,90,30]}]}],ai_available:false,legal_bases:[]});
    if(path==='/api/session')return Response.json({current_user:{id:'admin',airport_id:'craiova',roles:['director'],department:'Conducere'}});
    if(path==='/api/documents/doc-1/share-preview')return Response.json({preview_id:'preview-1',file_url:'/api/share-previews/preview-1/file'});
    if(path==='/api/documents/doc-1/shares'){
      const created={...share,id:'share-new',document_title:'Copie nou creată'};sharedCopies.push(created);return Response.json(created);
    }
    throw new Error(`Unexpected request ${path}`);
  };
  const root=createRoot(document.getElementById('root'));
  const render=async(active=true,revision=1)=>{await act(async()=>root.render(createElement(sharingPage?SharingPage:Coordination,{revision,active,notify:value=>notifications.push(value),onOpen:id=>opened.push(id)})));await settle()};
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});await render();
  if(!incoming)await click(find('.collab-folder','Trimise'));
  return {posts,notifications,opened,reads,render,setConnected(value){detail={...detail,connected:value}},holdNextDetail(){holdDetail=true},releaseDetail:()=>releaseDetail(),detail:()=>detail,
    holdNextMailbox(){holdMailbox=true},releaseMailbox:(success=true)=>releaseMailbox(success),holdNextInbox(){holdInbox=true},releaseInbox:()=>releaseInbox()};
}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15))})}
const find=(selector,text)=>[...document.querySelectorAll(selector)].find(element=>!element.closest('[hidden]')&&element.textContent.includes(text));
async function click(element){assert.ok(element,'Expected control');await act(async()=>element.click());await settle()}
async function input(element,value){assert.ok(element,'Expected input');await act(async()=>{const prototype=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}))});await settle()}

test('creating a request keeps the same idempotency key and typed content after a failed submission',async t=>{
  const app=await setup(t,{empty:true,createFails:1});
  await click(find('button','Mesaj nou'));
  const subject=document.querySelector('.coord-create input[required]'),body=document.querySelector('.coord-create textarea');
  assert.equal(document.activeElement,subject);
  await chooseRecipient();
  await input(subject,'Model pentru predarea turei');await input(body,'Ce verificări faceți la schimbul de tură?');
  await click(find('button','Trimite mesajul'));
  assert.match(document.querySelector('[role=alert]').textContent,/întreruptă/);
  assert.equal(subject.value,'Model pentru predarea turei');assert.equal(body.value,'Ce verificări faceți la schimbul de tură?');
  await click(find('.mail-compose-footer button','Închide'));
  await click(find('.collab-folder','Ciorne'));await click(document.querySelector('.mail-draft-row'));
  await click(find('button','Trimite mesajul'));
  assert.equal(app.posts[0].body.recipient_user_id,'remote-director');assert.equal(app.posts[0].body.recipient_airport_id,'sibiu');assert.equal(app.posts.length,2);assert.equal(app.posts[0].body.idempotency_key,app.posts[1].body.idempotency_key);
  assert.equal(document.querySelector('.coord-detail-heading h2').textContent,'Model pentru predarea turei');
  assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(app.notifications.length,1);
});

test('a reply survives refresh and a failed send, and duplicate retries use the same key',async t=>{
  const app=await setup(t,{replyFails:1});await click(find('button','Cum predați tura?'));
  await input(document.querySelector('#coord-reply-body'),'Avem o clarificare despre responsabil.');
  await app.render(true,2);assert.equal(document.querySelector('#coord-reply-body').value,'Avem o clarificare despre responsabil.');
  await click(find('button','Trimite răspunsul'));assert.match(document.querySelector('[role=alert]').textContent,/livrat/);
  assert.equal(document.querySelector('#coord-reply-body').value,'Avem o clarificare despre responsabil.');
  await click(find('button','Trimite răspunsul'));
  assert.equal(app.posts[0].body.idempotency_key,app.posts[1].body.idempotency_key);
  assert.equal(document.querySelector('#coord-reply-body').value,'');assert.equal(document.querySelectorAll('.coord-message').length,2);
});

test('only active unscoped reviewed shares can be selected and attachment sends explicitly',async t=>{
  const app=await setup(t);await click(find('button','Cum predați tura?'));await click(find('button','Adaugă un document'));
  assert.ok(find('.coord-picker-list button','Predarea turei — copie'));
  assert.equal(find('.coord-picker-list button','Confidențial departament'),undefined);assert.equal(find('.coord-picker-list button','Document revocat'),undefined);
  await click(find('.coord-picker-list button','Predarea turei — copie'));
  assert.equal(app.posts.length,0,'Selecting an already shared copy must not send a message');
  await click(find('button','Trimite răspunsul'));
  assert.equal(app.posts[0].body.share_id,'share-1');assert.equal(app.posts[0].path,'/api/collaboration/request-1/messages');
  assert.ok(document.querySelector('.coord-attachment'));
});

test('a new attachment goes through preview and explicit review before the grant and reply are sent',async t=>{
  const app=await setup(t);await click(find('button','Cum predați tura?'));await click(find('button','Adaugă un document'));
  await click(find('button','Pregătește o copie'));await click(find('.coord-picker-document button','Pregătește'));
  assert.equal(app.posts.length,0);assert.ok(document.querySelector('.redaction-studio'));
  await click(find('.studio-footer button','Verifică copia'));
  assert.equal(app.posts[0].path,'/api/documents/doc-1/share-preview');
  assert.equal(find('.studio-footer button','Partajează copia').disabled,true);
  await click(document.querySelector('.checkbox-field input'));
  await click(find('.studio-footer button','Partajează copia'));
  const grant=app.posts.find(item=>item.path.endsWith('/shares'));assert.ok(grant);assert.equal(grant.body.reviewed,true);assert.equal(grant.body.preview_id,'preview-1');assert.equal(grant.body.recipient_department,null);assert.equal(grant.body.recipient_airport_id,'sibiu');
  assert.ok(document.querySelector('.coord-selected-attachment'));assert.equal(app.posts.some(item=>item.path.endsWith('/messages')),false);
  await click(find('button','Trimite răspunsul'));assert.equal(app.posts.at(-1).body.share_id,'share-new');
});

test('creating a reviewed copy inside a request refreshes the sent count and list before sending its reply',async t=>{
  const app=await setup(t,{sharingPage:true});
  assert.equal(find('.sharing-tabs button','Documente trimise').querySelector('.count-badge').textContent,'3');
  await click(find('button','Cum predați tura?'));assert.ok(find('.coord-message header','Director aeroport'));
  await click(find('button','Adaugă un document'));await click(find('button','Pregătește o copie'));await click(find('.coord-picker-document button','Pregătește'));
  await click(find('.studio-footer button','Verifică copia'));await click(document.querySelector('.checkbox-field input'));await click(find('.studio-footer button','Partajează copia'));
  assert.equal(app.posts.some(item=>item.path.endsWith('/messages')),false,'The copy is shared before its contextual reply is sent');
  assert.equal(find('.sharing-tabs button','Documente trimise').querySelector('.count-badge').textContent,'4');
  await click(find('.sharing-tabs button','Documente trimise'));
  assert.ok(find('.share-card','Copie nou creată'));assert.equal(document.querySelectorAll('.sharing-workspace .share-card').length,4);
});

test('closing is confirmed, permissions choose the local action, and the conversation stays visible',async t=>{
  const app=await setup(t,{incoming:true});await click(find('button','Cum predați tura?'));
  assert.equal(find('button','Marchează rezolvată'),undefined);
  await click(find('button','Încheie fără continuare'));assert.equal(app.posts.length,0);
  await click(find('button','Confirmă încheierea'));assert.equal(app.posts[0].body.status,'declined');
  assert.equal(document.querySelector('#coord-reply-body'),null);assert.match(document.querySelector('.coord-closed').textContent,/încheiată/);
  assert.equal(document.querySelectorAll('.coord-message').length,2);
});

test('offline detail keeps draft and saved messages while all sends are disabled',async t=>{
  const app=await setup(t);await click(find('button','Cum predați tura?'));await input(document.querySelector('#coord-reply-body'),'Păstrează acest răspuns.');
  app.setConnected(false);await app.render(true,2);
  assert.equal(document.querySelector('#coord-reply-body').value,'Păstrează acest răspuns.');assert.equal(find('button','Trimite răspunsul').disabled,true);assert.equal(find('button','Adaugă un document').disabled,true);
  assert.equal(document.querySelectorAll('.coord-message').length,1);assert.equal(app.posts.length,0);
});

test('remote attachments verify access at the source when opened',async t=>{
  const app=await setup(t,{attachmentStatus:'verify_on_open'});await click(find('button','Cum predați tura?'));
  const attachment=find('button','Model primit');assert.equal(attachment.disabled,false);await click(attachment);
  assert.equal(document.querySelector('iframe'),null);
  assert.ok(app.reads.includes('/api/received/remote-share/file?representation=info'));
  assert.ok(app.reads.includes('/api/received/remote-share/file?representation=png&page=1'));
  assert.ok(find('button','Descarcă Word'));
  await click(document.querySelector('[aria-label="Pagina următoare"]'));
  assert.ok(app.reads.includes('/api/received/remote-share/file?representation=png&page=2'));
});

test('a revoked attachment keeps its context but cannot be opened',async t=>{
  await setup(t,{attachmentStatus:'revoked'});await click(find('button','Cum predați tura?'));
  assert.equal(find('button','Model primit').disabled,true);assert.match(find('button','Model primit').textContent,/Acces revocat/);
});

test('a delayed pre-send poll cannot replace the accepted reply with an older conversation',async t=>{
  const app=await setup(t);await click(find('button','Cum predați tura?'));await input(document.querySelector('#coord-reply-body'),'Răspunsul cel mai nou');
  app.holdNextDetail();await app.render(true,2);
  await click(find('button','Trimite răspunsul'));assert.equal(document.querySelectorAll('.coord-message').length,2);
  await act(async()=>app.releaseDetail());await settle();
  assert.equal(document.querySelectorAll('.coord-message').length,2);assert.ok(find('.coord-message','Răspunsul cel mai nou'));
});

test('document picker includes approved documents beyond the first API page',async t=>{
  await setup(t,{documentCount:205});await click(find('button','Cum predați tura?'));await click(find('button','Adaugă un document'));await click(find('button','Pregătește o copie'));
  await input(document.querySelector('.coord-picker input'),'Procedura 205');
  assert.ok(find('.coord-picker-document','Procedura 205'));assert.equal(document.querySelectorAll('.coord-picker-document').length,1);
});

test('hiding the workspace dismisses its picker and returning preserves the draft',async t=>{
  const app=await setup(t);await click(find('button','Cum predați tura?'));await input(document.querySelector('#coord-reply-body'),'Răspuns în lucru');await click(find('button','Adaugă un document'));
  assert.ok(document.querySelector('[role=dialog]'));await app.render(false);assert.equal(document.querySelector('[role=dialog]'),null);
  await app.render(true);assert.equal(document.querySelector('#coord-reply-body').value,'Răspuns în lucru');
});



async function chooseRecipient(){await input(document.querySelector('[aria-label="Caută destinatar"]'),'Alexandru');await click(document.querySelector('[role=option]'))}
async function directory(){await click(find('.collaboration-workspace-tabs button','Aeroporturi'));await act(async()=>{await new Promise(r=>setTimeout(r,100))});await click(document.querySelector('.airport-result'))}

test('default inbox shows own airport identity rather than a list of every partner',async t=>{
  await setup(t,{canCreate:false});
  assert.equal(find('button','Mesaj nou').disabled,true);
  assert.equal(document.querySelector('.coord-network'),null);
  assert.ok(document.querySelector('[aria-label="Profilul aeroportului meu"]').textContent.includes('Craiova'));
  assert.equal(document.querySelector('.airport-directory'),null);
});
test('new message requires a named recipient selected from search results',async t=>{
  const app=await setup(t,{empty:true});await click(find('button','Mesaj nou'));
  await input(document.querySelector('.coord-create input[required]'),'Solicitare procedură');await input(document.querySelector('.coord-create textarea'),'Dorim un model verificat.');
  assert.equal(document.querySelector('[aria-label="Caută destinatar"]').value,'');
  assert.equal(find('button','Trimite mesajul').disabled,true);assert.equal(app.posts.length,0);
  await chooseRecipient();assert.equal(find('button','Trimite mesajul').disabled,false);
});
test('director activates collaboration from own airport profile',async t=>{
  const app=await setup(t,{empty:true,participationEnabled:false});
  assert.equal(find('button','Mesaj nou').disabled,true);
  await click(document.querySelector('[aria-label="Profilul aeroportului meu"]'));
  await click(find('button','Activează colaborarea'));
  assert.deepEqual(app.posts[0],{path:'/api/collaboration/participation',body:{enabled:true,revision:1}});
  assert.ok(find('button','Dezactivează'));
  await click(find('button','Dezactivează'));
  assert.equal(find('button','Mesaj nou').disabled,true);
});
test('department heads cannot change airport participation',async t=>{
  await setup(t,{canManage:false});await click(document.querySelector('[aria-label="Profilul aeroportului meu"]'));
  assert.equal(find('button','Dezactivează'),undefined);
});
test('airport search opens a profile with visible contact details and a professional hover card',async t=>{
  await setup(t);await directory();
  const row=document.querySelector('.airport-contact-row');
  for(const value of [remoteContact.name,remoteContact.email,remoteContact.job_title])assert.ok(row.textContent.includes(value));
  const avatar=row.querySelector('.person-avatar-trigger');
  await act(async()=>{avatar.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));await new Promise(r=>setTimeout(r,220))});
  const card=document.querySelector('[role=dialog]');assert.ok(card);assert.ok(card.textContent.includes('Aeroportul Sibiu'));
  assert.equal(card.querySelector('a').getAttribute('href'),'mailto:'+remoteContact.email);
  assert.equal(card.querySelector('.person-profile-status'),null);
  let copied;
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{copied=value}},configurable:true});
  await click(card.querySelector('[aria-label="Copiază emailul"]'));
  assert.equal(copied,remoteContact.email);assert.match(card.textContent,/Email copiat/);
  navigator.clipboard.writeText=async()=>{throw new Error('Denied')};
  await click(card.querySelector('[aria-label="Copiază emailul"]'));
  assert.match(card.textContent,/Copierea nu este disponibilă/);
  await click(card.querySelector('.person-profile-close'));
  await click(row.querySelector('button[aria-label^="Scrie"]'));
  assert.ok(document.querySelector('.mail-recipient-chip').textContent.includes(remoteContact.name));
  assert.ok(document.querySelector('.collab-from').textContent.includes(sender.email));
});
test('Document requires a reviewed attachment and sends it with the first message',async t=>{
  const app=await setup(t,{empty:true});await click(find('button','Mesaj nou'));await chooseRecipient();
  await input(document.querySelector('.coord-create input[required]'),'Model verificat pentru recepție');
  await input(document.querySelector('.coord-create textarea'),'Atașez exemplul solicitat.');
  await act(async()=>{const select=document.querySelector('[aria-label="Tipul mesajului"]');select.value='document';select.dispatchEvent(new window.Event('change',{bubbles:true}))});
  assert.equal(find('button','Trimite mesajul').disabled,true);
  await click(document.querySelector('[aria-label="Atașează o copie"]'));
  await click(find('.coord-picker-list button','Predarea turei — copie'));
  assert.equal(app.posts.length,0);
  await click(find('button','Trimite mesajul'));
  assert.equal(app.posts[0].body.category,'document');assert.equal(app.posts[0].body.share_id,'share-1');assert.equal(app.posts[0].body.recipient_user_id,remoteContact.id);
});
test('stars and archive persist through server state and can be reversed',async t=>{
  const app=await setup(t);
  await click(document.querySelector('[aria-label="Adaugă stea"]'));
  assert.equal(app.posts[0].body.starred,true);
  await click(find('.collab-folder','Cu stea'));assert.ok(find('.collab-message-row','Cum predați tura?'));
  await click(document.querySelector('[aria-label="Arhivează conversația"]'));
  assert.equal(document.querySelector('.collab-message-row'),null);
  await click(find('.collab-folder','Arhivate'));assert.ok(document.querySelector('.collab-message-row'));
  await click(document.querySelector('[aria-label="Mută înapoi în mesaje"]'));
  assert.equal(document.querySelector('.collab-message-row'),null);
});

test('a star and its folder update before saving finishes without synchronizing the inbox',async t=>{
  const app=await setup(t),reads=app.reads.filter(p=>p==='/api/collaboration').length;
  app.holdNextMailbox();
  await click(document.querySelector('[aria-label="Adaugă stea"]'));
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'true');
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-busy'),'true');
  await click(find('.collab-folder','Cu stea'));assert.ok(document.querySelector('.collab-message-row'));
  await act(async()=>app.releaseMailbox());await settle();
  assert.equal(document.querySelector('.mail-star').disabled,false);
  assert.equal(app.reads.filter(p=>p==='/api/collaboration').length,reads);
  app.holdNextMailbox();await click(document.querySelector('[aria-label="Elimină steaua"]'));
  assert.equal(document.querySelector('.collab-message-row'),null);
  await act(async()=>app.releaseMailbox());await settle();
  assert.equal(app.reads.filter(p=>p==='/api/collaboration').length,reads);
});

test('a failed star save restores the previous state and enables retry',async t=>{
  const app=await setup(t);app.holdNextMailbox();
  await click(document.querySelector('[aria-label="Adaugă stea"]'));
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'true');
  await act(async()=>app.releaseMailbox(false));await settle();
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelector('.mail-star').disabled,false);
  assert.match(document.querySelector('[role=alert]').textContent,/nu a putut fi salvată/);
  await click(document.querySelector('[aria-label="Adaugă stea"]'));
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'true');
});

test('an older inbox response cannot undo a star saved while it was loading',async t=>{
  const app=await setup(t);app.holdNextInbox();await app.render(true,2);
  await click(document.querySelector('[aria-label="Adaugă stea"]'));
  await act(async()=>app.releaseInbox());await settle();
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'true');
  await app.render(true,3);
  assert.equal(document.querySelector('.mail-star').getAttribute('aria-pressed'),'true');
});
test('closing compose preserves a personal draft and deleting it removes it',async t=>{
  await setup(t,{empty:true});await click(find('button','Mesaj nou'));
  await input(document.querySelector('.coord-create input[required]'),'Ciornă personală');
  await input(document.querySelector('.coord-create textarea'),'Text de continuat.');
  await click(find('.mail-compose-footer button','Închide'));
  await click(find('.collab-folder','Ciorne'));await click(document.querySelector('.mail-draft-row'));
  assert.equal(document.querySelector('.coord-create textarea').value,'Text de continuat.');
  await click(document.querySelector('[aria-label="Șterge ciorna"]'));
  assert.equal(document.querySelector('.mail-draft-row'),null);
  assert.equal(localStorage.getItem('flyleaf:mail-draft:craiova:admin'),null);
});

test('choosing an airport immediately suggests only its contacts without typing',async t=>{
  const contacts=[{...remoteContact,id:'technical',name:'Ioana Rusu',email:'technical@sibiu.example',job_title:'Șef tehnic'}];
  await setup(t,{empty:true,partners:[{id:'sibiu',name:'Aeroportul Sibiu',contacts,sharing_enabled:true},{id:'cluj',name:'Aeroportul Cluj',contacts:[{...remoteContact,name:'Mara Georgescu'}],sharing_enabled:true}]});
  await click(find('button','Mesaj nou'));
  await act(async()=>{const select=document.querySelector('[aria-label="Aeroport destinatar"]');select.value='sibiu';select.dispatchEvent(new window.Event('change',{bubbles:true}))});
  assert.equal(document.querySelector('[aria-label="Caută destinatar"]').value,'');
  assert.equal(document.querySelectorAll('.mail-recipient-options button').length,1);
  assert.match(document.querySelector('.mail-recipient-options').textContent,/Ioana Rusu/);
  assert.ok(!document.querySelector('.mail-recipient-options').textContent.includes('Mara'));
  await click(document.querySelector('.mail-recipient-options button'));
  assert.match(document.querySelector('.mail-recipient-chip').textContent,/Ioana Rusu/);
});

test('upload in compose preserves the draft and requires explicit validation and approval',async t=>{
  const app=await setup(t,{empty:true});await click(find('button','Mesaj nou'));await chooseRecipient();
  await input(document.querySelector('.coord-create input[required]'),'Model adaptat local');
  await input(document.querySelector('.coord-create textarea'),'Am completat formularul primit.');
  await click(document.querySelector('[aria-label="Încarcă PDF de pe dispozitiv"]'));
  const file=document.querySelector('input[type=file]');assert.ok(file);assert.match(file.accept,/pdf/);
  Object.defineProperty(file,'files',{value:[new window.File(['%PDF-test'],'model-adaptat.pdf',{type:'application/pdf'})]});
  await act(async()=>file.dispatchEvent(new window.Event('change',{bubbles:true})));await settle();
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.equal(app.posts[0].path,'/api/documents');assert.equal(app.posts[0].body.file.name,'model-adaptat.pdf');
  assert.equal(find('button','Verifică datele pentru partajare'),undefined);
  await click(find('button','Confirm informațiile documentului'));
  await click(find('button','Trimite spre avizare'));
  await click(find('button','Aprobă această versiune'));
  assert.ok(find('button','Verifică datele pentru partajare'));
  assert.deepEqual(app.posts.filter(p=>p.path.endsWith('/actions')).map(p=>p.body.action),['validate','submit','approve']);
  assert.equal(app.posts.filter(p=>p.path==='/api/collaboration').length,0);
  await click(document.querySelector('[aria-label="Închide"]'));
  await click(document.querySelector('[aria-label="Închide"]'));
  assert.equal(document.querySelector('.coord-create textarea').value,'Am completat formularul primit.');
});
