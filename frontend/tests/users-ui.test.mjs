import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';

const initial = new JSDOM('<div></div>', {url:'http://flyleaf.test/'});
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
  first_name:'Mara',middle_name:'',last_name:'Demo',
  login_username:'mara',sign_in_url:'http://127.0.0.1:8080/api/auth/oidc/login?login_hint=mara',
  role:'Inginer',roles:['employee'],active:true,availability:'available',job_title:'Inginer',provisioning_status:'ready'};
const base={items:[person],total:1,departments:['Tehnic'],department_records:[{id:'dept-tehnic',name:'Tehnic',head_user_id:null,job_titles:['Inginer','Tehnician mentenanță']}],
  delegations:[],leaves:[],current_user_id:'hr',reference_date:'2026-10-30',auth_mode:'oidc'};

test('ordinary users can open a read-only organigram including active support staff without private roles',async t=>{
  const head={...person,id:'technical-head',name:'Sorin Demo',is_department_head:true};
  const colleague={...person,roles:undefined,login_username:undefined,provisioning_status:undefined};
  const support={...colleague,id:'daniel',name:'Daniel Ilie Voicu',department:'Conducere',department_id:null,job_title:'Asistent conducere',manager_id:'admin',manager_name:'Ana Demo'};
  const inactive={...support,id:'former',name:'Former Support',active:false};
  const {calls}=await setup(t,{current_user_id:colleague.id,items:[head,colleague,support,inactive],organization_leaders:[{id:'admin',name:'Ana Demo',job_title:'Director aeroport'}],
    department_records:[{id:'dept-tehnic',name:'Tehnic',label:'Tehnic și operațiuni',head_user_id:head.id,head_name:head.name},
      {id:'dept-achizitii',name:'Achiziții'},{id:'dept-hr',name:'Resurse umane'},{id:'dept-conformitate',name:'Conformitate'}]});
  assert.equal(document.querySelector('[aria-label="Structura aeroportului"]'),null);
  await click('Organigramă');
  const organization=document.querySelector('[aria-label="Structura aeroportului"]');
  assert.ok(organization);
  assert.match(organization.textContent,/Ana Demo/);
  assert.match(organization.textContent,/Tehnic și operațiuni/);
  assert.match(organization.textContent,/Sorin Demo/);
  assert.match(organization.textContent,/Mara Demo/);
  assert.match(organization.textContent,/Daniel Ilie Voicu/);
  assert.doesNotMatch(organization.textContent,/Coordonator:/);
  assert.doesNotMatch(organization.textContent,/Former Support/);
  assert.equal(organization.querySelectorAll('input').length,0);
  assert.ok([...organization.querySelectorAll('button')].every(button=>button.getAttribute('aria-haspopup')==='dialog'),'read-only profiles do not expose management controls');
  assert.equal(organization.textContent.split('Sorin Demo').length-1,1);
  assert.equal(organization.textContent.split('Daniel Ilie Voicu').length-1,1);
  assert.equal(organization.querySelectorAll('[data-department-id]').length,4);
  const daniel=organization.querySelector('[data-person-id="daniel"]');
  assert.ok(daniel);
  const managerNode=daniel.closest('li').parentElement.closest('li');
  assert.equal(managerNode.querySelector('[data-person-id]').dataset.personId,'admin');
  assert.equal(organization.querySelector('.organization-scroll').tabIndex,0);
  assert.equal(calls.length,0);
  await click('Colegi');
  assert.equal(document.querySelector('[aria-label="Structura aeroportului"]'),null);
  assert.ok(document.querySelector('.people-grid'));
});

async function setup(t, capabilities={}, createResponse) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://flyleaf.test/',pretendToBeVisual:true});
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
  await setup(t,{current_user_id:'employee',items:[{...person,head_appointment:{status:'pending',effective_date:'2026-11-01'}}]});
  assert.match(document.body.textContent,/Cerere de concediu/);
  assert.doesNotMatch(document.body.textContent,/Adaugă angajat|Propune șef|Autoritate de semnare/);
  assert.doesNotMatch(document.body.textContent,/Numire în aprobare/);
});

test('reporting managers can choose a replacement without exposing private roles',async t=>{
  const replacement={...person,id:'replacement',name:'Delegate Demo',roles:undefined,can_delegate_approvals:true};
  const {calls}=await setup(t,{current_user_id:'employee',can_manage_delegations:true,
    items:[{...person,can_delegate_approvals:true},replacement]});
  await click('Delegare');
  assert.equal(document.querySelector('[name="from_user"]').value,'employee');
  assert.ok(document.querySelector('[name="to_user"] option[value="replacement"]'));
  await fill('to_user','replacement');
  await submit();
  assert.equal(calls[0].path,'/api/people/delegations');
  assert.equal(calls[0].body.from_user,'employee');
  assert.equal(calls[0].body.to_user,'replacement');
});

test('delegated leave shows the original approver and retains the dedicated decision flow',async t=>{
  const leave={id:'leave-covered',user_id:'employee',name:'Mara Demo',department:'Tehnic',
    starts_at:'2026-10-30',ends_at:'2026-11-03',reason:'Concediu de odihnă',status:'pending',can_decide:true,
    reviewers:[{id:'replacement',name:'Delegate Demo',delegated_from_id:'manager',delegated_from_name:'Manager Demo',via:'delegation'}]};
  const {calls}=await setup(t,{current_user_id:'replacement',leaves:[leave]});
  await click('Concedii');
  assert.match(document.querySelector('.leave-reviewer').textContent,/Delegate Demo \(delegat pentru Manager Demo\)/);
  await click('Revizuiește');
  assert.match(document.querySelector('[role="dialog"]').textContent,/delegat pentru Manager Demo/);
  await click('Aprobă concediul');
  assert.equal(calls[0].path,'/api/people/leave/leave-covered/decision');
  assert.equal(calls[0].body.action,'approve');
});

test('leave requests expose their generated document with the people return origin',async t=>{
  await setup(t,{current_user_id:'employee',leaves:[{id:'leave-demo',user_id:'employee',name:'Mara Demo',
    department:'Tehnic',starts_at:'2026-11-09',ends_at:'2026-11-13',reason:'Concediu de odihnă',
    status:'approved',can_decide:false,document_id:'doc-leave-demo',document_version:2}]});
  await click('Concedii');
  const link=document.querySelector('a[href="#document/doc-leave-demo?from=people"]');
  assert.ok(link);
  assert.equal(link.textContent,'Document · v2');
});

test('submitting leave opens the leave list and shows the newly generated document',async t=>{
  const capabilities={current_user_id:'employee',leaves:[]};
  const {calls}=await setup(t,capabilities,()=>{
    capabilities.leaves=[{id:'leave-new',user_id:'employee',name:'Mara Demo',department:'Tehnic',
      starts_at:'2026-11-09',ends_at:'2026-11-13',reason:'Concediu de odihnă',status:'pending',
      can_decide:false,document_id:'doc-leave-new',document_version:1}];
    return Response.json({id:'leave-new',document_id:'doc-leave-new',status:'pending'});
  });
  await click('Cerere de concediu');
  assert.match(document.querySelector('[role="dialog"]').textContent,/Cererea PDF se generează automat/);
  await submit();
  assert.equal(calls[0].path,'/api/people/leave');
  assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent,'Concedii1');
  assert.ok(document.querySelector('a[href="#document/doc-leave-new?from=people"]'));
  assert.equal(document.querySelector('[role="dialog"]'),null);
});

test('HR onboarding sends an ordinary profile and shows credentials once',async t=>{
  const {calls}=await setup(t,{can_create_users:true,can_manage_accounts:true,can_propose_heads:true});
  await click('Adaugă angajat');
  await fill('first_name','Mara');await fill('last_name','Nouă');await fill('department_id','dept-tehnic');await fill('job_title','Inginer');
  await click('Generează emailul');
  await submit();
  assert.equal(calls[0].path,'/api/people');
  assert.equal(calls[0].body.access_profile,'employee');
  assert.equal(calls[0].body.manager_id,null);
  assert.equal(calls[0].body.email,'m.noua@arm.ro');
  assert.equal(calls[0].body.first_name,'Mara');assert.equal(calls[0].body.middle_name,'');assert.equal(calls[0].body.last_name,'Nouă');
  assert.ok(!('name' in calls[0].body));
  assert.ok([...document.querySelectorAll('input')].some(input=>input.value==='once-only'));
  assert.ok([...document.querySelectorAll('input')].some(input=>input.value==='http://flyleaf.test/api/auth/oidc/login?login_hint=mara'));
  assert.match(document.body.textContent,/o singură dată/);
  await click('Am preluat datele');
  assert.ok(![...document.querySelectorAll('input')].some(input=>input.value==='once-only'));
});

test('onboarding failure retains entered fields and can be retried',async t=>{
  let attempts=0;
  const {calls}=await setup(t,{can_create_users:true},()=>++attempts===1?
    Response.json({detail:'Email deja folosit'},{status:409}):Response.json({user:person,temporary_password:'once-only'}));
  await click('Adaugă angajat');
  await fill('first_name','Mara');await fill('last_name','Nouă');await fill('department_id','dept-tehnic');await fill('job_title','Inginer');
  await click('Generează emailul');
  await submit();
  assert.equal(document.querySelector('[name="first_name"]').value,'Mara');
  assert.equal(document.querySelector('[name="last_name"]').value,'Nouă');
  assert.match(document.body.textContent,/Email deja folosit/);
  await fill('email','mara.noua2@arm.ro');
  await submit();
  assert.equal(calls[1].body.email,'mara.noua2@arm.ro');
  assert.ok([...document.querySelectorAll('input')].some(input=>input.value==='once-only'));
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

test('HR sees pending or approved head appointments without a repeat proposal action',async t=>{
  const scheduled={...person,can_propose_head:false,head_appointment:{status:'approved',effective_date:'2026-11-01'}};
  const pending={...person,id:'pending',name:'Colega Propusă',email:'colega@airport.example',can_propose_head:false,
    head_appointment:{status:'pending',effective_date:'2026-11-02'}};
  const colleague={...person,id:'colleague',name:'Alt Coleg',can_propose_head:false};
  await setup(t,{can_manage_accounts:true,can_propose_heads:true,can_view_appointments:true,items:[scheduled,pending,colleague]});
  assert.doesNotMatch(document.querySelector('.people-grid').textContent,/Propune șef/);
  assert.match(document.querySelector('.people-grid').textContent,/Numire aprobată.*01 nov\. 2026/);
  assert.match(document.querySelector('.people-grid').textContent,/Numire în aprobare/);
  assert.equal([...document.querySelectorAll('.person-card button')].filter(b=>b.textContent==='Gestionează angajatul').length,3);
});

test('a department-less employee keeps management access but is not offered a head proposal even with stale eligibility',async t=>{
  const daniel={...person,id:'daniel',name:'Daniel Ilie Voicu',department:'Conducere',department_id:null,can_propose_head:true};
  await setup(t,{can_manage_accounts:true,can_propose_heads:true,items:[daniel]});
  const card=document.querySelector('.person-card');
  assert.doesNotMatch(card.textContent,/Propune șef/);
  assert.match(card.textContent,/Atribuie un departament/);
  assert.match(card.textContent,/Gestionează angajatul/);
});

test('email is generated on demand and HR edits survive name changes',async t=>{
  const {calls}=await setup(t,{can_create_users:true});await click('Adaugă angajat');
  await fill('first_name',' Ștefan ');await fill('middle_name','Mihai');await fill('last_name',' Ionescu ');
  const email=document.querySelector('[name="email"]');
  assert.equal(email.value,'');
  await click('Generează emailul');
  assert.equal(email.value,'s.ionescu@arm.ro');assert.ok(!email.readOnly);
  assert.equal(calls.length,0,'Generating an email must not submit the form');
  await fill('email','stefan.ionescu@arm.ro');
  await fill('first_name','Ana-Maria');await fill('last_name','Popescu-Dumitrescu');
  assert.equal(email.value,'stefan.ionescu@arm.ro');
  await click('Generează emailul');
  assert.equal(email.value,'a.popescu-dumitrescu@arm.ro');
  await fill('last_name','');
  assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generează emailul')).disabled);
  assert.equal(email.value,'a.popescu-dumitrescu@arm.ro');
});

test('name fields are separate, middle is optional, and compound surnames generate intact',async t=>{
  await setup(t,{can_create_users:true});await click('Adaugă angajat');
  assert.ok(!document.querySelector('[name="name"]'));
  assert.ok(document.querySelector('[name="first_name"]').required);
  assert.ok(document.querySelector('[name="last_name"]').required);
  assert.ok(!document.querySelector('[name="middle_name"]').required);
  await fill('first_name','Ana');await fill('last_name','De la Cruz');
  await click('Generează emailul');
  assert.equal(document.querySelector('[name="email"]').value,'a.de-la-cruz@arm.ro');
  await fill('middle_name','Maria');await click('Generează emailul');
  assert.equal(document.querySelector('[name="email"]').value,'a.de-la-cruz@arm.ro');
});

test('editing a profile restores the stored name boundaries',async t=>{
  const named={...person,first_name:'Ana',middle_name:'Maria',last_name:'De la Cruz',name:'Ana Maria De la Cruz'};
  await setup(t,{can_manage_accounts:true,items:[named]});await click('Gestionează angajatul');
  assert.equal(document.querySelector('[name="first_name"]').value,'Ana');
  assert.equal(document.querySelector('[name="middle_name"]').value,'Maria');
  assert.equal(document.querySelector('[name="last_name"]').value,'De la Cruz');
});

test('HR can copy the sign-in link without resetting credentials or granting access',async t=>{
  const {calls}=await setup(t,{can_manage_accounts:true});
  const copied=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
  await click('Gestionează angajatul');await click('Copiază linkul de conectare');
  assert.deepEqual(copied,['http://flyleaf.test/api/auth/oidc/login?login_hint=mara']);
  assert.equal(calls.length,0);
  assert.ok([...document.querySelectorAll('input')].some(input=>input.value==='mara'));
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
