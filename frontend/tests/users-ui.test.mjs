import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';

const initial = new JSDOM('<div></div>', {url:'http://aerodesk.test/'});
function install(window) {
  for (const key of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','HTMLSelectElement','Event','MouseEvent','FormData'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}
install(initial.window);
const {createRoot} = await import('react-dom/client');
const bundle = await build({entryPoints:[fileURLToPath(new URL('../src/features/people/index.tsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {PeoplePage}=module.exports;
initial.window.close();

const person={id:'employee',name:'Mara Demo',email:'mara@airport.example',department:'Tehnic',department_id:'dept-tehnic',
  role:'Inginer',roles:['employee'],active:true,availability:'available',job_title:'Inginer',provisioning_status:'ready'};
const base={items:[person],total:1,departments:['Tehnic'],department_records:[{id:'dept-tehnic',name:'Tehnic',head_user_id:null,job_titles:['Inginer','Tehnician mentenanță']}],
  delegations:[],leaves:[],current_user_id:'hr',reference_date:'2026-10-30',auth_mode:'oidc'};

async function setup(t, capabilities={}, createResponse) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://aerodesk.test/',pretendToBeVisual:true});
  install(dom.window);
  const calls=[];
  globalThis.fetch=async (input,options={})=>{
    const path=new URL(String(input),dom.window.location.origin).pathname;
    if(options.method && options.method!=='GET') {
      calls.push({path,body:options.body?JSON.parse(options.body):null});
      return createResponse ? createResponse(path) : Response.json({user:person,temporary_password:'once-only',invitation_status:'temporary_password'});
    }
    if(path==='/api/people/appointments') return Response.json({items:capabilities.appointments||[]});
    return Response.json({...base,...capabilities});
  };
  const root=createRoot(dom.window.document.getElementById('root'));
  await act(async()=>root.render(createElement(PeoplePage,{revision:0,notify:()=>{}})));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();});
  return {dom,calls};
}
async function click(text) {
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  assert.ok(button,`Missing button: ${text}`);
  await act(async()=>button.click());
}
async function fill(name,value) {
  const input=document.querySelector(`[name="${name}"]`);assert.ok(input,name);
  const prototype=Object.getPrototypeOf(input);
  await act(async()=>{
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
}
async function submit() {await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}

test('ordinary employees can request leave but cannot manage accounts or authority',async t=>{
  await setup(t,{current_user_id:'employee'});
  assert.match(document.body.textContent,/Cerere de concediu/);
  assert.doesNotMatch(document.body.textContent,/Adaugă angajat|Propune șef|Autoritate de semnare/);
});

test('HR onboarding sends an ordinary profile and shows credentials once',async t=>{
  const {calls}=await setup(t,{can_create_users:true,can_manage_accounts:true,can_propose_heads:true});
  await click('Adaugă angajat');
  await fill('name','Mara Nouă');await fill('department_id','dept-tehnic');await fill('job_title','Inginer');
  await submit();
  assert.equal(calls[0].path,'/api/people');
  assert.equal(calls[0].body.access_profile,'employee');
  assert.equal(calls[0].body.manager_id,null);
  assert.equal(calls[0].body.email,'m.noua@arm.ro');
  assert.ok([...document.querySelectorAll('input')].some(input=>input.value==='once-only'));
  assert.match(document.body.textContent,/o singură dată/);
  await click('Am preluat datele');
  assert.ok(![...document.querySelectorAll('input')].some(input=>input.value==='once-only'));
});

test('onboarding failure retains entered fields and can be retried',async t=>{
  await setup(t,{can_create_users:true},()=>Response.json({detail:'Email deja folosit'},{status:409}));
  await click('Adaugă angajat');
  await fill('name','Mara Nouă');await fill('department_id','dept-tehnic');await fill('job_title','Inginer');
  await submit();
  assert.equal(document.querySelector('[name="name"]').value,'Mara Nouă');
  assert.match(document.body.textContent,/Email deja folosit/);
});

test('HR can propose an appointment without granting signing authority',async t=>{
  const {calls}=await setup(t,{can_create_users:true,can_manage_accounts:true,can_propose_heads:true});
  await click('Propune șef');
  await fill('reason','Numire aprobată în structură');
  await submit();
  assert.equal(calls[0].path,'/api/people/appointments');
  assert.equal(calls[0].body.user_id,'employee');
  assert.equal(calls[0].body.department_id,'dept-tehnic');
  assert.ok(!('signer' in calls[0].body));
});

test('email preview follows the name and cannot be edited',async t=>{
  await setup(t,{can_create_users:true});await click('Adaugă angajat');
  await fill('name','  Ștefan Mihai Ionescu  ');
  const email=document.querySelector('[name="email"]');
  assert.equal(email.value,'s.ionescu@arm.ro');assert.ok(email.readOnly);
  await fill('name','Ana-Maria Popescu-Dumitrescu');
  assert.equal(email.value,'a.popescu-dumitrescu@arm.ro');
  await fill('name','Ana');assert.equal(email.value,'');
});

test('position follows department and coordinators are limited to active colleagues there',async t=>{
  const hr={...person,id:'hr-colleague',name:'HR Colleague',department_id:'dept-hr',department:'Resurse umane',job_title:'Specialist resurse umane'};
  await setup(t,{can_create_users:true,items:[person,hr,{...person,id:'inactive',active:false}],department_records:[
    ...base.department_records,{id:'dept-hr',name:'Resurse umane',job_titles:['Specialist resurse umane']},
  ]});await click('Adaugă angajat');
  const position=document.querySelector('[name="job_title"]');
  const department=document.querySelector('[name="department_id"]');
  assert.equal(position.tagName,'SELECT');
  assert.ok(department.compareDocumentPosition(position)&window.Node.DOCUMENT_POSITION_FOLLOWING);
  const coordinator=document.querySelector('[name="manager_id"]');
  assert.deepEqual([...coordinator.options].map(o=>o.value),['','employee']);
  await fill('manager_id','employee');await fill('department_id','dept-hr');
  assert.equal(coordinator.value,'');
  assert.deepEqual([...coordinator.options].map(o=>o.value),['','hr-colleague']);
  assert.deepEqual([...position.options].filter(o=>o.value).map(o=>o.value),['Specialist resurse umane']);
});

test('director approves a personnel appointment through its dedicated endpoint',async t=>{
  const {calls}=await setup(t,{can_view_appointments:true,current_user_id:'director',appointments:[{
    id:'appointment-one',name:'Mara Demo',department:'Tehnic',effective_date:'2026-10-30',reason:'Numire propusă',
    status:'pending',proposer_name:'HR Demo',can_decide:true,
  }]},()=>Response.json({status:'active'}));
  await click('Numiri');await click('Revizuiește numirea');await click('Aprobă numirea');
  assert.equal(calls[0].path,'/api/people/appointments/appointment-one/decision');
  assert.equal(calls[0].body.action,'approve');
  assert.ok(!document.querySelector('[role="dialog"]'));
});
