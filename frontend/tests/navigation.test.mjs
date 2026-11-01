import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { act, createElement, StrictMode } from 'react';

const initialDOM = new JSDOM('<div></div>', {url:'http://flyleaf.test/', pretendToBeVisual:true});
installDOM(initialDOM.window);
const { createRoot } = await import('react-dom/client');
const bundle = await build({entryPoints:[fileURLToPath(new URL('../src/app/App.tsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module = {exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {App}=module.exports;
initialDOM.window.close();

function installDOM(window) {
  for (const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','HTMLInputElement','Event','MouseEvent','CustomEvent','FormData','File'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.ResizeObserver=class {observe() {} disconnect() {}};
  window.scrollTo=(x,y)=>{
    Object.defineProperty(window,'scrollX',{value:x,configurable:true});
    Object.defineProperty(window,'scrollY',{value:y,configurable:true});
  };
  window.HTMLElement.prototype.scrollTo=function(x,y){
    this.scrollLeft=x;
    this.scrollTop=y;
  };
  window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
}

const user={id:'admin',name:'Ana Demo',role:'director',roles:['director','finance'],department:'Conducere'};
const technician={id:'tech',name:'Teo Demo',role:'technician',roles:['technician'],department:'Tehnic'};
const operationsRecord={airport:{id:'craiova',name:'Demo airport',icao:'LRCV',lat:44.318,lon:23.889,elevation_m:191},
  simulation:{run_id:'test-run',revision:1,running:false,speed:1,elapsed_seconds:0,duration_seconds:3600,
    clock_time:'2026-10-30T08:00:00',scenario_mode:'interactive'},flights:[],gates:[],staff:[],events:[],kpis:{},
  thresholds:{minor_delay_minutes:1,major_delay_minutes:15},permissions:{can_control:true}};
const documentRecord={id:'doc-contract',title:'Contract Demo Navigation',number:'DEMO-1',category:'Contract',
  department:'Achiziții',status:'approved',created_at:'2026-10-01',expires_at:'2027-01-01',supplier:'Demo SRL',
  value:1000,currency:'RON',owner:user.name,confidentiality:'internal',tags:[],summary:'Demo contract',
  filename:'demo.pdf',related_ids:[],metadata:{},version:1,validated:true,file_url:'/api/documents/doc-contract/file',
  contract_status:'active',days_remaining:60,versions:[],audit:[],workflow:{steps:[],current_step:'done'},
  permissions:{can_edit:false,can_review:false,can_sign:false,can_share:false}};
const related={...documentRecord,id:'doc-related',title:'Related Demo Document',related_documents:[]};
const reportRow={...documentRecord,document_id:documentRecord.id,date:documentRecord.expires_at};
const reportDefinition={id:'contracts',title:'Portofoliu test',subtitle:'Contracte accesibile',category:'Financiar',source:'Contracte'};
const reportCatalog={items:[reportDefinition],refresh_seconds:60};
const reportFixture={report:reportDefinition,rows:[reportRow],total:1,metrics:[],breakdowns:[],highlights:[],
  secondary:[],recent_activity:[],currency_totals:[],departments:['Achiziții'],department:'Achiziții',
  reference_date:'2026-10-31',generated_at:'2026-10-31T12:00:00Z',refresh_seconds:60,
  activity:{start:'2026-10-01',end:'2026-10-31',items:[],total:0},table_title:'Contracte sursă',scope:'Date accesibile'};
const briefingFixture={catalog:reportCatalog,airport:'Demo airport',date:'2026-10-31',generated_at:'2026-10-31T12:00:00Z',
  department:'',departments:['Achiziții'],analysis:{documents:[reportRow],contracts:[reportRow],tasks:[],events:[]},
  priorities:[],reports:[],deadlines:[],summary:{},coverage:{}};
const supplier={id:'supplier-demo',name:'Demo SRL',document_id:documentRecord.id,expected_iban:'RO49AAAA1B31007593840000',
  verified_contact:'demo@example.test',trust_status:'demo_verified',bank_history:[],registry_revision:1,
  address:'Demo address',category:'Services',state:'active',contracts:[{id:documentRecord.id,title:documentRecord.title,
    version:1,eligible_for_review:true}]};

async function setup(t,hash='#suppliers',{roles=user.roles,startUser,documentError=false,workflowTask=false,uploadResponse,catalogResponse,reviewResponse,logoutResponse,authMode='demo',strict=false,sessionResponse,briefingResponse}={}) {
  const dom=new JSDOM('<div id="root"></div>',{url:`http://flyleaf.test/${hash}`,pretendToBeVisual:true});
  installDOM(dom.window);
  let currentUser=startUser||{...user,roles};
  globalThis.fetch=async (input,options={})=>{
    const path=new URL(String(input),dom.window.location.origin).pathname;
    let body;
    if(path==='/api/session'){
      const response=Response.json({current_user:currentUser,users:authMode==='oidc'&&!currentUser?[]:[user,technician],airport:'Demo airport',reference_date:'2026-10-30',demo:authMode==='demo',auth:{mode:authMode,login_url:authMode==='oidc'?'/api/auth/oidc/login':null,logout_url:'/api/auth/logout'}});
      return sessionResponse?await sessionResponse(response):response;
    }
    else if(path==='/api/auth/login'){currentUser=technician;body={};}
    else if(path==='/api/auth/logout'){
      assert.equal(options.method,'POST');
      const response=logoutResponse?await logoutResponse():Response.json({ok:true,redirect_url:null});
      if(response.ok)currentUser=null;
      return response;
    }
    else if(path==='/api/reports')body=reportCatalog;
    else if(path==='/api/reports/briefing')return briefingResponse?await briefingResponse():Response.json(briefingFixture);
    else if(path==='/api/reports/contracts')body=reportFixture;
    else if(path==='/api/assistant')body={answer:'Demo answer',sources:[{id:related.id,title:related.title,number:'DEMO-2',page:1,excerpt:'Demo source'}],mode:'local',reference_date:'2026-10-30'};
    else if(path==='/api/supplier-reviews')return reviewResponse?await reviewResponse():Response.json({items:[],total:0,limit:25,offset:0,suppliers:[supplier],counters:{needs_review:0,verified:0,approved:0,clear:0}});
    else if(path==='/api/suppliers')return catalogResponse?await catalogResponse():Response.json({items:[supplier],total:1});
    else if(path==='/api/supplier-registrations')body={items:[]};
    else if(path==='/api/documents'&&options.method==='POST')return uploadResponse?await uploadResponse():Response.json(documentRecord);
    else if(path==='/api/documents')body={items:[documentRecord],total:1,categories:['Contract']};
    else if(path==='/api/contracts')body={items:[documentRecord]};
    else if(path==='/api/operations')body=operationsRecord;
    else if(path==='/api/operations/map-config')body={google_api_key:null,photorealistic_available:false,default_mode:'model'};
    else if(path==='/api/dashboard')body={stats:{documents:1,pending:0,expiring:0,approved:1},recent_documents:[documentRecord],attention:[],activity:[],departments:[]};
    else if(path==='/api/tasks')body={items:[{id:'task-demo',document_id:documentRecord.id,title:documentRecord.title,department:'Achiziții',
      assignee:user.name,status:'pending',priority:'normal',due_date:'2026-11-01',type:'approval',can_act:false}]};
    else if(path==='/api/collaboration')body={partner:{id:'sibiu',name:'Aeroportul Sibiu'},can_create:true,connected:true,requests:[]};
    else if(path==='/api/shares')body={items:[{id:'share-demo',document_id:documentRecord.id,document_title:documentRecord.title,
      source_version:1,recipient_airport:'Demo partner',expires_at:'2026-12-01',created_at:'2026-10-01',status:'active'}]};
    else if(path==='/api/audit')body={items:[{id:'audit-demo',document_id:documentRecord.id,document_title:documentRecord.title,
      actor:user.name,action:'Demo action',created_at:'2026-10-01'}]};
    else if(path==='/api/people')body={items:[],total:0,departments:[],delegations:[],leaves:[],current_user_id:currentUser.id,
      can_manage_accounts:false,can_manage_delegations:false,reference_date:'2026-10-30'};
    else if(path.startsWith('/api/documents/')) {
      if(documentError)return Response.json({detail:'Document unavailable'},{status:404});
      body=path.endsWith('/doc-related')?related:{...documentRecord,related_documents:[related],
        workflow:{...documentRecord.workflow,task:workflowTask?{status:'pending',assignee:user.name,due_date:'2026-11-01'}:undefined}};
    } else throw new Error(`Unexpected API request: ${path}`);
    return Response.json(body);
  };
  const root=createRoot(dom.window.document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();});
  await act(async()=>{root.render(strict?createElement(StrictMode,null,createElement(App)):createElement(App));await new Promise(resolve=>setTimeout(resolve,10));});
  await settle(230);
  return dom.window;
}

async function settle(ms=35){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});}
const visible=element=>!element.closest('[hidden]');
function find(selector,text){return [...document.querySelectorAll(selector)].find(e=>visible(e)&&e.textContent.includes(text));}
async function click(element){assert.ok(element,'Expected navigation control');await act(async()=>element.click());await settle(70);}
async function setInput(input,value){assert.ok(input);await act(async()=>{
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
});await settle(280);}
const heading=()=>[...document.querySelectorAll('main h1')].find(visible)?.textContent;

test('report deep links and source-document returns preserve the report and table filters',async t=>{
  await setup(t,'#reports/contracts?view=data&status=approved');
  assert.equal(heading(),'Portofoliu test');
  await click(document.querySelector('.bi-filter-toggle'));
  await act(async()=>{
    const department=document.querySelector('#report-filters select');
    department.value='Achiziții';
    department.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  await settle();
  const hash=location.hash;
  assert.equal(new URLSearchParams(hash.split('?')[1]).get('department'),'Achiziții');
  await setInput(document.querySelector('input[aria-label="Caută în raport"]'),'Navigation');
  await click(find('.rp-row-title','Contract Demo Navigation'));
  assert.equal(location.hash,'#document/doc-contract?from=reports');
  await click(find('.back-button','Rapoarte'));
  assert.equal(location.hash,hash);
  assert.equal(heading(),'Portofoliu test');
  assert.equal(document.querySelector('input[aria-label="Caută în raport"]').value,'Navigation');
  assert.match(find('.bi-active-filters','Stare').textContent,/Aprobat/);
  await click(find('aside nav button','Rapoarte'));
  assert.equal(location.hash,'#reports');
  assert.ok(document.querySelector('.px-dashboard'));
});

test('a refreshed dashboard dismisses stale source rows before they can be exported',async t=>{
  let current=briefingFixture;
  await setup(t,'#reports',{briefingResponse:()=>Response.json(current)});
  await click(find('.px-kpi','Total documente'));
  assert.ok(document.querySelector('dialog[open]'));
  current={...briefingFixture,generated_at:'2026-10-31T12:01:00Z',analysis:{...briefingFixture.analysis,documents:[],contracts:[]}};
  await act(async()=>window.dispatchEvent(new window.Event('focus')));
  await settle();
  assert.equal(document.querySelector('dialog'),null);
  assert.equal(find('.px-kpi','Total documente').querySelector('strong').textContent,'0');
});

test('obsolete NFC session links do not redirect the user away from their work',async t=>{
  await setup(t,'#home',{sessionResponse:response=>{
    sessionStorage.setItem('flyleaf.pendingNfc',JSON.stringify({card:'DEMO-NFC-101',at:Date.now()}));
    return response;
  }});
  assert.equal(heading(),'Bine ai venit, Ana.');
  assert.equal(location.hash,'#home');
  assert.equal(document.querySelector('.ops-station-mode'),null);
});

test('technician sidebar contains only personal work and forbidden hashes do not fetch sections',async t=>{
  const paths=[];
  await setup(t,'#audit',{startUser:technician,sessionResponse:response=>{
    const original=globalThis.fetch;
    globalThis.fetch=(input,options)=>{paths.push(new URL(String(input),location.origin).pathname);return original(input,options)};
    return response;
  }});
  assert.deepEqual([...document.querySelectorAll('aside nav button')].map(e=>e.textContent),
    ['Acasă','Operațiuni la sol','Documente','Sarcinile mele','Echipă','Rapoarte']);
  assert.equal(heading(),'Documente');
  assert.ok(!paths.includes('/api/audit'));
  await click(find('aside button','Sarcinile mele'));
  assert.equal(heading(),'Sarcinile mele');
});

test('server capabilities override role shortcuts and guard document origins',async t=>{
  const restricted={...user,permissions:{pages:{home:true,documents:true,approvals:true,people:true,
    contracts:false,suppliers:false,sharing:false,audit:false}}};
  await setup(t,'#document/doc-contract?from=sharing',{startUser:restricted});
  assert.ok(!find('aside button','Partajate'));
  assert.equal(find('.breadcrumb-parent','Documente')?.textContent,'Documente');
  await click(find('.back-button','Documente'));
  assert.equal(heading(),'Documente');
});

test('procurement supplier view shows business profiles without banking workflow requests',async t=>{
  const paths=[];
  await setup(t,'#suppliers',{startUser:{id:'manager',name:'Mihai Demo',role:'reviewer',
    roles:['reviewer','department_head'],department:'Achiziții'},sessionResponse:response=>{
    const original=globalThis.fetch;
    globalThis.fetch=(input,options)=>{paths.push(new URL(String(input),location.origin).pathname);return original(input,options)};
    return response;
  }});
  assert.equal(heading(),'Furnizori');
  assert.match(document.querySelector('main').textContent,/Demo SRL/);
  assert.doesNotMatch(document.querySelector('main').textContent,/Verifică o solicitare|RO49|Înregistrează furnizor/);
  assert.ok(!paths.includes('/api/supplier-reviews'));
  assert.ok(!paths.includes('/api/supplier-registrations'));
});

test('logout is in the top-right profile popup and cancel preserves the document and session',async t=>{
  let requests=0;
  await setup(t,'#document/doc-contract?from=suppliers',{authMode:'oidc',logoutResponse:()=>{requests++;return Response.json({ok:true});}});
  assert.equal(!!find('.topbar button','Ieși din cont'),false);
  const avatar=document.querySelector('.topbar .person-avatar-trigger');
  await click(avatar);
  await click(find('.person-profile button','Ieși din cont'));
  assert.ok(document.querySelector('.logout-confirmation'));
  assert.equal(document.querySelector('.person-profile'),null);
  assert.equal(requests,0,'Opening confirmation must not end the session');
  const cancel=find('.logout-confirmation button','Rămâi conectat');
  assert.equal(document.activeElement,cancel,'The safe action receives initial focus');
  await click(cancel);
  assert.equal(document.querySelector('.logout-confirmation'),null);
  assert.equal(document.activeElement,avatar);
  assert.equal(document.querySelector('.person-profile'),null,'Restoring focus should not reopen the popup');
  assert.equal(location.hash,'#document/doc-contract?from=suppliers');
  assert.equal(localStorage.getItem('flyleaf-user'),'admin');
  assert.match(document.querySelector('main').textContent,/Contract Demo Navigation/);
  assert.equal(requests,0);
});

test('Escape and backdrop dismiss logout confirmation without ending the session',async t=>{
  let requests=0;
  await setup(t,'#home',{logoutResponse:()=>{requests++;return Response.json({ok:true});}});
  await click(find('.sidebar-bottom button','Ieși din cont'));
  assert.ok(document.querySelector('.logout-confirmation'));
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.logout-confirmation'),null);
  await click(find('.sidebar-bottom button','Ieși din cont'));
  await act(async()=>document.querySelector('.modal-backdrop').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})));
  assert.equal(document.querySelector('.logout-confirmation'),null);
  assert.equal(requests,0);
  assert.equal(localStorage.getItem('flyleaf-user'),'admin');
  assert.ok(document.querySelector('.app-shell'));
});

test('confirmed logout clears the workspace without another session request',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers');
  assert.equal(localStorage.getItem('flyleaf-user'),'admin');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(input,options)=>{
    if(String(input)==='/api/session')throw new Error('Session refresh unavailable');
    return originalFetch(input,options);
  };
  await click(find('.sidebar-bottom button','Ieși din cont'));
  await click(find('.logout-confirmation button','Ieși din cont'));
  assert.ok(document.querySelector('.login-page'),'Successful logout should show login without another session request');
  assert.equal(document.querySelector('.app-shell'),null);
  assert.equal(localStorage.getItem('flyleaf-user'),null);
  assert.equal(location.hash,'#home');
  globalThis.fetch=originalFetch;
  await click(find('.login-page button','Intră în spațiul de lucru'));
  assert.ok(find('.user-button',technician.name));
  assert.equal(heading(),'Bine ai venit, Teo.');
  assert.equal(document.querySelector('[role="dialog"]'),null);
});

test('logout prevents repeated requests while the session is being revoked',async t=>{
  let finish,requests=0;
  const response=new Promise(resolve=>{finish=resolve});
  await setup(t,'#home',{logoutResponse:()=>{requests++;return response;}});
  const button=find('.sidebar-bottom button','Ieși din cont');
  await click(button);
  assert.equal(requests,0);
  const confirm=find('.logout-confirmation button','Ieși din cont');
  await click(confirm);
  assert.equal(button.disabled,true);
  assert.equal(confirm.disabled,true);
  assert.equal(find('.logout-confirmation button','Rămâi conectat').disabled,true);
  assert.equal(document.querySelector('.user-button').disabled,true);
  await click(confirm);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.ok(document.querySelector('.logout-confirmation'),'A pending logout cannot be canceled');
  assert.equal(requests,1);
  await act(async()=>finish(Response.json({ok:true,redirect_url:null})));
  await settle();
  assert.ok(document.querySelector('.login-page'));
});

test('failed logout keeps the account active and offers a retry',async t=>{
  let fail=true;
  await setup(t,'#home',{logoutResponse:()=>Response.json(fail?{detail:'Logout temporarily unavailable'}:{ok:true,redirect_url:null},{status:fail?503:200})});
  await click(find('.sidebar-bottom button','Ieși din cont'));
  await click(find('.logout-confirmation button','Ieși din cont'));
  assert.ok(find('[role="alert"]','Logout temporarily unavailable'));
  assert.ok(find('.user-button',user.name));
  assert.equal(localStorage.getItem('flyleaf-user'),'admin');
  assert.equal(find('.logout-confirmation button','Ieși din cont').disabled,false);
  fail=false;
  await click(find('.logout-confirmation button','Ieși din cont'));
  assert.ok(document.querySelector('.login-page'));
});

test('OIDC logout clears local content before navigating to the provider',async t=>{
  const redirect='http://identity.test/realms/demo/protocol/openid-connect/logout?client_id=flyleaf-web';
  await setup(t,'#home',{authMode:'oidc',logoutResponse:()=>Response.json({ok:true,redirect_url:redirect})});
  const destinations=[];
  globalThis.location={search:'',assign:url=>destinations.push(url)};
  await click(find('.sidebar-bottom button','Ieși din cont'));
  assert.deepEqual(destinations,[]);
  await click(find('.logout-confirmation button','Ieși din cont'));
  assert.deepEqual(destinations,[redirect]);
  assert.equal(document.querySelector('.app-shell'),null);
  assert.ok(document.querySelector('.login-page a.login-button'));
  assert.equal(document.querySelector('.login-page select'),null);
  assert.equal(localStorage.getItem('flyleaf-user'),null);
});

for (const lateResult of ['success','error'])
  test(`logout ignores a pending session ${lateResult} from StrictMode startup`,async t=>{
    let finish,requests=0;
    const pending=new Promise(resolve=>{finish=resolve});
    await setup(t,'#home',{strict:true,sessionResponse:async response=>{
      if(++requests===2){
        await pending;
        if(lateResult==='error')throw new Error('Stale session request failed');
      }
      return response;
    }});
    assert.equal(requests,2);
    await click(find('.sidebar-bottom button','Ieși din cont'));
    await click(find('.logout-confirmation button','Ieși din cont'));
    assert.ok(document.querySelector('.login-page'));
    await act(async()=>finish());
    await settle();
    assert.ok(document.querySelector('.login-page'),'A late session result must not replace the logged-out screen');
    assert.equal(document.querySelector('.app-shell'),null);
    assert.equal(localStorage.getItem('flyleaf-user'),null);
    assert.equal(document.querySelector('.app-load-error'),null);
  });

test('successful logout clears a startup error received while logout was pending',async t=>{
  let finishSession,finishLogout,requests=0;
  const pendingSession=new Promise(resolve=>{finishSession=resolve});
  const pendingLogout=new Promise(resolve=>{finishLogout=resolve});
  await setup(t,'#home',{strict:true,sessionResponse:async response=>{
    if(++requests===2){await pendingSession;throw new Error('Startup session failed');}
    return response;
  },logoutResponse:()=>pendingLogout});
  await click(find('.sidebar-bottom button','Ieși din cont'));
  await click(find('.logout-confirmation button','Ieși din cont'));
  await act(async()=>finishSession());
  await settle();
  await act(async()=>finishLogout(Response.json({ok:true,redirect_url:null})));
  await settle();
  assert.ok(document.querySelector('.login-page'),'Successful logout should replace a pending startup error');
  assert.equal(document.querySelector('.app-load-error'),null);
});

test('catalog failure stays visible after reviews load and can be retried',async t=>{
  let finishReviews;
  const reviews=new Promise(resolve=>{finishReviews=resolve;});
  let failCatalog=true;
  await setup(t,'#suppliers',{
    catalogResponse:()=>Response.json(failCatalog?{detail:'Catalog unavailable'}:{items:[supplier],total:1},{status:failCatalog?404:200}),
    reviewResponse:async()=>{await reviews;return Response.json({items:[],total:0,limit:25,offset:0,suppliers:[supplier],counters:{needs_review:0,verified:0,approved:0,clear:0}});},
  });
  await act(async()=>finishReviews());
  await settle();
  await click(find('button','Registru furnizori'));
  assert.ok(find('[role="alert"]','Catalog unavailable'));
  assert.equal(find('main h3','Niciun furnizor găsit'),undefined);
  failCatalog=false;
  await click(find('[role="alert"] button','Încearcă din nou'));
  assert.ok(find('.supplier-registry-card h3','Demo SRL'));
  assert.equal(find('[role="alert"]','Catalog unavailable'),undefined);
});

test('registry waits for its catalog and counts catalog records instead of review choices',async t=>{
  let finishCatalog;
  const catalog=new Promise(resolve=>{finishCatalog=resolve;});
  await setup(t,'#suppliers',{catalogResponse:()=>catalog});
  await click(find('button','Registru furnizori'));
  const emptyWhileLoading=find('main h3','Niciun furnizor găsit');
  const pendingCount=find('.library-tabs button','Registru furnizori').querySelector('span').textContent;
  await act(async()=>finishCatalog(Response.json({items:[supplier,{...supplier,id:'supplier-suspended',name:'Suspended Demo SRL',state:'suspended'}],total:2})));
  await settle();
  assert.equal(emptyWhileLoading,undefined);
  assert.equal(pendingCount,'—');
  assert.equal(document.querySelectorAll('.supplier-registry-card').length,2);
  assert.equal(find('.library-tabs button','Registru furnizori').querySelector('span').textContent,'2');
  assert.equal(find('.supplier-summary button','furnizori în registru').querySelector('strong').textContent,'2');
});

test('supplier contract returns to the registry with its query and scroll position',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  await setInput(document.querySelector('[aria-label="Caută un furnizor"]'),'Demo');
  browser.scrollTo(0,650);
  await click(find('button','Contractul sursă'));
  assert.equal(heading(),documentRecord.title);
  assert.equal(document.querySelector('.back-button').textContent.trim(),'Înapoi la Furnizori');
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
  assert.equal(document.querySelector('[aria-label="Caută un furnizor"]').value,'Demo');
  assert.ok(find('.library-tabs .active','Registru furnizori'));
  assert.equal(browser.scrollY,650);
});

for(const [page,label] of [['documents','Documente'],['contracts','Contracte'],['approvals','Aprobări'],
  ['sharing','Colaborare'],['audit','Jurnal de activitate'],['home','Acasă']])
  test(`document return preserves ${page} origin`,async t=>{
    await setup(t,`#${page}`);
    if(page==='sharing')await click(find('button','Documente trimise'));
    await click(find('button',documentRecord.title));
    assert.equal(heading(),documentRecord.title);
    assert.ok(document.querySelector('.back-button').textContent.includes(label));
    await click(document.querySelector('.back-button'));
    assert.equal(location.hash,`#${page}`);
    assert.notEqual(heading(),documentRecord.title);
  });

test('assistant document return does not reuse a previous list trigger',async t=>{
  await setup(t);
  await click(find('button','Registru furnizori'));
  const trigger=find('button','Contractul sursă');
  trigger.focus();
  await click(trigger);
  await click(document.querySelector('.back-button'));
  assert.ok(document.activeElement===trigger);
  await click(find('button','Întreabă FlyLeaf'));
  assert.equal(document.activeElement.id,'flyleaf-question');
  await click(find('[role="dialog"] button','Documente în aprobare'));
  await click(find('[role="dialog"] button',related.title));
  assert.equal(heading(),related.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
  assert.equal(document.activeElement.tagName,'MAIN');
});

test('browser Back and Forward retain the supplier origin',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  browser.scrollTo(0,500);
  await click(find('button','Contractul sursă'));
  await act(async()=>browser.history.back());await settle();
  assert.equal(heading(),'Furnizori');
  assert.equal(browser.scrollY,500);
  await act(async()=>browser.history.forward());await settle();
  assert.equal(heading(),documentRecord.title);
  assert.equal(browser.scrollY,0);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
});

test('related documents retain origin and return past the document chain',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  await click(find('button','Contractul sursă'));
  const link=find('.related-documents a',related.title);
  assert.ok(link.href.includes('from=suppliers'));
  await click(link);
  assert.equal(heading(),related.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
  await act(async()=>browser.history.forward());await settle();
  assert.equal(heading(),documentRecord.title);
});

test('direct document links with an origin can return without leaving the app',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers');
  assert.equal(heading(),documentRecord.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
});

test('legacy document links fall back to Documents, including failed loads',async t=>{
  await setup(t,'#document/missing',{documentError:true});
  assert.ok(find('[role="alert"]','Document unavailable'));
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Documente');
});

test('unsupported supplier origin falls back to Documents for unauthorized roles',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers',{roles:['technician']});
  assert.equal(heading(),documentRecord.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Documente');
});

test('malformed encoded document links recover without crashing',async t=>{
  await setup(t,'#document/%E0%A4%A');
  assert.equal(heading(),'Documente');
});

test('sidebar still navigates away from document detail',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers');
  await click(find('nav button','Contracte'));
  assert.equal(heading(),'Contracte');
  await click(find('button',documentRecord.title));
  await click(find('nav button','Furnizori'));
  assert.equal(heading(),'Furnizori');
});

test('browser Forward dismisses supplier dialogs and releases their scroll lock',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  await click(find('button','Contractul sursă'));
  await click(document.querySelector('.back-button'));
  await click(find('button','Înregistrează furnizor'));
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(document.body.style.overflow,'hidden');
  await act(async()=>browser.history.forward());await settle(70);
  assert.equal(heading(),documentRecord.title);
  assert.equal(document.body.style.overflow,'');
  assert.equal(document.querySelector('[role="dialog"]'),null);
  await click(document.querySelector('.back-button'));
  assert.equal(document.querySelector('[role="dialog"]'),null);
});

test('native workflow links close global overlays and select Approvals',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers',{workflowTask:true});
  await click(find('button','Întreabă FlyLeaf'));
  assert.ok(document.querySelector('[role="dialog"]'));
  // A native hash link must be handled just like a sidebar button.
  await click(find('a','Vezi sarcinile echipei'));
  assert.equal(heading(),'Aprobări');
  assert.equal(document.querySelector('[role="dialog"]'),null);
  assert.equal(document.body.style.overflow,'');
});

test('breadcrumb returns to the originating list and keeps its sidebar selection',async t=>{
  await setup(t);
  await click(find('button','Registru furnizori'));
  await click(find('button','Contractul sursă'));
  assert.ok(find('nav [aria-current="page"]','Furnizori'));
  await click(find('.breadcrumb-parent','Furnizori'));
  assert.equal(heading(),'Furnizori');
});

test('modified related-link clicks keep native behavior and carry origin in the URL',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers');
  const link=find('.related-documents a',related.title);
  const event=new window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});
  // Suppress jsdom's default navigation after observing our handler's behavior.
  let prevented;
  document.addEventListener('click',e=>{prevented=e.defaultPrevented;e.preventDefault()},{once:true});
  await act(async()=>link.dispatchEvent(event));
  assert.equal(prevented,false);
  assert.ok(link.href.endsWith('#document/doc-related?from=suppliers'));
  assert.equal(heading(),documentRecord.title);
});

test('unknown return targets cannot navigate outside the application',async t=>{
  await setup(t,'#document/doc-contract?from=https%3A%2F%2Fexample.test');
  await click(document.querySelector('.back-button'));
  assert.equal(location.hash,'#documents');
});

test('account changes reset list state and do not reuse another user’s document chain',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  await setInput(document.querySelector('[aria-label="Caută un furnizor"]'),'Demo');
  await click(find('button','Contractul sursă'));
  await click(document.querySelector('.user-button'));
  await click(find('.user-menu button',technician.name));
  assert.equal(location.hash,'#home');
  assert.equal(find('nav button','Furnizori'),undefined);
  await act(async()=>browser.history.back());await settle(70);
  assert.equal(heading(),documentRecord.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Documente');
  assert.equal(document.querySelector('[aria-label="Caută un furnizor"]'),null);
});

test('document navigation moves keyboard focus to detail and back to its trigger',async t=>{
  await setup(t);
  await click(find('button','Registru furnizori'));
  const trigger=find('button','Contractul sursă');
  trigger.focus();
  await click(trigger);
  assert.ok(document.activeElement===document.querySelector('.back-button'),'Focus should enter document detail');
  await click(document.querySelector('.back-button'));
  assert.ok(document.activeElement===trigger,'Focus should return to the retained list trigger');
});

for (const [hash,pageHeading] of [['#document','Documente'],['#document/','Documente'],['#unknown','Acasă']])
  test(`invalid route ${hash} uses a safe workspace fallback`,async t=>{
    await setup(t,hash);
    assert.equal(document.querySelector('.breadcrumb strong').textContent,pageHeading);
  });

test('every sidebar section works and mobile navigation closes its drawer',async t=>{
  await setup(t,'#document/doc-contract?from=suppliers');
  for (const [page,label] of [['home','Acasă'],['documents','Documente'],['contracts','Contracte'],
    ['suppliers','Furnizori'],['approvals','Aprobări'],['people','Echipă'],
    ['sharing','Colaborare'],['audit','Jurnal de activitate']]) {
    await click(document.querySelector('.mobile-menu'));
    assert.ok(document.querySelector('.sidebar-overlay'));
    await click(find('nav button',label));
    assert.equal(location.hash,`#${page}`);
    assert.ok(find('nav [aria-current="page"]',label));
    assert.equal(document.querySelector('.sidebar-overlay'),null);
  }
});

for (const dismiss of ['cancel','navigate','back','account change'])
  test(`a completed upload cannot redirect after ${dismiss}`,async t=>{
    let complete;
    const response=new Promise(resolve=>{complete=resolve});
    await setup(t,'#home',{uploadResponse:()=>response});
    await click(find('nav button','Documente'));
    await click(find('button','Adaugă document'));
    const input=document.querySelector('[type="file"]');
    Object.defineProperty(input,'files',{value:[new window.File(['demo'],'demo.pdf',{type:'application/pdf'})]});
    await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
    await click(find('[role="dialog"] button','Înregistrează documentul'));
    assert.ok(find('button','Se încarcă'));
    if(dismiss==='cancel')await click(find('[role="dialog"] button','Renunță'));
    else if(dismiss==='navigate')await click(find('nav button','Contracte'));
    else if(dismiss==='back'){await act(async()=>window.history.back());await settle(70);}
    else {
      await click(document.querySelector('.user-button'));
      await click(find('.user-menu button',technician.name));
    }
    const expectedHash=location.hash,historyLength=window.history.length;
    await act(async()=>complete(Response.json(documentRecord)));await settle(70);
    assert.equal(location.hash,expectedHash);
    assert.equal(window.history.length,historyLength);
    assert.equal(document.querySelector('[role="dialog"]'),null);
  });

test('a completed active upload opens its document and returns to its origin',async t=>{
  await setup(t,'#documents');
  await click(find('button','Adaugă document'));
  const input=document.querySelector('[type="file"]');
  Object.defineProperty(input,'files',{value:[new window.File(['demo'],'demo.pdf',{type:'application/pdf'})]});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  await click(find('[role="dialog"] button','Înregistrează documentul'));
  assert.equal(heading(),documentRecord.title);
  assert.equal(location.hash,'#document/doc-contract?from=documents');
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Documente');
});
