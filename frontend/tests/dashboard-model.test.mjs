import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSelection,dailySeries,departmentComparison,emptyDashboardFilters} from '../src/features/reports/dashboard-model.ts';
const documents=[
 {id:'a',department:'Tehnic',category:'Contract',status:'approved',validated:true,created_at:'2026-10-30T23:00:00Z',date:'2026-11-02'},
 {id:'b',department:'Finance',category:'Contract',status:'in_review',validated:false,created_at:'2026-10-03',date:'2026-11-01'},
 {id:'c',department:'Tehnic',category:'Raport',status:'approved',validated:true,created_at:'2026-09-12',date:null},
 {id:'d',department:'Finance',category:'Contract',status:'archived',validated:true,created_at:'2026-10-12',date:'2026-11-01'},
];
const data={date:'2026-10-31',analysis:{documents,contracts:documents.filter(r=>r.category==='Contract'),tasks:[
 {id:'t1',document_id:'a',department:'Tehnic',status:'pending'},
 {id:'t2',document_id:'b',department:'Finance',status:'completed'},
 {id:'t3',document_id:'c',department:'Tehnic',status:'pending'},
],events:[{document_id:'a',created_at:'2026-10-30T23:30:00Z'},{document_id:'c',created_at:'2026-09-20'}]},priorities:[{document_id:'a'},{document_id:'c'}]};
test('cross filters intersect across documents, linked tasks, contracts and priorities',()=>{
 const result=dashboardSelection(data,{...emptyDashboardFilters,departments:['Tehnic'],categories:['Contract'],statuses:['approved']});
 for(const key of ['documents','contracts','due'])assert.deepEqual(result[key].map(r=>r.id),['a']);
 assert.deepEqual(result.tasks.map(r=>r.id),['t1']);assert.equal(result.events.length,1);assert.equal(result.priorities.length,1);
});
test('date slicing respects the airport timezone and never reintroduces excluded rows',()=>{
 const recent=dashboardSelection(data,{...emptyDashboardFilters,period:'7'});assert.deepEqual(recent.documents.map(r=>r.id),['a']);
 const month=dashboardSelection(data,{...emptyDashboardFilters,months:['2026-09']});assert.deepEqual(month.documents.map(r=>r.id),['c']);assert.deepEqual(month.tasks.map(r=>r.id),['t3']);
 const none=dashboardSelection(data,{...emptyDashboardFilters,months:['2025-01']});assert.equal(none.documents.length+none.tasks.length+none.events.length+none.priorities.length,0);
});
test('due-contract KPI excludes archived and unvalidated records',()=>assert.deepEqual(dashboardSelection(data,emptyDashboardFilters).due.map(r=>r.id),['a']));
test('trend buckets conserve counts and handle an empty selection',()=>{
 const series=dailySeries(documents,data.date,emptyDashboardFilters);
 assert.equal(series.points.reduce((n,p)=>n+p.total,0),documents.length);
 assert.equal(series.points.reduce((n,p)=>n+p.approved,0),2);
 assert.equal(series.points.reduce((n,p)=>n+p.review,0),1);
 assert.equal(dailySeries([],data.date,emptyDashboardFilters).points.every(p=>p.total===0),true);
});
test('department chart keeps document volume distinct from pending-task volume',()=>{
 const comparison=departmentComparison(documents,data.analysis.tasks);assert.deepEqual(comparison.find(d=>d.name==='Tehnic'),{name:'Tehnic',total:2,pending:2});assert.equal(comparison.find(d=>d.name==='Finance').pending,0);
});
test('long time ranges use calendar months and preserve counts across years',()=>{
 const rows=[{created_at:'2025-12-31T23:30:00Z',status:'approved'},{created_at:'2026-03-15',status:'in_review'}];
 const series=dailySeries(rows,'2026-10-31',emptyDashboardFilters);
 assert.equal(series.points[0].date,'2026-01-01');
 assert.equal(series.points[0].total,1);
 assert.equal(series.points.find(p=>p.date==='2026-03-01').review,1);
 assert.equal(series.points.reduce((n,p)=>n+p.total,0),2);
});
