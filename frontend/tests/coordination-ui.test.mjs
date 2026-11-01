import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

function install(window){
  for(const name of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','FormData'])Object.defineProperty(globalThis,name,{value:name==='window'?window:window[name],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
}
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/sharing/Coordination.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {Coordination}=module.exports;
const sharingBundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/sharing/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const sharingModule={exports:{}};new Function('require','module','exports',sharingBundle.outputFiles[0].text)(createRequire(import.meta.url),sharingModule,sharingModule.exports);
const {SharingPage}=sharingModule.exports;initial.window.close();

const base={id:'request-1',direction:'outgoing',subject:'Cum predați tura?',topic:'Proceduri',status:'open',created_at:'2026-11-01T08:00:00Z',updated_at:'2026-11-01T08:00:00Z',partner_name:'Aeroportul Sibiu',message_count:1,last_message:'Căutăm un model de predare a turei.',pending_delivery:false};
const message={id:'message-1',body:'Căutăm un model de predare a turei.',kind:'request',author_airport_id:'craiova',author_airport_name:'Aeroportul Craiova',author_role:'director',created_at:base.created_at,is_local:true,delivery:'received',attachment:null};
const share={id:'share-1',document_id:'doc-1',document_title:'Predarea turei — copie',source_version:2,recipient_airport:'Aeroportul Sibiu',recipient_airport_id:'sibiu',recipient_department:null,expires_at:'2026-12-01',created_at:base.created_at,status:'active'};
const doc={id:'doc-1',title:'Procedura predării turei',number:'SOP-1',category:'Procedură',department:'Operațiuni',status:'approved',version:2,tags:[],metadata:{},filename:'sop.pdf',related_ids:[],validated:true,created_at:base.created_at,file_url:'/api/documents/doc-1/file',permissions:{can_edit:false,can_review:false,can_sign:false,can_share:true}};

async function setup(t,{empty=false,connected=true,createFails=0,replyFails=0,incoming=false,attachmentStatus,documentCount=1,sharingPage=false,canCreate=true,partners}={}){
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/#sharing',pretendToBeVisual:true});install(dom.window);
  const requests=empty?[]:[{...base,direction:incoming?'incoming':'outgoing'}];
  let detail={...base,direction:incoming?'incoming':'outgoing',connected,can_reply:true,can_resolve:!incoming,can_decline:incoming,messages:[{...message}]};
  if(attachmentStatus)detail.messages.push({...message,id:'message-attachment',body:'Procedura noastră',is_local:false,author_airport_name:'Aeroportul Sibiu',attachment:{share_id:'remote-share',title:'Model primit',source_airport_id:'sibiu',source_version:3,status:attachmentStatus,file_url:'/api/received/remote-share/file'}});
  const posts=[],notifications=[],opened=[];let holdDetail=false,releaseDetail;
  const sharedCopies=[share,{...share,id:'department-only',document_title:'Confidențial departament',recipient_department:'Tehnic'},{...share,id:'revoked',document_title:'Document revocat',status:'revoked'}];
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input),location.origin),path=url.pathname,body=options.body?JSON.parse(options.body):undefined;
    if(options.method==='POST')posts.push({path,body});
    if(path==='/api/collaboration'&&options.method==='POST'){
      if(createFails-->0)return Response.json({detail:'Legătura a fost întreruptă. Reîncearcă.'},{status:503});
      detail={...detail,subject:body.subject,topic:body.topic,messages:[{...message,body:body.body}]};requests.push({...detail});return Response.json(detail);
    }
    if(path==='/api/collaboration')return Response.json({partner:{id:'sibiu',name:'Aeroportul Sibiu'},local_airport:{id:'craiova',name:'Aeroportul Craiova'},can_create:connected&&canCreate,connected,requests,partners:partners??[{id:'sibiu',name:'Aeroportul Sibiu',connected,configured:true,sharing_enabled:true,last_synced_at:base.created_at,departments:[{name:'Tehnic',label:'Tehnic și operațiuni'}]}]});
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
    if(path==='/api/shares')return Response.json({items:sharedCopies});
    if(path==='/api/documents'){
      const all=documentCount===1?[doc]:Array.from({length:documentCount},(_,index)=>({...doc,id:`doc-${index+1}`,title:`Procedura ${index+1}`}));
      const items=url.searchParams.get('status')==='signed'?[]:all;
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      return Response.json({items:items.slice(offset,offset+limit),total:items.length});
    }
    if(path==='/api/documents/doc-1')return Response.json(doc);
    if(path==='/api/documents/doc-1/extraction')return Response.json({status:'completed'});
    if(path==='/api/documents/doc-1/redaction-layout')return Response.json({source_version:2,source_sha256:'source-hash',pages:[{number:1,width:600,height:800,words:[{id:'p1-w1',text:'Procedură',rect:[10,10,90,30]}]}],ai_available:false,legal_bases:[]});
    if(path==='/api/session')return Response.json({current_user:{airport_id:'craiova'}});
    if(path==='/api/documents/doc-1/share-preview')return Response.json({preview_id:'preview-1',file_url:'/api/share-previews/preview-1/file'});
    if(path==='/api/documents/doc-1/shares'){
      const created={...share,id:'share-new',document_title:'Copie nou creată'};sharedCopies.push(created);return Response.json(created);
    }
    throw new Error(`Unexpected request ${path}`);
  };
  const root=createRoot(document.getElementById('root'));
  const render=async(active=true,revision=1)=>{await act(async()=>root.render(createElement(sharingPage?SharingPage:Coordination,{revision,active,notify:value=>notifications.push(value),onOpen:id=>opened.push(id)})));await settle()};
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});await render();
  return {posts,notifications,opened,render,setConnected(value){detail={...detail,connected:value}},holdNextDetail(){holdDetail=true},releaseDetail:()=>releaseDetail(),detail:()=>detail};
}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15))})}
const find=(selector,text)=>[...document.querySelectorAll(selector)].find(element=>!element.closest('[hidden]')&&element.textContent.includes(text));
async function click(element){assert.ok(element,'Expected control');await act(async()=>element.click());await settle()}
async function input(element,value){assert.ok(element,'Expected input');await act(async()=>{const prototype=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}))});await settle()}

test('creating a request keeps the same idempotency key and typed content after a failed submission',async t=>{
  const app=await setup(t,{empty:true,createFails:1});
  await click(find('button','Cerere nouă'));
  const subject=document.querySelector('.coord-create input'),body=document.querySelector('.coord-create textarea');
  assert.equal(document.activeElement,subject);
  await act(async()=>{const select=document.querySelector('[aria-label="Departament destinatar"]');select.value='Tehnic';select.dispatchEvent(new window.Event('change',{bubbles:true}))});
  await input(subject,'Model pentru predarea turei');await input(body,'Ce verificări faceți la schimbul de tură?');
  await click(find('button','Trimite cererea'));
  assert.match(document.querySelector('[role=alert]').textContent,/întreruptă/);
  assert.equal(subject.value,'Model pentru predarea turei');assert.equal(body.value,'Ce verificări faceți la schimbul de tură?');
  await click(find('button','Trimite cererea'));
  assert.equal(app.posts[0].body.recipient_department,'Tehnic');assert.equal(app.posts[0].body.recipient_airport_id,'sibiu');assert.equal(app.posts.length,2);assert.equal(app.posts[0].body.idempotency_key,app.posts[1].body.idempotency_key);
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
  await setup(t,{attachmentStatus:'verify_on_open'});await click(find('button','Cum predați tura?'));
  const attachment=find('button','Model primit');assert.equal(attachment.disabled,false);await click(attachment);
  assert.equal(document.querySelector('iframe').getAttribute('src'),'/api/received/remote-share/file');
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


test('request creation is hidden for readers and connections show server state',async t=>{
  await setup(t,{canCreate:false,partners:[{id:'other',name:'Aeroportul partener verificat',connected:false,configured:true,sharing_enabled:true,last_synced_at:base.created_at,departments:[]}]});
  assert.equal(find('button','Cerere nouă'),undefined);
  assert.match(document.querySelector('.coord-network').textContent,/Aeroportul partener verificat/);
  assert.match(document.querySelector('.coord-network').textContent,/Indisponibil/);
  assert.match(document.querySelector('.coord-network').textContent,/Ultima sincronizare/);
});
test('new request cannot submit without an explicitly selected destination department',async t=>{
  const app=await setup(t,{empty:true});await click(find('button','Cerere nouă'));
  await input(document.querySelector('.coord-create input'),'Solicitare procedură');await input(document.querySelector('.coord-create textarea'),'Dorim un model verificat.');
  assert.equal(document.querySelector('[aria-label="Departament destinatar"]').value,'');
  assert.equal(find('button','Trimite cererea').disabled,true);
  assert.equal(app.posts.length,0);
});
