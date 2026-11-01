import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test',pretendToBeVisual:true});
function install(window){for(const key of ['window','document','navigator','location','history','localStorage','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.HTMLElement.prototype.scrollIntoView=function(){};}
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/features/reports/OperationsReport.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const {OperationsReport}=module.exports;initial.window.close();
const fixture=()=>({airport:'Craiova',scope:'all',period:{from:'2026-10-24',to:'2026-10-30'},generated_at:'2026-11-01T09:00:00Z',summary:{departures:3,completed:2,pending:1,arrivals:0,on_time:1,on_time_percent:50,delay_minutes:18,average_delay:9,major_delays:1,gate_openings:2,late_gates:1,recorded_events:8},daily:[{date:'2026-10-27',on_time:1,minor:0,major:1,delay_minutes:18}],gates:[{name:'G1',total:2,late:1,max_delay:18}],causes:[{name:'Disponibilitatea echipei',flights:1,minutes:18}],flights:[{id:'a',callsign:'FL101',route:'Craiova → Roma',gate_id:'G1',scheduled_at:'2026-10-27T08:20:00',actual_at:'2026-10-27T08:38:00',direction:'departure',delay_minutes:18,gate_delay_minutes:18,event_id:'a-departure',event_count:3},{id:'b',callsign:'FL202',route:'Craiova → Milano',gate_id:'G1',scheduled_at:'2026-10-27T08:18:00',actual_at:'2026-10-27T08:18:00',direction:'departure',delay_minutes:0,gate_delay_minutes:0,event_id:'b-departure',event_count:3},{id:'c',callsign:'FL303',route:'Craiova → Londra',gate_id:'G2',scheduled_at:'2026-10-30T08:20:00',actual_at:null,direction:'departure',delay_minutes:null,gate_delay_minutes:null,event_id:null,event_count:0}]});
async function setup(t,data=fixture(),hash='#reports?view=operations'){
 const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/'+hash,pretendToBeVisual:true});install(dom.window);
 const reads=[];globalThis.fetch=async url=>{reads.push(String(url));return Response.json(data)};
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
 await act(async()=>root.render(createElement(OperationsReport,{refreshKey:'one'})));
 return {reads,root};
}
const rows=()=>[...document.querySelectorAll('.or-source tbody tr')].map(row=>row.dataset.reportFlight);
async function click(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));assert.ok(b,text);await act(async()=>b.click())}
test('operations KPIs drill into measured flights and link exact ledger evidence',async t=>{
 const {reads}=await setup(t);assert.deepEqual(reads,['/api/reports/operations?days=7&scope=all']);
 assert.deepEqual(rows(),['a','b','c']);
 await click('Întârzieri de cel puțin');assert.deepEqual(rows(),['a']);
 await click('Registru');
 const params=new URLSearchParams(location.hash.split('?')[1]);assert.equal(params.get('event'),'a-departure');assert.equal(params.get('group'),'a');
 assert.match(params.get('returnTo'),/opsFilter=major/);assert.match(params.get('returnTo'),/opsFocus=a/);
});
test('report return restores date, scope, source filtering and keyboard focus',async t=>{
 const {reads}=await setup(t,fixture(),'#reports?view=operations&opsScope=current&opsDays=0&opsDate=2026-10-27&opsFilter=major&opsFocus=a');
 assert.deepEqual(reads,['/api/reports/operations?days=0&scope=current']);assert.deepEqual(rows(),['a']);
 assert.equal(document.activeElement.getAttribute('aria-label'),'Vezi FL101 din 27 oct. în registru');
 await click('Resetează');assert.deepEqual(rows(),['a','b','c']);
});
test('empty operations data displays unknown rates and does not invent a chart',async t=>{
 const data=fixture();for(const key of Object.keys(data.summary))data.summary[key]=0;data.summary.on_time_percent=null;data.summary.average_delay=null;
 data.daily=[];data.gates=[];data.causes=[];data.flights=[];
 await setup(t,data);assert.match(document.querySelector('.or-kpis').textContent,/Plecări la timp—/);
 assert.match(document.body.textContent,/Nicio plecare încheiată/);assert.equal(document.querySelectorAll('.or-day-chart button').length,0);
 assert.equal(document.querySelectorAll('.or-source tbody tr').length,0);
});
