import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement,useState} from 'react';

function installDOM(window){
  for(const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','HTMLInputElement','Event','MouseEvent','FormData'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'};
}
const initialDOM=new JSDOM('<div></div>',{url:'http://flyleaf.test/'});
installDOM(initialDOM.window);
const {createRoot}=await import('react-dom/client');
async function component(path,name){
  const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,
    platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const module={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  return module.exports[name];
}
const DocumentLibrary=await component('../src/features/documents/DocumentLibrary.tsx','DocumentLibrary');
const AppointmentPanel=await component('../src/features/people/AppointmentPanel.tsx','AppointmentPanel');
initialDOM.window.close();
const documents=Array.from({length:45},(_,index)=>({id:`doc-${index+1}`,title:`Document ${index+1}`,
  number:`FL-${index+1}`,category:index%2?'Contract':'Procedură',department:'Operațiuni',
  status:index%2?'draft':'approved',expires_at:'2027-01-01'}));
const noop=()=>{};
async function settle(ms=230){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))})}
async function setup(t,element,fetcher){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://flyleaf.test/',pretendToBeVisual:true});
  installDOM(dom.window);globalThis.fetch=fetcher;
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  await act(async()=>root.render(element));await settle();
  return root;
}
const button=text=>[...document.querySelectorAll('button')].find(item=>item.textContent.includes(text));
const rows=()=>document.querySelectorAll('.document-table tbody tr');
async function click(element){assert.ok(element);await act(async()=>element.click());await settle()}
async function input(element,value){
  await act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);
    element.dispatchEvent(new window.Event('input',{bubbles:true}));
  });await settle();
}
function registerFetch(input){
  const url=new URL(String(input),location.origin);
  assert.equal(url.pathname,'/api/documents');
  const q=url.searchParams.get('q'),status=url.searchParams.get('status'),category=url.searchParams.get('category');
  const items=documents.filter(item=>(!q||item.title.includes(q))&&(!status||item.status===status)&&(!category||item.category===category));
  return Promise.resolve(Response.json({items,total:items.length,categories:['Contract','Procedură']}));
}
function RetainedLibrary(){
  const [opened,setOpened]=useState('');
  return createElement('div',null,
    createElement('section',{hidden:!!opened},createElement(DocumentLibrary,{revision:0,onOpen:setOpened,onUpload:noop,notify:noop})),
    opened&&createElement('button',{onClick:()=>setOpened('')},`Înapoi din ${opened}`));
}

test('registry pages twenty rows, keeps the current page after a document visit, and stops at the last page',async t=>{
  await setup(t,createElement(RetainedLibrary),registerFetch);
  assert.equal(rows().length,20);assert.match(document.querySelector('.library-pagination').textContent,/1–20 din 45/);
  assert.equal(button('Anterior').disabled,true);
  await click(button('Următor'));
  assert.match(rows()[0].textContent,/Document 21/);
  assert.equal(document.querySelector('.library-panel').dataset.scrolled,'true');
  await click(rows()[0].querySelector('button'));
  assert.ok(document.querySelector('section[hidden]'));
  await click(button('Înapoi din doc-21'));
  assert.match(rows()[0].textContent,/Document 21/);
  assert.match(document.querySelector('.library-pagination').textContent,/21–40 din 45/);
  await click(button('Următor'));
  assert.equal(rows().length,5);assert.equal(button('Următor').disabled,true);
  assert.match(document.querySelector('.library-pagination').textContent,/41–45 din 45/);
});

test('search, status and category changes reset registry pagination',async t=>{
  await setup(t,createElement(RetainedLibrary),registerFetch);
  await click(button('Următor'));
  await input(document.querySelector('[aria-label="Caută documente"]'),'Document');
  assert.equal(rows()[0].querySelector('strong').textContent,'Document 1');
  await click(button('Următor'));await click(button('Aprobate'));
  assert.match(document.querySelector('.library-pagination').textContent,/1–20 din 23/);
  await click(button('Următor'));await click(button('Toate documentele'));
  await click(button('Următor'));
  await act(async()=>{const select=document.querySelector('[aria-label="Tip document"]');select.value='Contract';select.dispatchEvent(new window.Event('change',{bubbles:true}))});
  await settle();
  assert.match(document.querySelector('.library-pagination').textContent,/1–20 din 22/);
  assert.equal(rows()[0].querySelector('strong').textContent,'Document 2');
});

test('approval appointment panel hides only a successful empty result and keeps pending decisions and errors visible',async t=>{
  let response={items:[]},failed=false;
  const root=await setup(t,createElement(AppointmentPanel,{revision:0,notify:noop,hideEmpty:true}),()=>Promise.resolve(failed?Response.json({detail:'Service unavailable'},{status:503}):Response.json(response)));
  assert.equal(document.querySelector('.appointment-panel'),null);
  response={items:[{id:'appointment-1',name:'Colegul Test',department:'Operațiuni',effective_date:'2026-11-02',
    reason:'Numire propusă',status:'pending',proposer_name:'HR',can_decide:true}]};
  await act(async()=>root.render(createElement(AppointmentPanel,{revision:1,notify:noop,hideEmpty:true})));await settle();
  assert.ok(button('Revizuiește numirea'));assert.match(document.body.textContent,/Autoritatea de semnare se acordă separat/);
  failed=true;
  await act(async()=>root.render(createElement(AppointmentPanel,{revision:2,notify:noop,hideEmpty:true})));await settle();
  assert.match(document.querySelector('[role="alert"]').textContent,/Service unavailable/);
  failed=false;response={items:[]};
  await act(async()=>root.render(createElement(AppointmentPanel,{revision:3,notify:noop})));await settle();
  assert.match(document.body.textContent,/Nicio propunere de numire/);
});
