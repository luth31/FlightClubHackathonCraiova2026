import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {monthDays,moveMonth,selectRange,overlaps} from '../src/features/people/leave-calendar-model.ts';

test('calendar uses inclusive dates, Monday-first grids and reverse range selection',()=>{
  const days=monthDays('2026-11-01');assert.equal(days.length,42);assert.equal(days[0],'2026-10-26');assert.equal(days[41],'2026-12-06');
  assert.equal(moveMonth('2026-12-01',1),'2027-01-01');
  assert.deepEqual(selectRange({starts_at:'2026-11-13',ends_at:'2026-11-13'},'2026-11-09',true),{starts_at:'2026-11-09',ends_at:'2026-11-13'});
  assert.equal(overlaps({starts_at:'2026-11-09',ends_at:'2026-11-13'},{starts_at:'2026-11-13',ends_at:'2026-11-16'}),true);
  assert.equal(overlaps({starts_at:'2026-11-09',ends_at:'2026-11-13'},{starts_at:'2026-11-14',ends_at:'2026-11-16'}),false);
});

function install(window){for(const key of ['window','document','navigator','location','localStorage','HTMLElement','Event','MouseEvent','KeyboardEvent'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.HTMLElement.prototype.scrollIntoView=function(){}}
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test',pretendToBeVisual:true});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/people/LeaveRangePlanner.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {LeaveRangePlanner}=module.exports;initial.window.close();
const leaves=[{id:'andrei',user_id:'technician',name:'Andrei Neagu',department:'Tehnic',starts_at:'2026-11-09',ends_at:'2026-11-13',status:'approved'},
 {id:'irina',user_id:'irina',name:'Irina Dobre',department:'Tehnic',starts_at:'2026-11-12',ends_at:'2026-11-16',status:'pending'},
 {id:'elena',user_id:'reviewer',name:'Elena Popa',department:'Conformitate',starts_at:'2026-11-12',ends_at:'2026-11-13',status:'approved'}];
async function setup(t,currentUserId='admin'){
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test',pretendToBeVisual:true});install(dom.window);const reads=[],requests=[];
  globalThis.fetch=async path=>{reads.push(String(path));return Response.json({items:leaves})};
  const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  await act(async()=>root.render(createElement(LeaveRangePlanner,{referenceDate:'2026-11-01',currentUserId,people:leaves.map(l=>({id:l.user_id,name:l.name,department:l.department,active:true})),revision:0,onRequest:range=>requests.push(range)})));
  return {reads,requests};
}
async function click(selector){await act(async()=>document.querySelector(selector).click())}

test('month calendar distinguishes pending and approved leave and passes the selected period into a request',async t=>{
  const {reads,requests}=await setup(t);
  assert.equal(document.querySelectorAll('.leave-planner-day').length,42);
  assert.ok(document.querySelector('[data-calendar-day="2026-11-12"] .approved'));
  assert.ok(document.querySelector('[data-calendar-day="2026-11-12"] .pending'));
  await click('[data-calendar-day="2026-11-12"]');await click('[data-calendar-day="2026-11-13"]');
  assert.equal(document.querySelectorAll('.leave-planner-agenda-person').length,3);
  await click('.leave-planner-agenda>.button');
  assert.deepEqual(requests,[{starts_at:'2026-11-12',ends_at:'2026-11-13'}]);
  const select=document.querySelector('select');await act(async()=>{select.value='Tehnic';select.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(document.querySelectorAll('.leave-planner-agenda-person').length,2);
  assert.doesNotMatch(document.querySelector('.leave-planner-agenda').textContent,/Elena/);
  await click('[aria-label="Luna următoare"]');assert.ok(reads.some(path=>path.includes('starts_at=2026-11-30')));
});

test('a person cannot request an already booked selection and arrow keys move focus',async t=>{
  await setup(t,'technician');
  const day=document.querySelector('[data-calendar-day="2026-11-09"]');day.focus();
  await act(async()=>day.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  assert.equal(document.activeElement.dataset.calendarDay,'2026-11-10');
  await click('[data-calendar-day="2026-11-09"]');await click('[data-calendar-day="2026-11-10"]');
  assert.equal(document.querySelector('.leave-planner-agenda>.button').disabled,true);
  assert.match(document.querySelector('.leave-planner-own-overlap').textContent,/Ai deja o cerere/);
});
