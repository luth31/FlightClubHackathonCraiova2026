import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {dependencyLayout} from '../src/components/graph-layout.ts';

function install(window){for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true}
const initial=new JSDOM('<div/>');install(initial.window);const {createRoot}=await import('react-dom/client');
async function component(path,name){const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports[name]}
const OperationsProcess=await component('../src/features/operations/OperationsProcess.tsx','OperationsProcess');
const DocumentStateFlow=await component('../src/features/documents/DocumentStateFlow.tsx','DocumentStateFlow');initial.window.close();
async function render(t,Component,props){const dom=new JSDOM('<div id="root"/>',{pretendToBeVisual:true});install(dom.window);const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});await act(async()=>root.render(createElement(Component,props)))}
const click=async selector=>{const element=document.querySelector(selector);assert.ok(element,selector);await act(async()=>element.click())};

test('parallel branches occupy the same dependency depth and join only after all inputs',()=>{
  const ids=['ready','fuel','clean','onblock'];
  const edges=[{source:'onblock',target:'fuel'},{source:'onblock',target:'clean'},{source:'fuel',target:'ready'},{source:'clean',target:'ready'}];
  const layout=dependencyLayout(ids,edges);
  assert.equal(layout.get('fuel').column,layout.get('clean').column);
  assert.notEqual(layout.get('fuel').row,layout.get('clean').row);
  assert.ok(layout.get('ready').column>layout.get('fuel').column);
  assert.ok(layout.get('onblock').column<layout.get('fuel').column);
});

test('planned nodes show conditions; only recorded operations can open evidence',async t=>{
  const inspections=[];
  const node={kind:'fuel_ready',activity:'fuel',title:'Alimentare încheiată',from_label:'În desfășurare',to_label:'Încheiat',planned_at:'2026-11-01T09:00:00',actual_at:null,actor:'Echipă handling',detail:'Confirmarea alimentării',missing:[]};
  const process={nodes:[{...node,id:'real',tone:'danger',status:'Înregistrat · +20 min',recorded:true,actual_at:'2026-11-01T09:20:00'},{...node,id:'future',tone:'neutral',status:'Necesită confirmare',recorded:false,missing:['Pregătire']}],edges:[],machines:[],guards:[],observations:[]};
  await render(t,OperationsProcess,{process,onInspect:target=>inspections.push(target)});
  await click('[data-graph-node=future]');assert.match(document.querySelector('.state-flow-summary').textContent,/Confirmări lipsă: Pregătire/);assert.equal(document.querySelector('.state-flow-summary button'),null);
  await click('[data-graph-node=real]');assert.ok(document.querySelector('[data-graph-node=real]').classList.contains('tone-danger'));
  await click('.state-flow-summary button');assert.equal(inspections[0].id,'real');
});

test('state machine shows rejection and archive guards without presenting transitions as completed',async t=>{
  const diagram={current:'in_review',states:[{id:'draft',label:'Ciornă'},{id:'in_review',label:'În avizare'},{id:'approved',label:'Aprobat'},{id:'archived',label:'Arhivat'}],transitions:[{source:'in_review',target:'draft',label:'Returnează',action:'reject',condition:'Motiv obligatoriu; validarea se reia.'},{source:'approved',target:'archived',label:'Arhivează',action:'archive',condition:'Semnătura nu este obligatorie.'}],metadata_validated:true,version_signed:false,version_note:'Versiunea nouă reia validarea.'};
  await render(t,DocumentStateFlow,{diagram});
  assert.match(document.querySelector('.state-flow-summary').textContent,/Motiv obligatoriu/);
  assert.ok(document.querySelector('[data-graph-node=in_review]').classList.contains('current'));
  assert.equal(document.querySelectorAll('.tone-success').length,0);
  await click('[data-graph-node=approved]');assert.match(document.querySelector('.state-flow-summary').textContent,/Semnătura nu este obligatorie/);
  assert.equal(document.querySelectorAll('.state-graph-edge.correction').length,1);
});
