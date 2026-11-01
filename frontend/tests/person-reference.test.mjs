import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement as h} from 'react';

function install(window) {
  for(const key of ['window','document','navigator','location','localStorage','HTMLElement','Event','MouseEvent','CustomEvent'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
}
const initial=new JSDOM('',{url:'http://flyleaf.test'});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({stdin:{contents:`
  export {PersonReference} from './src/components/people/PersonReference';
  export {PersonDirectoryProvider} from './src/components/people/PersonDirectory';
  export {OrganizationChart} from './src/features/people/OrganizationChart';
  export {ContactReference} from './src/features/sharing/ContactDirectory';
`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {PersonReference,PersonDirectoryProvider,OrganizationChart,ContactReference}=module.exports;initial.window.close();
const manager={id:'manager',name:'Elena Popa',email:'elena@craiova.example',job_title:'Șef conformitate',department:'Conformitate',role:'manager',roles:['manager'],active:true,availability:'available'};
const person={...manager,id:'employee',name:'Andrei Neagu',email:'andrei@craiova.example',job_title:'Tehnician',manager_id:'manager',manager_name:manager.name,role:'employee'};
const directory={items:[person,manager],current_user_id:'other',reference_date:'2026-10-30',department_records:[],organization_leaders:[manager]};
async function setup(t,content,data=directory) {
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test',pretendToBeVisual:true});install(dom.window);
  const requests=[];globalThis.fetch=async path=>{requests.push(path);return Response.json(data)};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  await act(async()=>root.render(h(PersonDirectoryProvider,{revision:0},content)));
  return {requests};
}
async function hover(node) {
  await act(async()=>{node.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,230))});
}
async function escape() {await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));}

test('organigram names open account cards outside the scrolling tree and support keyboard focus',async t=>{
  const {requests}=await setup(t,h(OrganizationChart,{directory}));
  const name=document.querySelector('[data-person-id="employee"] .person-name');
  await hover(name);
  const card=document.querySelector('.person-profile');
  assert.equal(card.parentElement,document.body);
  assert.match(card.textContent,/andrei@craiova.example/);
  assert.match(card.textContent,/Tehnician/);
  assert.match(card.textContent,/Elena Popa/);
  assert.equal(requests.length,1,'every reference uses the workspace directory');
  await escape();await act(async()=>name.focus());
  assert.ok(document.querySelector('.person-profile'));
});

test('embedded names do not nest buttons or hijack parent clicks; profile controls are isolated',async t=>{
  let opens=0;
  await setup(t,h('button',{id:'row',onClick:()=>opens++},h(PersonReference,{userId:person.id,name:person.name,embedded:true}),h(PersonReference,{userId:manager.id,name:manager.name,embedded:true})));
  const row=document.getElementById('row'),name=row.querySelector('.person-name');
  assert.equal(name.tagName,'SPAN');assert.equal(name.hasAttribute('tabindex'),false);assert.equal(row.querySelector('button'),null);
  await hover(name);assert.match(document.querySelector('.person-profile').textContent,/andrei@/);assert.equal(opens,0);
  await act(async()=>document.querySelector('[aria-label="Copiază emailul"]').click());
  assert.equal(opens,0,'portal clicks must not bubble into the surrounding document/thread button');
  await escape();await act(async()=>row.focus());
  assert.ok(document.querySelector('.person-profile'));
  assert.match(document.querySelector('.person-profile').textContent,/andrei@craiova.example/,'row focus opens its primary person even when a second person is mentioned');
  await act(async()=>row.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  assert.equal(document.activeElement.className,'person-profile-close');
  await escape();assert.equal(document.activeElement,row);assert.equal(document.querySelector('.person-profile'),null);
  await act(async()=>name.click());assert.equal(opens,1);
});

test('explicit IDs beat same-name matches while role labels and ambiguous names remain plain text',async t=>{
  await setup(t,h('div',null,h(PersonReference,{name:'Control operațional'}),h(PersonReference,{name:person.name}),h(PersonReference,{name:person.name,userId:person.id})),{...directory,items:[person,{...person,id:'duplicate',email:'different@example.test'}]});
  assert.equal(document.querySelectorAll('.person-name').length,1);
  await hover(document.querySelector('.person-name'));
  assert.match(document.querySelector('.person-profile').textContent,/andrei@craiova.example/);
  assert.doesNotMatch(document.querySelector('.person-profile').textContent,/different@example/);
});

test('partner contacts retain their airport identity even when local IDs and names match',async t=>{
  await setup(t,h(ContactReference,{contact:{...person,email:'andrei@sibiu.example',job_title:'Director partener'},airport:'Aeroportul Sibiu'}));
  await hover(document.querySelector('.person-name'));
  const text=document.querySelector('.person-profile').textContent;
  assert.match(text,/andrei@sibiu.example/);assert.match(text,/Aeroportul Sibiu/);assert.match(text,/Director partener/);assert.doesNotMatch(text,/andrei@craiova/);
});

test('manager references inside a profile navigate within the same card and can return',async t=>{
  await setup(t,h(PersonReference,{userId:person.id,name:person.name}));
  await hover(document.querySelector('.person-name'));
  await hover(document.querySelector('.person-profile-manager'));
  assert.equal(document.querySelectorAll('.person-profile').length,1);
  assert.match(document.querySelector('.person-profile').textContent,/elena@craiova.example/);
  await act(async()=>document.querySelector('.person-profile-back').click());
  assert.match(document.querySelector('.person-profile').textContent,/andrei@craiova.example/);
});
