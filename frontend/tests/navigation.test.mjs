import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

const initialDOM = new JSDOM('<div></div>', {url:'http://aerodesk.test/', pretendToBeVisual:true});
installDOM(initialDOM.window);
const { createRoot } = await import('react-dom/client');
const bundle = await build({entryPoints:[fileURLToPath(new URL('../src/app/App.tsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module = {exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {App}=module.exports;
initialDOM.window.close();

function installDOM(window) {
  for (const key of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','Event','MouseEvent'])
    Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=(x,y)=>{
    Object.defineProperty(window,'scrollX',{value:x,configurable:true});
    Object.defineProperty(window,'scrollY',{value:y,configurable:true});
  };
}

const user={id:'admin',name:'Ana Demo',role:'director',roles:['director','finance'],department:'Conducere'};
const technician={id:'tech',name:'Teo Demo',role:'technician',roles:['technician'],department:'Tehnic'};
const documentRecord={id:'doc-contract',title:'Contract Demo Navigation',number:'DEMO-1',category:'Contract',
  department:'Achiziții',status:'approved',created_at:'2026-10-01',expires_at:'2027-01-01',supplier:'Demo SRL',
  value:1000,currency:'RON',owner:user.name,confidentiality:'internal',tags:[],summary:'Demo contract',
  filename:'demo.pdf',related_ids:[],metadata:{},version:1,validated:true,file_url:'/api/documents/doc-contract/file',
  contract_status:'active',days_remaining:60,versions:[],audit:[],workflow:{steps:[],current_step:'done'},
  permissions:{can_edit:false,can_review:false,can_sign:false,can_share:false}};
const related={...documentRecord,id:'doc-related',title:'Related Demo Document',related_documents:[]};
const supplier={id:'supplier-demo',name:'Demo SRL',document_id:documentRecord.id,expected_iban:'RO49AAAA1B31007593840000',
  verified_contact:'demo@example.test',trust_status:'demo_verified',bank_history:[],registry_revision:1,
  address:'Demo address',category:'Services',state:'active',contracts:[{id:documentRecord.id,title:documentRecord.title,
    version:1,eligible_for_review:true}]};

async function setup(t,hash='#suppliers',{roles=user.roles,documentError=false,workflowTask=false}={}) {
  const dom=new JSDOM('<div id="root"></div>',{url:`http://aerodesk.test/${hash}`,pretendToBeVisual:true});
  installDOM(dom.window);
  let currentUser={...user,roles};
  globalThis.fetch=async input=>{
    const path=new URL(String(input),dom.window.location.origin).pathname;
    let body;
    if(path==='/api/session')body={current_user:currentUser,users:[user,technician],airport:'Demo airport',reference_date:'2026-10-30',demo:true};
    else if(path==='/api/auth/login'){currentUser=technician;body={};}
    else if(path==='/api/supplier-reviews')body={items:[],total:0,suppliers:[supplier],counters:{needs_review:0,verified:0,approved:0,clear:0}};
    else if(path==='/api/suppliers')body={items:[supplier]};
    else if(path==='/api/supplier-registrations')body={items:[]};
    else if(path==='/api/documents')body={items:[documentRecord],total:1,categories:['Contract']};
    else if(path==='/api/contracts')body={items:[documentRecord]};
    else if(path==='/api/dashboard')body={stats:{documents:1,pending:0,expiring:0,approved:1},recent_documents:[documentRecord],attention:[],activity:[],departments:[]};
    else if(path==='/api/tasks')body={items:[{id:'task-demo',document_id:documentRecord.id,title:documentRecord.title,department:'Achiziții',
      assignee:user.name,status:'pending',priority:'normal',due_date:'2026-11-01',type:'approval',can_act:false}]};
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
  await act(async()=>{root.render(createElement(App));await new Promise(resolve=>setTimeout(resolve,10));});
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

test('supplier contract returns to the registry with its query and scroll position',async t=>{
  const browser=await setup(t);
  await click(find('button','Registru furnizori'));
  await setInput(document.querySelector('[aria-label="Caută un furnizor"]'),'Demo');
  browser.scrollTo(0,650);
  await click(find('button','Contractul sursă'));
  assert.equal(heading(),documentRecord.title);
  await click(document.querySelector('.back-button'));
  assert.equal(heading(),'Furnizori');
  assert.equal(document.querySelector('[aria-label="Caută un furnizor"]').value,'Demo');
  assert.ok(find('.library-tabs .active','Registru furnizori'));
  assert.equal(browser.scrollY,650);
});

for(const [page,label] of [['documents','Documente'],['contracts','Contracte'],['approvals','Aprobări'],
  ['sharing','Partajate cu aeroporturi'],['audit','Jurnal de activitate'],['home','Acasă']])
  test(`document return preserves ${page} origin`,async t=>{
    await setup(t,`#${page}`);
    await click(find('button',documentRecord.title));
    assert.equal(heading(),documentRecord.title);
    assert.ok(document.querySelector('.back-button').textContent.includes(label));
    await click(document.querySelector('.back-button'));
    assert.equal(location.hash,`#${page}`);
    assert.notEqual(heading(),documentRecord.title);
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
  await click(find('button','Întreabă AeroDesk'));
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
    ['sharing','Partajate cu aeroporturi'],['audit','Jurnal de activitate']]) {
    await click(document.querySelector('.mobile-menu'));
    assert.ok(document.querySelector('.sidebar-overlay'));
    await click(find('nav button',label));
    assert.equal(location.hash,`#${page}`);
    assert.ok(find('nav [aria-current="page"]',label));
    assert.equal(document.querySelector('.sidebar-overlay'),null);
  }
});
