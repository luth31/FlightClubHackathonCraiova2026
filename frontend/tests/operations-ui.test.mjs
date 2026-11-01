import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test',pretendToBeVisual:true});
function install(window){for(const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','HTMLInputElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.HTMLElement.prototype.scrollIntoView=function(){};}
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/features/operations/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'scene',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:'react',external:true}));builder.onResolve({filter:/^\.\/AirportScene$/},()=>({path:'scene',namespace:'scene'}));builder.onLoad({filter:/.*/,namespace:'scene'},()=>({contents:"const React=require('react');exports.AirportScene=function(props){globalThis.sceneProps=props;React.useEffect(()=>{globalThis.sceneMounts++;return()=>{globalThis.sceneUnmounts++}},[]);return React.createElement('div',{'data-scene':props.mapMode,'data-active':String(props.active)});}"}));}}]});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const {OperationsPage}=module.exports;initial.window.close();
const fixture=()=>({airport:{id:'craiova',icao:'LRCV',name:'Aeroportul Craiova',lat:44.318,lon:23.888,elevation_m:191},simulation:{run_id:'run',revision:1,running:false,speed:30,elapsed_seconds:0,duration_seconds:3600,clock_time:'2026-10-30T08:00:00',scenario_mode:'interactive'},flights:[{id:'flight-101',callsign:'FL101',aircraft_type:'A320',origin:'Craiova',destination:'Londra',direction:'departure',gate_id:'G1',scheduled_departure_seconds:1200,actual_departure_seconds:null,delay_minutes:0,severity:'neutral',emergency:false,phase:'at_gate',position:{lat:44.318,lon:23.888,altitude_m:191,heading:270}}],gates:[{id:'G1',open:false,assigned_staff_id:'worker',opened_by:'relief',planned_open_seconds:240}],staff:[{id:'worker',name:'Mara Stoica',title:'Agent poartă',present:false,card_label:'DEMO-NFC-101',expected_seconds:0},{id:'relief',name:'Alex Marin',title:'Agent rezervă',present:true,card_label:'DEMO-NFC-104',expected_seconds:1200}],events:[],kpis:{},thresholds:{major_delay_minutes:15,minor_delay_minutes:1},permissions:{can_control:true}});
const metrics={completed_departures:12,on_time_percent:75,delay_minutes:60,late_gate_openings:3,staff_late:2,open_risks:1};
const ledger=()=>({reference_date:'2026-10-30',metrics,filtered_metrics:metrics,days:[{date:'2026-10-30',severity:'yellow',flights:[{id:'flight-101',callsign:'FL101',source:'interactive',category:'flight',route:'Craiova → Londra',gate_id:'G1',scheduled_at:'2026-10-30T08:20:00',actual_at:null,status:'blocked',severity:'yellow',delay_minutes:0,events:[{id:'e1',kind:'nfc_check_in',title:'Card de rezervă',actor:'Alex Marin',detail:'Prezent',planned_at:'2026-10-30T08:20:00',actual_at:'2026-10-30T08:22:00',delay_minutes:2,severity:'yellow'},{id:'e2',kind:'staff_absent',title:'Agentul alocat lipsește',actor:'Coordonator',planned_at:'2026-10-30T08:04:00',actual_at:'2026-10-30T08:04:00',delay_minutes:0,severity:'yellow'}]}]}]});
const strategies=()=>({can_draft:true,items:[{id:'reserve',title:'Agent de rezervă',sop_code:'SOP-01',problem:'Porți întârziate',evidence_count:1,evidence:[{group_id:'flight-101',callsign:'FL101',date:'2026-10-30',delay_minutes:18}],current_rule:'Verificare la deschidere',proposed_rule:'Verificare înainte de deschidere',changes:['Confirmare rezervă'],baseline:{delay_minutes:60},estimate:{delay_minutes:42,minutes_saved:18},assumptions:['Rezerva disponibilă'],document_id:null}]});
async function setup(t,{control=false,elapsed=0,running=false,timelineDelay=0,live=[],hash='#operations',permission=true,mapConfig={google_api_key:null,default_mode:'model',photorealistic_available:false}}={}){const dom=new JSDOM('<div id="root"/>',{url:`http://flyleaf.test/${hash}`,pretendToBeVisual:true});install(dom.window);globalThis.sceneMounts=0;globalThis.sceneUnmounts=0;const state=fixture(),calls=[],reads=[];state.permissions.can_control=permission;state.simulation.elapsed_seconds=elapsed;state.simulation.running=running;state.simulation.clock_time='2026-10-30T'+String(8+Math.floor(elapsed/3600)).padStart(2,'0')+':'+String(Math.floor(elapsed%3600/60)).padStart(2,'0')+':00';globalThis.fetch=async(input,options={})=>{const path=String(input);if(options.method==='POST'){const body=JSON.parse(options.body||'{}');calls.push({path,body});if(path.includes('/strategies/'))return Response.json({document_id:'sop-draft'});state.simulation.revision++;if(body.action==='pause')state.simulation.running=false;if(body.action==='advance_to')state.simulation.elapsed_seconds=body.target_seconds;if(path.endsWith('/nfc')){state.staff.find(person=>person.card_label===body.card_id).present=true;state.simulation.clock_time='2026-10-30T08:22:00';}if(control){state.simulation.clock_time='2026-10-30T08:22:00';state.flights[0].delay_minutes=18;state.flights[0].severity='red';}return Response.json(state);}reads.push(path);if(path.includes('/timeline?')){const seconds=Number(new URL(path,'http://flyleaf.test').searchParams.get('at_seconds'));const preview=structuredClone(state);preview.simulation.elapsed_seconds=seconds;preview.simulation.clock_time='2026-10-30T'+String(8+Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds%3600/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');preview.permissions.can_control=false;preview.flights[0].position.lon+=seconds/100000;preview.timeline={at_seconds:seconds,current_seconds:state.simulation.elapsed_seconds,projected:seconds>state.simulation.elapsed_seconds,events:[{id:'gate-due',sequence:1,elapsed_seconds:240,kind:'staff_absent',flight_id:'flight-101',gate_id:'G1',title:'G1 · agent absent',projected:240>state.simulation.elapsed_seconds},{id:'departure',sequence:2,elapsed_seconds:1200,kind:'departure_blocked',flight_id:'flight-101',title:'FL101 · plecare întârziată',projected:1200>state.simulation.elapsed_seconds},{id:'reserve',sequence:3,elapsed_seconds:1260,kind:'nfc_check_in',staff_id:'relief',title:'Pontaj Alexandru',projected:true},{id:'opened',sequence:4,elapsed_seconds:1320,kind:'gate_open',flight_id:'flight-101',gate_id:'G1',staff_id:'relief',title:'G1 deschisă de rezervă',projected:true}]};if(timelineDelay)await new Promise(resolve=>setTimeout(resolve,timelineDelay));return Response.json(preview);}if(path.endsWith('/runs'))return Response.json({items:[{run_id:'run',is_current:true,event_count:1,started_at:'2026-10-30T08:00:00Z'},{run_id:'old-run',is_current:false,event_count:31,started_at:'2026-10-29T08:00:00Z'}]});if(path.includes('/events?')){const offset=Number(new URL(path,'http://flyleaf.test').searchParams.get('offset'));return Response.json({items:Array.from({length:Math.min(30,31-offset)},(_,i)=>({id:'old-'+(offset+i),simulated_at:'2026-10-29T08:22:00',title:'Acțiune arhivată '+(offset+i),actor:'Operator',source:'operator',detail:'Eveniment păstrat'})),total:31});}if(path.includes('/ledger')){const result=ledger();if(path.includes('status=attention'))result.filtered_metrics={...metrics,on_time_percent:0,completed_departures:3};return Response.json(result);}if(path.endsWith('/strategies'))return Response.json(strategies());if(path.endsWith('map-config'))return Response.json(mapConfig);if(path.endsWith('traffic'))return Response.json({status:'fresh',poll_after_seconds:30,aircraft:live,notice:'Poziții publice'});return Response.json(state);};const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close();});await act(async()=>root.render(createElement(OperationsPage,{notify:()=>{}})));await settle();return {state,calls,reads};}
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});}
const visible=element=>!element.closest('[hidden]');
async function click(label){const button=[...document.querySelectorAll('button')].find(el=>visible(el)&&el.textContent.includes(label));assert.ok(button,label);await act(async()=>button.click());await settle();}

test('scenario clock keeps local hour and map receives airport-relative and reported altitude',async t=>{await setup(t);assert.equal(document.querySelector('.ops-clock strong').textContent,'08:00:00');assert.equal(globalThis.sceneProps.flights[0].altitude_m,0);assert.equal(globalThis.sceneProps.flights[0].reported_altitude_m,191);assert.equal(globalThis.sceneProps.flights[0].status,'neutral');});
test('next event submits semantic command and updates severe delay color',async t=>{const {calls}=await setup(t,{control:true});await click('Următorul eveniment');assert.equal(calls[0].path,'/api/operations/control');assert.deepEqual(calls[0].body,{action:'step'});assert.equal(globalThis.sceneProps.flights[0].status,'critical');assert.match(document.querySelector('.ops-flight-status').textContent,/18 min/);});
test('pitch milestone advances to exact scenario time without fabricating an attendance event',async t=>{const {calls}=await setup(t);assert.equal(document.querySelector('.ops-rehearsal').open,false);await act(async()=>{document.querySelector('.ops-rehearsal').open=true});await click('08:22 · intervenție');assert.deepEqual(calls[0].body,{action:'advance_to',target_seconds:1320});});
test('flight investigation opens the ledger with linked staff evidence and marks zero-minute absence as an exception',async t=>{await setup(t);await click('Vezi firul evenimentelor');const rows=document.querySelector('.ops-ledger-evidence');assert.match(rows.textContent,/Card de rezervă/);assert.match(rows.textContent,/Alex Marin/);const absent=[...rows.querySelectorAll('.ops-ledger-event')].find(row=>row.textContent.includes('Agentul alocat'));assert.match(absent.textContent,/Abatere/);assert.doesNotMatch(absent.textContent,/La timp/);assert.equal(globalThis.sceneProps.active,false);});
test('NFC URL only selects a card, explicit confirmation records exactly once with request ID and server timestamp',async t=>{const {calls}=await setup(t,{hash:'#operations?view=station&card=DEMO-NFC-101'});assert.equal(calls.length,0);assert.match(document.querySelector('.ops-scan-person').textContent,/Mara Stoica/);await click('Confirmă intrarea');assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/operations/nfc');assert.equal(calls[0].body.card_id,'DEMO-NFC-101');assert.equal(calls[0].body.action,'check_in');assert.match(calls[0].body.request_id,/^[a-f\d-]{36}$/);assert.match(document.querySelector('[role=status]').textContent,/08:22:00/);});
test('lowercase NFC link resolves to its canonical card and read-only users cannot submit with Enter',async t=>{const {calls}=await setup(t,{hash:'#operations?view=station&card=demo-nfc-101',permission:false});assert.match(document.querySelector('.ops-scan-person').textContent,/Mara/);await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(calls.length,0);});
test('filtered ledger KPI values use selected evidence and not global totals',async t=>{await setup(t);await click('Registru operațional');assert.match(document.querySelector('.ops-ledger-metrics').textContent,/75%/);await click('Doar abateri');assert.match(document.querySelector('.ops-ledger-metrics').textContent,/0%/);assert.doesNotMatch(document.querySelector('.ops-ledger-metrics').textContent,/75%/);});
test('SOP proposal creates a draft document and links into existing document workflow',async t=>{const {calls}=await setup(t);await click('Proceduri SOP');await click('Creează draft SOP');assert.equal(calls[0].path,'/api/operations/strategies/reserve/draft');assert.equal(document.querySelector('.ops-strategy-footer a').getAttribute('href'),'#document/sop-draft?from=operations');});
test('live traffic never invents delays or draws unknown altitude on the ground',async t=>{await setup(t,{live:[{id:'live-1',callsign:'LIVE1',position:{lat:44.318,lon:23.888,altitude_m:1191,heading:null},severity:'neutral',delay_minutes:null},{id:'live-2',callsign:'LIVE2',position:{lat:44.318,lon:23.888,altitude_m:null,heading:100},severity:'neutral',delay_minutes:null}]});await click('Trafic ADS-B');assert.equal(globalThis.sceneProps.flights.length,1);assert.equal(globalThis.sceneProps.flights[0].altitude_m,1000);assert.equal(globalThis.sceneProps.trafficMode,true);assert.match(document.querySelector('.ops-flight-status').textContent,/Fără orar/);assert.equal(globalThis.sceneProps.flights[0].source,'live');});

test('rehearsal archive excludes the current run and paginates preserved events',async t=>{const {reads}=await setup(t);await click('Registru operațional');await act(async()=>{document.querySelector('.ops-run-archive').open=true});await settle();await settle();assert.equal(document.querySelectorAll('.ops-run-archive option').length,1);assert.equal(document.querySelectorAll('.ops-run-archive li').length,30);const next=document.querySelector('[aria-label=\"Evenimente următoare\"]');await act(async()=>next.click());await settle();assert.equal(document.querySelectorAll('.ops-run-archive li').length,1);assert.match(document.querySelector('.ops-run-archive li').textContent,/Acțiune arhivată 30/);assert.ok(reads.some(path=>path.includes('run_id=old-run')&&path.includes('offset=30')));});

const googleConfig={google_api_key:'test-key',default_mode:'photorealistic',photorealistic_available:true};
async function selectMapStyle(style){await act(async()=>{const select=document.querySelector('[aria-label="Stil hartă"]');select.value=style;select.dispatchEvent(new window.Event('change',{bubbles:true}));});await settle();}
test('map styles retain their instances across NFC, ledger, SOP and traffic navigation',async t=>{
  await setup(t,{mapConfig:googleConfig});
  const google=document.querySelector('[data-scene="photorealistic"]');assert.ok(google);
  const initialMounts=globalThis.sceneMounts;
  for(const destination of ['Stație mobilă','Registru operațional','Proceduri SOP']){
    await click(destination);assert.equal(google.dataset.active,'false');assert.ok(google.closest('[hidden]'));
    await click(destination==='Stație mobilă'?'Înapoi':'Tura curentă');
    assert.equal(document.querySelector('[data-scene="photorealistic"]'),google);
    assert.equal(google.dataset.active,'true');assert.equal(globalThis.sceneMounts,initialMounts);
  }
  await selectMapStyle('model');const model=document.querySelector('[data-scene="model"]');assert.ok(model);
  const mounts=globalThis.sceneMounts;
  await selectMapStyle('photorealistic');await click('Trafic ADS-B');await click('Simulare');
  assert.equal(document.querySelector('[data-scene="photorealistic"]'),google);
  assert.equal(google.dataset.active,'true');assert.equal(model.dataset.active,'false');
  await selectMapStyle('model');assert.equal(document.querySelector('[data-scene="model"]'),model);
  assert.equal(globalThis.sceneMounts,mounts);assert.equal(globalThis.sceneUnmounts,0);
});
test('opening an NFC link creates no map until the shift is explicitly opened',async t=>{
  await setup(t,{hash:'#operations?view=station',mapConfig:googleConfig});
  assert.equal(globalThis.sceneMounts,0);assert.equal(document.querySelector('[data-scene]'),null);
  await click('Înapoi');assert.equal(globalThis.sceneMounts,1);
  await click('Stație mobilă');await click('Înapoi');assert.equal(globalThis.sceneMounts,1);
});
test('direct ledger entry does not initialize Google imagery in the hidden shift',async t=>{
  await setup(t,{hash:'#operations?view=ledger',mapConfig:googleConfig});
  assert.equal(globalThis.sceneMounts,0);
  await click('Tura curentă');assert.equal(globalThis.sceneMounts,1);
});


async function scrub(seconds){
  const slider=document.querySelector('[aria-label="Momentul simulării"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(slider,String(seconds));slider.dispatchEvent(new window.Event('input',{bubbles:true}));});
}
async function waitTimeline(ms=210){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))});}

test('timeline scrubbing reconstructs the map without mutating the shift or remounting its scene',async t=>{
  const {calls,state}=await setup(t,{elapsed:1800});
  const originalLon=state.flights[0].position.lon,mounts=globalThis.sceneMounts;
  await scrub(240);await waitTimeline();
  assert.equal(document.querySelector('.ops-clock strong').textContent,'08:04:00');
  assert.match(document.querySelector('.ops-timeline-heading').textContent,/Istoric/);
  assert.equal(globalThis.sceneProps.flights[0].lon,originalLon+.0024);
  assert.equal(state.simulation.elapsed_seconds,1800);assert.equal(calls.length,0);
  assert.equal(document.querySelector('.ops-manual-actions'),null);
  assert.equal(globalThis.sceneMounts,mounts);
  await click('Revino la tură');
  assert.equal(globalThis.sceneProps.flights[0].lon,originalLon);
  assert.equal(document.querySelector('.ops-clock strong').textContent,'08:30:00');
});

test('timeline markers preview exact event time and advancing requires an explicit action',async t=>{
  const {calls}=await setup(t);
  const marker=document.querySelector('.ops-timeline-markers button');
  await act(async()=>marker.click());await waitTimeline();
  assert.equal(document.querySelector('[type=range]').value,'240');
  assert.match(document.querySelector('.ops-timeline-heading').textContent,/Proiecție/);
  assert.equal(calls.length,0);
  await click('Avansează tura aici');
  assert.deepEqual(calls[0].body,{action:'advance_to',target_seconds:240,expected_revision:1});
  assert.equal(document.querySelector('.ops-timeline.is-preview'),null);
});

test('rapid timeline dragging resolves to the newest cursor and pauses a running clock only once',async t=>{
  const {calls}=await setup(t,{running:true,timelineDelay:50});
  await scrub(900);await scrub(1200);await scrub(1321);await waitTimeline(400);
  assert.equal(document.querySelector('.ops-clock strong').textContent,'08:22:01');
  assert.equal(document.querySelector('[type=range]').value,'1321');
  assert.deepEqual(calls.map(call=>call.body.action),['pause']);
});

test('read-only users can inspect the timeline without controls, and ADS-B has no simulation timeline',async t=>{
  const {calls}=await setup(t,{permission:false});
  await scrub(2100);await waitTimeline();
  assert.equal(document.querySelector('.ops-clock strong').textContent,'08:35:00');
  assert.ok(![...document.querySelectorAll('button')].some(button=>button.textContent.includes('Avansează tura aici')));
  assert.equal(calls.length,0);
  await click('Trafic ADS-B');
  assert.equal(document.querySelector('.ops-timeline'),null);
  assert.equal(globalThis.sceneProps.trafficMode,true);
});


test('flight timeline includes NFC attendance of the substitute who opens its gate',async t=>{
  await setup(t);
  const markers=[...document.querySelectorAll('.ops-timeline-markers button')].map(button=>button.getAttribute('aria-label'));
  assert.ok(markers.some(label=>label.includes('08:21:00 · Pontaj Alexandru')));
  assert.ok(markers.some(label=>label.includes('08:22:00 · G1 deschisă de rezervă')));
});
