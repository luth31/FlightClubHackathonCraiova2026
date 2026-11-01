import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/people/leave-calendar.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {monthDays,addDays,shiftMonth,weekStart,calendarWeekEvents}=module.exports;
const event=(id,starts_at,ends_at)=>({id,name:id,starts_at,ends_at,status:'approved'});

test('Monday-first month covers all days including adjacent months and leap day',()=>{
  const november=monthDays('2026-11-01');
  assert.equal(november[0],'2026-10-26');
  assert.equal(november.at(-1),'2026-12-06');
  assert.equal(november.length,42);
  assert(monthDays('2028-02-01').includes('2028-02-29'));
  assert.equal(shiftMonth('2026-12-31',1),'2027-01-01');
  assert.equal(shiftMonth('2026-03-31',-1),'2026-02-01');
});

test('date-only arithmetic is stable through DST and year boundaries',()=>{
  assert.equal(addDays('2026-03-29',1),'2026-03-30');
  assert.equal(addDays('2026-10-25',1),'2026-10-26');
  assert.equal(addDays('2027-01-01',-1),'2026-12-31');
  assert.equal(weekStart('2026-11-01'),'2026-10-26');
});

test('overlapping leave uses separate rows with inclusive start and end dates',()=>{
  const entries=calendarWeekEvents([
    event('long','2026-10-29','2026-11-06'),
    event('overlap','2026-11-03','2026-11-05'),
    event('same-day','2026-11-05','2026-11-05'),
    event('next','2026-11-06','2026-11-06'),
    event('outside','2026-11-09','2026-11-10'),
  ],'2026-11-02');
  assert.equal(entries.length,4);
  assert.deepEqual(entries.map(({event,column,span,row})=>[event.id,column,span,row]),[
    ['long',0,5,0],['overlap',1,3,1],['same-day',3,1,2],['next',4,1,1],
  ]);
  assert(entries[0].continuesBefore);
  assert(!entries[0].continuesAfter);
});

test('multi-week leave is clipped to each week without losing weekend days',()=>{
  const events=[event('vacation','2026-10-30','2026-11-10')];
  assert.deepEqual(['2026-10-26','2026-11-02','2026-11-09'].map(start=>{
    const {column,span,continuesBefore,continuesAfter}=calendarWeekEvents(events,start)[0];
    return [column,span,continuesBefore,continuesAfter];
  }),[[4,3,false,true],[0,7,true,true],[0,2,true,false]]);
});
