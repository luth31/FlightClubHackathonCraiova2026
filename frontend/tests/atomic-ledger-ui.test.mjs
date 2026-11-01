import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test',pretendToBeVisual:true});
function install(window){for(const key of ['window','document','navigator','location','localStorage','HTMLElement','Event','MouseEvent','CustomEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.ResizeObserver=class{observe(){}disconnect(){}};window.HTMLElement.prototype.scrollIntoView=function(){};}
install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundled=await build({stdin:{contents:"export {OperationsLedger} from './src/features/operations/Ledger'; export {PersonDirectoryProvider} from './src/components/people/PersonDirectory';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {OperationsLedger,PersonDirectoryProvider}=module.exports;initial.window.close();
const gate={id:'airport-gate-1',kind:'gate',code:'G1',label:'G1',role:'location',attributes:{}};
const operation={activity:'fuel',activity_label:'Alimentare',from_label:'În desfășurare',to_label:'Încheiat',dependencies:['started'],validation:'validated'};
const done={id:'done',title:'Alimentare încheiată',kind:'fuel_ready',actor:'Handling',detail:'',source:'operator',severity:'neutral',planned_at:'2026-10-30T08:00:00',actual_at:'2026-10-30T08:01:00',operation,entities:[gate],audit:{recorded_by:'Dispecer',recorded_at:'2026-11-01T06:00:00Z'},dependencies:[{id:'started',title:'Alimentare începută',actual_at:'2026-10-30T07:45:00'}],integrity_verified:true};
const metrics={on_time_percent:null,completed_departures:0,delay_minutes:0,late_gate_openings:0,staff_late:0,open_risks:0};
const worker={id:'ops-person-1',kind:'person',code:'staff-sorin',label:'Sorin Pavel',role:'participant',attributes:{title:'Agent poartă',registry:'Personal operațional'}};
const recorder={id:'account-person-1',kind:'person',code:'account:sorin-login',label:'Sorin Pavel',role:'recorder',attributes:{registry:'Cont FlyLeaf'}};
async function setup(t,{failed=false,people=false}={}){
 const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/#operations?view=ledger',pretendToBeVisual:true});install(dom.window);const reads=[];const completed=people?{...done,severity:'red',delay_minutes:18,entities:[gate,worker,recorder]}:done;
 globalThis.fetch=async input=>{const path=String(input);reads.push(path);
  if(path.endsWith('/people'))return Response.json({items:[{id:'sorin-login',name:'Sorin Pavel',email:'sorin@example.test',department:'Tehnic',job_title:'Șef departament',role:'manager',availability:'available'}],current_user_id:'someone-else'});
  if(path.includes('/entities/'))return Response.json({entity:path.includes(worker.id)?worker:gate,kind_label:path.includes(worker.id)?'Persoană':'Poartă',events:[completed],total:1,offset:0,limit:50});
  if(path.includes('/facts/')){if(failed)return Response.json({detail:'Eveniment indisponibil'},{status:404});return Response.json(path.endsWith('started')?{...done,id:'started',title:'Alimentare începută',dependencies:[]}:completed);}
  if(path.includes('/runs'))return Response.json({items:[]});
  return Response.json({metrics,reference_date:'2026-10-30',days:[{date:'2026-10-30',severity:'neutral',flights:[{id:'f1',callsign:'FL101',route:'Craiova → Roma',gate_id:'G1',scheduled_at:'2026-10-30T08:20:00',status:'boarding',severity:'neutral',actual_at:null,entities:[gate],events:[completed,{...done,id:'pending',title:'Decolare',actual_at:null,severity:'red',delay_minutes:18,operation:{...operation,activity:'aircraft',activity_label:'Aeronavă'}}],activities:[{id:'fuel',label:'Alimentare',event_count:1,state:'Încheiat'},{id:'aircraft',label:'Aeronavă',event_count:1,state:'Planificat'}]}]}]});
 };
 const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
 await act(async()=>root.render(createElement(PersonDirectoryProvider,{revision:1},createElement(OperationsLedger,{revision:1,runId:'run',focusFlight:'f1'}))));
 return {reads};
}
async function click(text,scope=document){const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>b.click())}

test('entity → event → prerequisite → back keeps the underlying flight open',async t=>{
 const {reads}=await setup(t);await click('G1');
 assert.equal(document.querySelector('[role=dialog] h2').textContent,'G1');
 await act(async()=>document.querySelector('.ops-entity-history button').click());
 assert.match(document.querySelector('[role=dialog]').textContent,/Înregistrat deDispecer/);
 await act(async()=>document.querySelector('.ops-fact-dependencies button').click());
 assert.equal(document.querySelector('[role=dialog] h2').textContent,'Alimentare începută');
 await act(async()=>document.querySelector('.ops-inspector-back').click());
 assert.equal(document.querySelector('[role=dialog] h2').textContent,'Alimentare încheiată');
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
 assert.equal(document.querySelector('[role=dialog]'),null);
 assert.ok(document.querySelector('[data-flight-id=f1]').open);
 assert.ok(reads.includes('/api/operations/facts/started'));
});

test('activity filters are local and all-history scope removes the current-run constraint',async t=>{
 const {reads}=await setup(t);
 await act(async()=>document.querySelector('.ops-activity-filter button:nth-child(2)').click());
 assert.equal(document.querySelectorAll('[data-event-id]').length,1);
 assert.equal(document.querySelector('[data-event-id]').dataset.eventId,'done');
 await click('Tot registrul');
 assert.equal(new URL(reads.at(-1),'http://flyleaf.test').searchParams.get('run_id'),null);
 assert.equal(document.querySelector('.ops-ledger-date input').type,'date');
 await act(async()=>document.querySelector('.ops-activity-filter button:first-child').click());
 assert.equal(document.querySelector('[data-event-id=pending] .ops-event-title').disabled,true);
});

test('failed fact lookup stays in the inspector and can return to its entity',async t=>{
 await setup(t,{failed:true});await click('G1');
 await act(async()=>document.querySelector('.ops-entity-history button').click());
 assert.match(document.querySelector('[role=dialog]').textContent,/Eveniment indisponibil/);
 await act(async()=>document.querySelector('.ops-inspector-back').click());
 assert.ok(document.querySelector('.ops-entity-history'));
});


test('operational people have hover details without borrowing a same-name account, and click retains audit navigation',async t=>{
 const {reads}=await setup(t,{people:true});
 const triggers=document.querySelectorAll('[data-event-id=done] .person-avatar-trigger');
 assert.equal(triggers.length,2);
 await act(async()=>{triggers[0].dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,220))});
 let profile=document.querySelector('.person-profile');
 assert.match(profile.textContent,/Agent poartă/);
 assert.match(profile.textContent,/staff-sorin/);
 assert.doesNotMatch(profile.textContent,/sorin@example.test|Șef departament|Offline/);
 assert.equal(reads.filter(path=>path.includes('/entities/')).length,0,'hover uses the existing typed identity, without loading full history');
 await act(async()=>triggers[0].click());
 assert.ok(reads.some(path=>path.includes('/entities/ops-person-1')));
 assert.ok(document.querySelector('.ops-entity-history'));
 assert.equal(document.querySelector('.person-profile'),null);
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>triggers[1].focus());
 profile=document.querySelector('.person-profile');
 assert.match(profile.textContent,/sorin@example.test/);
 assert.match(profile.textContent,/Șef departament/);
 assert.match(profile.textContent,/Tehnic/);
 await act(async()=>triggers[1].dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true})));
 assert.equal(document.activeElement.className,'person-profile-close');
 await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 assert.equal(document.querySelector('.person-profile'),null);
 assert.equal(document.activeElement,triggers[1]);
});

test('critical severity remains visible through fact inspection and hovering inside it preserves the inspector',async t=>{
 await setup(t,{people:true});
 const pending=document.querySelector('[data-event-id=pending]');
 assert.ok(pending.classList.contains('severity-red'));
 assert.equal(pending.querySelector('.ops-event-title').disabled,true);
 assert.match(pending.querySelector('.ops-event-delta').textContent,/18 min/);
 await click('Alimentare încheiată');
 assert.ok(document.querySelector('.ops-fact-transition.severity-red'));
 assert.match(document.querySelector('.ops-fact-transition').textContent,/18 min întârziere/);
 const trigger=document.querySelector('.ops-fact-entities .person-avatar-trigger');
 await act(async()=>trigger.focus());
 assert.ok(document.querySelector('.person-profile'));
 await act(async()=>trigger.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 assert.equal(document.querySelector('.person-profile'),null);
 assert.ok(document.querySelector('.ops-inspector'),'Escape dismisses only the hover card');
});
