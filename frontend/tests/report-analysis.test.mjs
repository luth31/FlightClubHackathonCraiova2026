import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterRows,matrix,currencyAmounts,ageDays,expiryBuckets,stageCoverage,activityRows,calendarDay} from '../src/features/reports/analysis.ts';

const rows=[
 {id:'a',department:'Finance',status:'approved',category:'Contract',value:100,currency:'RON',date:'2026-10-29',created_at:'2026-10-01T09:00:00Z',case_id:'case-1',flow_stage:'purchasing'},
 {id:'b',department:'Finance',status:'pending',category:'Invoice',value:20,currency:'EUR',date:'2026-10-30',created_at:'2026-10-30T20:00:00Z',case_id:'case-1',flow_stage:'invoice_verification'},
 {id:'c',department:'Technical',status:'approved',category:'Contract',value:50,currency:'RON',date:null,created_at:'2026-09-30T10:00:00Z',case_id:null},
 {id:'d',department:'Finance',status:'approved',category:'Invoice',date:'2026-11-07',created_at:null,case_id:'case-1',flow_stage:'purchasing'},
];
test('chart selections intersect and missing values can be selected',()=>{
 assert.deepEqual(filterRows(rows,{department:'Finance',status:'approved'}).map(r=>r.id),['a','d']);
 assert.deepEqual(filterRows(rows,{department:'Technical',status:'pending'}),[]);
 assert.deepEqual(filterRows(rows,{case_id:'Nespecificat'}).map(r=>r.id),['c']);
});
test('pivot cells conserve counts and identify the same intersection as slicers',()=>{
 const data=matrix(rows,'department','category');
 assert.equal(data.rows.flatMap(r=>r.values).reduce((a,b)=>a+b,0),rows.length);
 for(const row of data.rows)for(let i=0;i<data.columns.length;i++)assert.equal(row.values[i],filterRows(rows,{department:row.name,category:data.columns[i]}).length);
});
test('monetary totals retain currencies and omit records without values',()=>assert.deepEqual(currencyAmounts(rows),[{currency:'RON',value:150},{currency:'EUR',value:20}]));
test('deadline buckets handle expired, today, month rollover and undated records',()=>{
 assert.equal(ageDays('2026-10-30T23:00:00Z','2026-10-30'),0);
 assert.equal(ageDays('invalid','2026-10-30'),null);
 assert.deepEqual(expiryBuckets(rows,'2026-10-30').map(b=>b.value),[1,1,1,0,0,1]);
});
test('case coverage counts documents without mistaking multiple records for completion',()=>assert.deepEqual(stageCoverage(rows),[{id:'case-1',values:[2,0,0,1]}]));
test('activity includes both interval boundaries, excludes older and undated records',()=>{
 const activity=activityRows(rows,'2026-10-01','2026-10-30');
 assert.equal(activity.total,2);assert.equal(activity.items[0].value,1);assert.equal(activity.items.at(-1).value,1);
 assert.equal(activityRows(filterRows(rows,{status:'pending'}),'2026-10-01','2026-10-30').total,1);
});

test('activity uses the airport calendar across midnight and summer time',()=>{
 assert.equal(calendarDay('2026-10-30T23:30:00Z'),'2026-10-31');
 assert.equal(calendarDay('2026-10-30T23:30:00'),'2026-10-31');
 assert.equal(calendarDay('2026-07-01T21:30:00Z'),'2026-07-02');
 assert.equal(calendarDay('2026-10-30'),'2026-10-30');
 assert.equal(calendarDay('invalid'),null);
 assert.equal(activityRows([{created_at:'2026-10-30T23:30:00Z'}],'2026-10-01','2026-10-30').total,0);
 assert.equal(activityRows([{created_at:'2026-10-30T23:30:00Z'}],'2026-10-02','2026-10-31').total,1);
});
