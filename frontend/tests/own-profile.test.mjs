import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement as h} from 'react';

function install(window) {
  for (const key of ['window','document','navigator','location','localStorage','HTMLElement','CustomEvent','FormData'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.ResizeObserver=class {observe() {} disconnect() {}};
}
const initial=new JSDOM('',{url:'http://flyleaf.test/'});
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({stdin:{contents:`export {PersonAvatar,PersonStatus} from './components/people/PersonAvatar';
export {PersonDirectoryProvider} from './components/people/PersonDirectory';
export {liveProfile} from './components/people/profile-status';`,resolveDir:fileURLToPath(new URL('../src',import.meta.url)),loader:'tsx'},
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {PersonAvatar,PersonStatus,PersonDirectoryProvider,liveProfile}=module.exports;
initial.window.close();
const empty={presence:'automatic',presence_expires_at:null,status_message:'',message_expires_at:null,photo_url:null};

async function setup(t, overrides={}) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://flyleaf.test/'});install(dom.window);
  const originalFetch=globalThis.fetch;
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=> 'blob:profile-preview';URL.revokeObjectURL=()=>{};
  const state={...empty,...overrides};
  const person={id:'admin',name:'Ana Ionescu',email:'admin@craiova.example',department:'Conducere',job_title:'Director',role:'director',roles:['director'],active:true,availability:'available'};
  const calls=[];
  let fail=false;
  globalThis.fetch=async (input,options={})=>{
    const path=String(input);
    if(!options.method) return Response.json({items:[{...person,profile:{...state}}, {...person,id:'colleague',name:'Mara Demo',profile:{...empty,status_message:'Pe platformă'}}],current_user_id:'admin',reference_date:'2026-10-30'});
    calls.push({path,method:options.method,body:options.body});
    if(fail)return Response.json({detail:'Nu s-a putut salva.'},{status:503});
    if(path.endsWith('/presence')) {const p=JSON.parse(options.body);state.presence=p.status;state.presence_expires_at=p.duration_minutes?new Date(Date.now()+p.duration_minutes*60000).toISOString():null;}
    if(path.endsWith('/status-message')) {const p=JSON.parse(options.body);state.status_message=p.message.trim();state.message_expires_at=p.duration_minutes?new Date(Date.now()+p.duration_minutes*60000).toISOString():null;}
    if(path.endsWith('/photo')) state.photo_url=options.method==='DELETE'?null:'/api/people/admin/photo?v=new';
    return Response.json({...state});
  };
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(h(PersonDirectoryProvider,{revision:0,account:{userId:'admin',signOut:async()=>{},signingOut:false,signOutError:''}},h('div',null,
    h(PersonAvatar,{userId:'admin',name:'Ana Ionescu'}),h(PersonAvatar,{userId:'admin',name:'Ana Ionescu'}),h(PersonAvatar,{userId:'colleague',name:'Mara Demo'}),h(PersonStatus,{person}),h(PersonAvatar,{name:'Director Sibiu',externalAirport:'Aeroportul Sibiu',person:{...person,name:'Director Sibiu',email:'director@sibiu.example'}})))));
  t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=originalFetch;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.window.close();});
  await act(async()=>document.querySelector('.person-avatar-trigger').focus());
  return {state,calls,fail:()=>{fail=true;},recover:()=>{fail=false;}};
}
async function click(text) {
  const button=[...document.querySelectorAll('.person-profile button')].find(element=>element.textContent.includes(text)||element.getAttribute('aria-label')===text);
  assert.ok(button,`Missing button: ${text}`);await act(async()=>button.click());
}
async function change(element,value) {
  const prototype=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLSelectElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event(element.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));});
}

test('only the logged-in person gets account controls; colleague cards remain read-only',async t=>{
  await setup(t);
  assert.ok(document.querySelector('.own-profile'));
  assert.ok(document.querySelector('.person-signout-button'));
  await act(async()=>document.querySelector('[aria-label="Vezi profilul: Mara Demo"]').focus());
  assert.equal(document.querySelector('.own-profile'),null);
  assert.equal(document.querySelector('.person-signout-button'),null);
  assert.match(document.querySelector('.person-profile-status-message').textContent,/Pe platformă/);
});

test('a remote contact with the current user ID cannot inherit local profile or editing controls',async t=>{
  await setup(t,{status_message:'Internal local status',photo_url:'/api/people/admin/photo?v=private'});
  await act(async()=>document.querySelector('[aria-label="Vezi profilul: Director Sibiu"]').focus());
  const card=document.querySelector('.person-profile');
  assert.equal(card.querySelector('.own-profile'),null);
  assert.equal(card.querySelector('.person-signout-button'),null);
  assert.equal(card.querySelector('img'),null);
  assert.equal(card.querySelector('.person-profile-status-message'),null);
  assert.equal(card.querySelector('.person-profile-status'),null);
  assert.match(card.textContent,/Aeroportul Sibiu/);
  assert.equal(card.querySelector('a').getAttribute('href'),'mailto:director@sibiu.example');
});

test('saving and resetting presence updates all current-user avatars without changing accounts',async t=>{
  const {calls,state}=await setup(t);
  await click('Schimbă statusul');
  const selects=document.querySelectorAll('.own-profile select');
  await change(selects[0],'do_not_disturb');await change(selects[1],'240');
  await click('Salvează');
  assert.equal(calls[0].path,'/api/people/me/presence');
  assert.deepEqual(JSON.parse(calls[0].body),{status:'do_not_disturb',duration_minutes:240});
  assert.equal(document.querySelectorAll('.person-presence-do_not_disturb').length,2);
  assert.equal(document.querySelector('.availability').textContent,'Nu deranjați');
  assert.match(document.querySelector('.person-profile-status').textContent,/Nu deranjați/);
  await click('Schimbă statusul');await click('Resetează statusul');
  assert.equal(state.presence,'automatic');
  assert.equal(document.querySelectorAll('.person-presence-available').length,3);
});

test('status messages save, remain editable on failure, retry, and can be cleared',async t=>{
  const fixture=await setup(t);
  await click('Setează un mesaj');
  await change(document.querySelector('textarea'),'Revin la 14:00');
  fixture.fail();await click('Salvează');
  assert.match(document.querySelector('[role="alert"]').textContent,/Nu s-a putut salva/);
  assert.equal(document.querySelector('textarea').value,'Revin la 14:00');
  fixture.recover();await click('Salvează');
  assert.equal(document.querySelector('.person-profile-status-message').textContent,'Revin la 14:00');
  await click('Editează mesajul');await click('Șterge mesajul');
  assert.equal(document.querySelector('.person-profile-status-message'),null);
});

test('photo selection previews and uploads a file, updates avatars and supports removal',async t=>{
  const {calls}=await setup(t);
  await click('Schimbă fotografia');
  const input=document.querySelector('input[type="file"]');
  const file=new window.File(['png-fixture'],'portrait.png',{type:'image/png'});
  Object.defineProperty(input,'files',{value:[file],configurable:true});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  assert.equal(document.querySelector('.own-profile-photo-preview img').src,'blob:profile-preview');
  await click('Salvează');
  assert.equal(calls[0].path,'/api/people/me/photo');
  assert.equal(calls[0].body.get('file').name,'portrait.png');
  assert.equal(document.querySelectorAll('.person-avatar-trigger img').length,2);
  await click('Schimbă fotografia');await click('Elimină fotografia');
  assert.equal(document.querySelectorAll('.person-avatar-trigger img').length,0);
});

test('oversized photos are rejected before upload',async t=>{
  const {calls}=await setup(t);
  await click('Schimbă fotografia');
  const input=document.querySelector('input[type="file"]');
  const file=new window.File([new Uint8Array(2*1024*1024+1)],'large.png',{type:'image/png'});
  Object.defineProperty(input,'files',{value:[file],configurable:true});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  assert.match(document.querySelector('[role="alert"]').textContent,/2 MB/);
  assert.equal(document.querySelector('.own-profile-save').disabled,true);
  assert.equal(calls.length,0);
});

test('expired status and message reset independently on an already-open card',()=>{
  const current={...empty,presence:'busy',presence_expires_at:'2026-11-01T10:30:00Z',status_message:'Pe platformă',message_expires_at:'2026-11-01T11:00:00Z'};
  const afterStatus=liveProfile(current,Date.parse('2026-11-01T10:31:00Z'));
  assert.equal(afterStatus.presence,'automatic');assert.equal(afterStatus.status_message,'Pe platformă');
  const afterMessage=liveProfile(current,Date.parse('2026-11-01T11:01:00Z'));
  assert.equal(afterMessage.status_message,'');
});
