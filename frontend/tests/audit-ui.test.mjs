import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

function install(window){
  for(const key of ['window','document','navigator','location','localStorage','HTMLElement'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
}
const initial=new JSDOM('',{url:'http://flyleaf.test/'});
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/audit/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {AuditPage}=module.exports;
initial.window.close();

test('journal pages all matching records, resets search, and preserves document links and details',async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://flyleaf.test/'});
  install(dom.window);
  const items=Array.from({length:57},(_,index)=>({id:`event-${index}`,action:'upload',actor:index<30?'Ana Popescu':'Mihai Ionescu',document_id:`doc-${index}`,document_title:`Document ${index}`,detail:`Detaliul ${index}`,created_at:'2026-10-31T10:00:00Z'}));
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({items});
  const opened=[];
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());globalThis.fetch=previousFetch;dom.window.close()});
  await act(async()=>root.render(createElement(AuditPage,{revision:0,onOpen:id=>opened.push(id)})));
  const rows=()=>document.querySelectorAll('.audit-table tbody tr');
  const range=()=>document.querySelector('.audit-pagination>span').textContent;
  const button=label=>[...document.querySelectorAll('.audit-pagination button')].find(el=>el.textContent===label);
  const click=async label=>act(async()=>button(label).click());
  const search=async value=>{
    const input=document.querySelector('[aria-label="Caută în jurnal"]');
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    });
  };
  assert.equal(rows().length,25);
  assert.equal(range(),'1–25 din 57 înregistrări');
  assert.equal(button('Anterior').disabled,true);
  await click('Următor');
  assert.equal(range(),'26–50 din 57 înregistrări');
  assert.match(rows()[0].textContent,/Document 25/);
  await click('Următor');
  assert.equal(rows().length,7);
  assert.equal(range(),'51–57 din 57 înregistrări');
  assert.equal(button('Următor').disabled,true);
  await search('Ana');
  assert.equal(range(),'1–25 din 30 înregistrări');
  assert.equal(rows().length,25);
  assert.equal(button('Anterior').disabled,true);
  await click('Următor');
  assert.equal(range(),'26–30 din 30 înregistrări');
  assert.equal(rows().length,5);
  await act(async()=>rows()[0].querySelector('.audit-link').click());
  assert.deepEqual(opened,['doc-25']);
  assert.equal(rows()[0].querySelector('.audit-event-details p').textContent,'Detaliul 25');
  await search('absent-result');
  assert.match(document.body.textContent,/Nicio activitate găsită/);
  assert.equal(document.querySelector('.audit-pagination'),null);
  await search('');
  assert.equal(range(),'1–25 din 57 înregistrări');
});
