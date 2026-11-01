import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

function install(window) {
  for(const key of ['window','document','navigator','location','localStorage','HTMLElement','Event','MouseEvent','FormData'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
}
const initial=new JSDOM('<div/>',{url:'http://aerodesk.test/'});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/people/AuthorityDialog.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {AuthorityDialog}=module.exports;initial.window.close();

for(const departmentId of [null,'retired-department']) {
  test(`head proposal with department ${departmentId} explains the prerequisite and cannot submit`,async t=>{
    const dom=new JSDOM('<div id="root"/>',{url:'http://aerodesk.test/',pretendToBeVisual:true});install(dom.window);
    const calls=[];globalThis.fetch=async(input,options)=>{calls.push({input,options});return Response.json({status:'pending'})};
    const root=createRoot(document.getElementById('root'));
    t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
    const person={id:'daniel',name:'Daniel Ilie Voicu',department:'Conducere',department_id:departmentId,roles:['employee'],active:true};
    const directory={reference_date:'2026-10-30',department_records:[{id:'dept-tehnic',name:'Tehnic'}]};
    await act(async()=>root.render(createElement(AuthorityDialog,{person,directory,onClose:()=>{},onChanged:()=>{}})));
    const submit=document.querySelector('button.button.primary');
    assert.equal(submit.disabled,true);
    assert.match(document.body.textContent,/Atribuie.*departament/);
    assert.match(document.body.textContent,/Gestionează angajatul/);
    await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(calls.length,0);
  });
}

test('signing authority remains separate from department-head eligibility',async t=>{
  const dom=new JSDOM('<div id="root"/>',{url:'http://aerodesk.test/',pretendToBeVisual:true});install(dom.window);
  const calls=[];globalThis.fetch=async(input,options)=>{calls.push({path:new URL(input,location.origin).pathname,body:JSON.parse(options.body)});return Response.json({status:'ready'})};
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  const person={id:'daniel',name:'Daniel Ilie Voicu',department:'Conducere',department_id:null,roles:['employee'],active:true};
  await act(async()=>root.render(createElement(AuthorityDialog,{person,directory:{department_records:[]},signing:true,onClose:()=>{},onChanged:()=>{}})));
  assert.equal(document.querySelector('button.button.primary').disabled,false);
  document.querySelector('[name="reason"]').value='Autoritate explicită';
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(calls,[{path:'/api/people/daniel/signing-authority',body:{enabled:true,reason:'Autoritate explicită'}}]);
});
