import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/people/organization-tree.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {organizationTree}=module.exports;

const departments=[
  {id:'dept-tehnic',name:'Tehnic',head_user_id:'technical-head'},
  {id:'dept-achizitii',name:'Achiziții',head_user_id:'manager'},
  {id:'dept-hr',name:'Resurse umane',head_user_id:'hr'},
  {id:'dept-conformitate',name:'Conformitate',head_user_id:'reviewer'},
];
const items=[
  {id:'admin',name:'Ana',job_title:'Director aeroport',department_id:null},
  {id:'technical-head',name:'Sorin',department_id:'dept-tehnic',manager_id:'admin'},
  {id:'manager',name:'Mihai',department_id:'dept-achizitii',manager_id:'admin'},
  {id:'hr',name:'Ioana',department_id:'dept-hr',manager_id:'admin'},
  {id:'reviewer',name:'Elena',department_id:'dept-conformitate',manager_id:'admin'},
  {id:'technician',name:'Andrei',department_id:'dept-tehnic',manager_id:'technical-head'},
  {id:'finance',name:'Radu',department_id:'dept-achizitii',manager_id:'manager'},
  {id:'daniel',name:'Daniel Ilie Voicu',job_title:'Asistent conducere',department_id:null,manager_id:'admin',manager_name:'Ana'},
].map(person=>({...person,active:true,roles:['private-role'],login_username:'private-login'}));

function flatten(root,parent=null,result=[]) {
  assert(result.length<50,'Reporting cycle must not recur indefinitely');
  result.push({node:root,parent});
  for(const child of root.children)flatten(child,root,result);
  return result;
}

test('all eight active users appear once under their actual coordinator with four departments',()=>{
  const nodes=flatten(organizationTree({items,department_records:departments,organization_leaders:[{id:'admin',name:'Ana',job_title:'Director aeroport'}]}));
  assert.deepEqual(nodes.filter(({node})=>node.personId).map(({node})=>node.personId).sort(),items.map(person=>person.id).sort());
  assert.equal(nodes.filter(({node})=>node.departmentId).length,4);
  for(const person of items.filter(person=>person.manager_id)) {
    assert.equal(nodes.find(({node})=>node.personId===person.id).parent.personId,person.manager_id);
  }
  assert(!JSON.stringify(nodes).includes('private-role'));
  assert(!JSON.stringify(nodes).includes('private-login'));
});

test('missing leadership, inactive heads, unknown departments and reporting cycles do not hide users',()=>{
  const irregular=[
    {...items[1],active:false},
    {...items[5],manager_id:'technical-head'},
    {...items[7],manager_id:'missing-user',department_id:'retired-department'},
    {id:'cycle-a',name:'A',active:true,manager_id:'cycle-b'},
    {id:'cycle-b',name:'B',active:true,manager_id:'cycle-a'},
  ];
  const nodes=flatten(organizationTree({items:irregular,department_records:departments,organization_leaders:[]}));
  assert.deepEqual(nodes.filter(({node})=>node.personId).map(({node})=>node.personId).sort(),irregular.filter(person=>person.active).map(person=>person.id).sort());
  assert.equal(nodes.filter(({node})=>node.departmentId).length,4);
});

test('an unavailable coordinator keeps an employee in the known department rather than moving them under the director',()=>{
  const nodes=flatten(organizationTree({items:[items[0],{...items[1],active:false},{...items[5],manager_name:'Sorin'}],
    department_records:departments,organization_leaders:[{id:'admin',name:'Ana',job_title:'Director aeroport'}]}));
  const employee=nodes.find(({node})=>node.personId==='technician');
  assert.equal(employee.parent.departmentId,'dept-tehnic');
  assert.equal(employee.parent.personId,undefined);
  assert.equal(employee.node.managerUnavailable,true);
});
