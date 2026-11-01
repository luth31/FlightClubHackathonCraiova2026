import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const initial=new JSDOM('<div/>',{url:'https://airport.test',pretendToBeVisual:true});
function install(window){for(const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','HTMLInputElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;}
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/people/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const {PeoplePage}=module.exports;initial.window.close();
const fixture=()=>({airport:{name:'Aeroportul Craiova'},simulation:{run_id:'run',revision:1,running:false,speed:1,elapsed_seconds:0,duration_seconds:3600,clock_time:'2026-10-30T08:00:00',scenario_mode:'normal'},staff:[{id:'worker',name:'Mara Stoica',title:'Agent poartă',present:false,card_label:'DEMO-NFC-101',expected_seconds:0}],events:[],permissions:{can_control:true}});
async function setup(t,{allowed=true,hash='#people',fail=false}={}){
  const dom=new JSDOM('<div id="root"/>',{url:`https://airport.test/${hash}`,pretendToBeVisual:true});install(dom.window);
  const state=fixture(),calls=[],reads=[];let failNext=fail;
  globalThis.fetch=async(input,options={})=>{
    const path=String(input);
    if(options.method==='POST'){
      const body=JSON.parse(options.body);calls.push({path,body});
      if(failNext){failNext=false;return Response.json({detail:'Conexiune indisponibilă'},{status:503})}
      state.simulation.revision++;
      if(path.endsWith('/nfc')){state.staff[0].present=body.action==='check_in';state.events.push({staff_id:'worker',kind:`nfc_${body.action}`,simulated_at:'2026-10-30T08:01:00'});state.simulation.clock_time='2026-10-30T08:01:03'}
      if(body.action==='reset'){state.simulation.run_id='manual';state.simulation.scenario_mode='interactive';state.simulation.elapsed_seconds=0;state.simulation.running=false;state.staff[0].present=false;state.events=[]}
      if(body.action==='start')state.simulation.running=true;
      return Response.json(state);
    }
    reads.push(path);
    if(path==='/api/people')return Response.json({items:[],departments:[],delegations:[],leaves:[],can_record_attendance:allowed,reference_date:'2026-10-30'});
    if(path==='/api/operations')return Response.json(state);
    throw new Error(`Unexpected read: ${path}`);
  };
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  await act(async()=>root.render(createElement(PeoplePage,{revision:0,notify:()=>{}})));
  await settle();return{state,calls,reads};
}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15))});}
async function click(label){const button=[...document.querySelectorAll('button')].find(el=>el.textContent.includes(label)||el.getAttribute('aria-label')===label);assert.ok(button,label);await act(async()=>button.click());await settle();}

test('NFC is tucked into the team overflow and does not load map services',async t=>{
  const {reads,calls}=await setup(t);
  const menu=document.querySelector('.people-more-actions');assert.ok(menu);assert.equal(menu.open,false);
  assert.equal(document.querySelector('.ops-station'),null);assert.equal(reads.includes('/api/operations'),false);
  await act(async()=>menu.querySelector('summary').click());await click('Pontaj NFC');
  assert.equal(location.hash,'#people?tab=attendance');assert.ok(document.querySelector('.ops-station'));
  assert.equal(calls.length,0);assert.ok(reads.every(path=>['/api/people','/api/operations'].includes(path)));
  await click('Înapoi la echipă');assert.equal(location.hash,'#people');assert.equal(document.querySelector('.ops-station'),null);
});

test('a phone link requires confirmation, records server time, and prevents duplicate check-in',async t=>{
  const {state,calls}=await setup(t,{hash:'#people?tab=attendance&card=DEMO-NFC-101'});
  assert.equal(calls.length,0);assert.match(document.querySelector('.ops-scan-person').textContent,/Mara Stoica/);
  await click('Confirmă intrarea');assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/operations/nfc');
  assert.equal(calls[0].body.card_id,'DEMO-NFC-101');assert.equal(calls[0].body.action,'check_in');assert.match(calls[0].body.request_id,/^[0-9a-f-]{36}$/);
  assert.match(document.querySelector('.ops-scan-receipt').textContent,/08:01:00/);assert.equal(state.staff[0].present,true);
  await click('Următorul card');await click('Mara Stoica');
  assert.equal(document.querySelector('.ops-confirm-scan').disabled,true);await click('Confirmă intrarea');assert.equal(calls.length,1);
  await click('Ieșire');await click('Confirmă ieșirea');assert.equal(calls[1].body.action,'check_out');assert.equal(state.staff[0].present,false);
});

test('failed scans remain actionable and do not display a false receipt',async t=>{
  const {calls}=await setup(t,{hash:'#people?tab=attendance&card=DEMO-NFC-101',fail:true});
  await click('Confirmă intrarea');assert.equal(document.querySelector('.ops-scan-receipt'),null);
  assert.match(document.body.textContent,/Conexiune indisponibilă/);assert.equal(document.querySelector('.ops-confirm-scan').disabled,false);
  await click('Confirmă intrarea');assert.equal(calls.length,2);assert.match(document.querySelector('.ops-scan-receipt').textContent,/Prezență înregistrată/);
});

test('card setup copies a URL for this airport and manual shifts require a deliberate action',async t=>{
  const {calls}=await setup(t,{hash:'#people?tab=attendance'});
  const copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
  await click('Copiază link NFC pentru Mara Stoica');assert.deepEqual(copied,['https://airport.test/#people?tab=attendance&card=DEMO-NFC-101']);
  const options=document.querySelector('.people-attendance-options');assert.equal(options.open,false);assert.equal(calls.length,0);
  await act(async()=>options.querySelector('summary').click());await click('Pornește tură cu pontaj');
  assert.deepEqual(calls[0].body,{action:'reset',scenario_mode:'interactive',expected_revision:1});
  assert.match(options.textContent,/Tura este în pauză/);await click('Pornește tura');assert.equal(calls[1].body.action,'start');
});

test('unprivileged users have no NFC action',async t=>{
  const {reads}=await setup(t,{allowed:false});assert.equal(document.querySelector('.people-more-actions'),null);assert.equal(reads.includes('/api/operations'),false);
});

test('direct NFC URLs do not bypass the directory permission gate',async t=>{
  const {calls,reads}=await setup(t,{allowed:false,hash:'#people?tab=attendance&card=DEMO-NFC-101'});
  assert.equal(document.querySelector('.ops-station'),null);assert.match(document.body.textContent,/Pontajul este disponibil/);
  assert.equal(calls.length,0);assert.equal(reads.includes('/api/operations'),false);
});
