import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

function install(window){for(const key of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','FormData'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true,writable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true}
const initial=new JSDOM('<div/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});install(initial.window);
const {createRoot}=await import('react-dom/client');
async function load(name){const result=await build({entryPoints:[fileURLToPath(new URL(`../src/features/procurement/${name}.tsx`,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports[name]}
const ProcurementWorkspace=await load('ProcurementWorkspace'),TemplateFields=await load('TemplateFields'),ProcurementDocumentPanel=await load('ProcurementDocumentPanel');initial.window.close();
const stages=[{id:'draft',label:'Ciornă'},{id:'needs_review',label:'În verificare'},{id:'committed',label:'Angajat'},{id:'accepted',label:'Recepționat'},{id:'invoiced',label:'Facturat'},{id:'paid',label:'Plătit'}];
const templates=[{id:'necessity',label:'Referat de necesitate',category:'Referat',fields:[{key:'justification',label:'Justificare',type:'textarea',required:true},{key:'value',label:'Valoare cu TVA',type:'money',required:true},{key:'issue_date',label:'Data emiterii',type:'date',required:true},{key:'urgency',label:'Urgență',type:'select',required:true,options:[{value:'normal',label:'Normală'}]},{key:'resolved',label:'Constatări rezolvate',type:'boolean',required:false}]},{id:'contract',label:'Contract',category:'Contract',fields:[]},{id:'invoice',label:'Factură',category:'Factură',fields:[]},{id:'acceptance',label:'Recepție',category:'Recepție',fields:[]}];
const catalog={version:1,stages,templates,relationships:[{id:'invoices_against',label:'Facturează',source_types:['invoice'],target_types:['contract','acceptance']}]};
const owners=[{id:'owner-1',name:'Ana Achiziții'},{id:'owner-2',name:'Dan Achiziții'}];
const capability={can_manage:true,can_accept:true,can_finance:true,can_advance:false,can_return:true,can_cancel:true,can_reopen:false,can_pay:true,can_refund:true};
const evidence=(id,template,extra={})=>({document_id:id,version:2,current_version:2,template_id:template,title:{'invoice-1':'Factura 15','acceptance-1':'Recepție echipament','contract-1':'Contract echipament'}[id]||'Referat de necesitate',number:id,status:'approved',stale:false,complete:true,errors:[],can_edit:true,...extra});
const base={id:'case-1',number:'AC-001',title:'Echipament pistă',description:'Achiziție echipament',owner_id:'owner-1',owner_name:'Ana Achiziții',currency:'RON',anticipated_value:'1000.00',committed_value:'1000.00',deadline:'2026-12-01',stage:'draft',revision:3,legacy_ref:null,primary_document_id:'contract-1',documents:[],links:[],allocations:[],balances:null,payments:[],history:[{id:'event-1',action:'created',comment:'Dosar creat',actor:'Ana Achiziții',created_at:'2026-11-01T08:00:00Z',from_stage:null,to_stage:'draft',evidence:{}}],blockers:['Lipsește referatul de necesitate aprobat.'],next_action:'Trimite spre verificare',capabilities:capability,available_documents:[{id:'need-1',title:'Referat de necesitate',number:'RN-1',category:'Referat',version:4,status:'approved'}],owners};
const summary=item=>({id:item.id,number:item.number,title:item.title,owner_name:item.owner_name,currency:item.currency,stage:item.stage,revision:item.revision,legacy_ref:item.legacy_ref,document_count:item.documents.length,stale_count:item.documents.filter(x=>x.stale).length,deadline:item.deadline});
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))})}
const find=(selector,text)=>[...document.querySelectorAll(selector)].find(element=>element.textContent.includes(text));
async function click(element){assert.ok(element,'Expected a visible control');await act(async()=>element.click());await settle()}
async function input(element,value){assert.ok(element,'Expected editable field');await act(async()=>{const proto=element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}))});await settle()}
async function select(label,value){const element=document.querySelector(`[aria-label="${label}"]`);assert.ok(element,`Expected ${label}`);await act(async()=>{element.value=value;element.dispatchEvent(new window.Event('change',{bubbles:true}))});await settle()}
async function setup(t,{empty=false,detail={},failPath='',failStatus=503,lostResponsePath='',documentPanel=false,canCreate=true}={}){
  assert.ok(documentPanel?ProcurementDocumentPanel:ProcurementWorkspace,'The procurement feature must be implemented');
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});install(dom.window);
  let current={...structuredClone(base),...structuredClone(detail)},items=empty?[]:[current,{...structuredClone(base),id:'cancelled-1',title:'Dosar anulat',stage:'cancelled'}],fails=failPath?1:0;
  const mutations=[],notifications=[],opened=[],changed=[];let lostResponses=lostResponsePath?1:0;
  let metadata={document_id:'need-1',version:4,template_id:'necessity',fields:{justification:'Justificare originală',value:'1200.50',issue_date:'2026-11-01',urgency:'normal'},errors:['Buget lipsă'],case_id:null,case_revision:null,can_edit:true};
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input),location.origin),path=url.pathname,body=options.body?JSON.parse(options.body):undefined,method=options.method||'GET';
    if(method!=='GET'){
      mutations.push({path,method,body,query:url.search});
      if(path===failPath&&fails-->0){if(failStatus===409)current={...current,revision:9};return Response.json({detail:failStatus===409?'Dosarul a fost modificat.':'Conexiune întreruptă. Reîncearcă.'},{status:failStatus})}
      if(path==='/api/procurement/cases'){current={...current,...body,title:body.title,id:'case-new',number:'AC-002',revision:1};items.push(current);return Response.json(current)}
      if(path==='/api/procurement/documents/need-1'){metadata={...metadata,...body,version:5,errors:[]};return Response.json(metadata)}
      if(body?.revision!==undefined&&body.revision!==current.revision)return Response.json({detail:'Dosarul a fost modificat. Reîncarcă.'},{status:409});
      if(path.endsWith('/documents'))current.documents=[...current.documents.filter(x=>x.document_id!==body.document_id),evidence(body.document_id,body.template_id,{version:body.version,current_version:body.version})];
      if(path.endsWith('/links'))current.links.push({id:'link-1',...body,stale:false});
      if(path.endsWith('/allocations'))current.allocations.push({id:'allocation-1',...body});
      if(path.endsWith('/actions')){current.stage=body.action==='return'?body.target_stage:body.action==='cancel'?'cancelled':body.action==='reopen'?'draft':'needs_review';current.history.push({id:`event-${current.history.length+1}`,action:body.action,comment:body.comment,actor:'Ana Achiziții',created_at:'2026-11-01T09:00:00Z',from_stage:'draft',to_stage:current.stage,evidence:{}})}
      if(path.endsWith('/payments'))current.payments.push({id:'payment-new',...body,actor:'Financiar',created_at:'2026-11-01T09:00:00Z',reversed_entry_id:null});
      if(path.endsWith('/reverse'))current.payments.push({id:'reverse-new',kind:'reversal',invoice_id:'invoice-1',invoice_version:2,amount:'300.00',date:body.date,reference:body.reference,actor:'Financiar',created_at:'2026-11-01T09:00:00Z',reversed_entry_id:'payment-1'});
      if(method==='PATCH'&&path.startsWith('/api/procurement/cases/'))current={...current,...body};
      current={...current,revision:current.revision+1};items=items.map(x=>x.id===current.id?current:x);if(path===lostResponsePath&&lostResponses-->0)return Response.json({detail:'Răspuns pierdut după înregistrare.'},{status:503});return Response.json(current);
    }
    if(path==='/api/procurement/templates')return Response.json(catalog);
    if(path==='/api/procurement/cases')return Response.json({items:items.filter(x=>x.title.toLowerCase().includes((url.searchParams.get('q')||'').toLowerCase())).map(summary),stages,can_create:canCreate,owners});
    if(path==='/api/procurement/documents/need-1')return Response.json(metadata);
    if(path.startsWith('/api/procurement/cases/'))return Response.json(current);
    throw new Error(`Unexpected API ${method} ${path}`);
  };
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  const render=async revision=>{await act(async()=>root.render(createElement(documentPanel?ProcurementDocumentPanel:ProcurementWorkspace,{revision,documentId:'need-1',documentVersion:4,onChanged:()=>changed.push(true),notify:value=>notifications.push(value),onOpen:id=>opened.push(id)})));await settle()};await render(1);
  return {mutations,notifications,opened,changed,render,setDetail:value=>{current={...current,...value}},detail:()=>current};
}

test('four guided steps retain selectable empty cases and cancelled cases have their own section',async t=>{
  await setup(t);assert.equal(document.querySelectorAll('.proc-column').length,4);assert.ok(find('.proc-cancelled','Dosar anulat'));
  await click(find('.proc-case-card','Echipament pistă'));assert.ok(find('h2','Echipament pistă'));assert.equal(document.querySelectorAll('.guide-evidence').length,2);assert.match(document.querySelector('.guide-ready').textContent,/Lipsește referatul/);assert.equal(find('button','Trimite spre verificare').disabled,true);
});
test('case creation retains fields on failed submit and opens the returned empty case on retry',async t=>{
  const app=await setup(t,{empty:true,failPath:'/api/procurement/cases'});await click(find('button','Dosar nou'));
  await input(document.querySelector('[aria-label="Titlu dosar"]'),'Sistem iluminare');await input(document.querySelector('[aria-label="Descriere dosar"]'),'Iluminare pentru pistă');await select('Responsabil dosar','owner-2');await input(document.querySelector('[aria-label="Valoare anticipată cu TVA"]'),'1250.75');
  await click(find('button','Creează dosarul'));assert.match(document.querySelector('[role=alert]').textContent,/întreruptă/);assert.equal(document.querySelector('[aria-label="Titlu dosar"]').value,'Sistem iluminare');
  await click(find('button','Creează dosarul'));assert.ok(find('h2','Sistem iluminare'));assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(app.detail().anticipated_value,'1250.75');assert.equal(app.notifications.length,1);
});
test('read-only technical view shows blockers without finance or management controls',async t=>{
  await setup(t,{canCreate:false,detail:{capabilities:{...capability,can_manage:false,can_finance:false,can_return:false,can_cancel:false,can_pay:false,can_refund:false},balances:null,payments:[]}});await click(find('.proc-case-card','Echipament pistă'));
  assert.equal(find('button','Dosar nou'),undefined);assert.equal(find('button','Editează dosarul'),undefined);assert.equal(document.querySelector('.proc-finance'),null);assert.equal(document.querySelector('[aria-label="Document de asociat"]'),null);assert.match(document.querySelector('.guide-ready').textContent,/Lipsește referatul/);
});
test('editing owner and primary award preserves the draft through a revision conflict and retries current revision',async t=>{
  const app=await setup(t,{detail:{documents:[evidence('contract-1','contract')]},failPath:'/api/procurement/cases/case-1',failStatus:409});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Editează dosarul'));await select('Responsabil dosar','owner-2');await select('Angajament principal','contract-1');await input(document.querySelector('[aria-label="Titlu dosar"]'),'Echipament revizuit');
  await click(find('button','Salvează dosarul'));assert.equal(document.querySelector('[aria-label="Titlu dosar"]').value,'Echipament revizuit');assert.match(document.querySelector('[role=alert]').textContent,/modificat/);await click(find('button','Salvează dosarul'));assert.ok(find('h2','Echipament revizuit'));assert.equal(app.mutations[1].body.revision,9);assert.equal(app.detail().owner_id,'owner-2');
});
test('evidence is associated explicitly and stale evidence refresh uses the current document version',async t=>{
  const app=await setup(t,{detail:{documents:[evidence('contract-1','contract',{stale:true,current_version:5})]}});await click(find('.proc-case-card','Echipament pistă'));
  await select('Document de asociat','need-1');await select('Tip document asociat','necessity');await click(find('button','Asociază documentul'));assert.ok(find('.proc-document','Referat de necesitate'));
  await click(find('.proc-document button','Actualizează la v5'));assert.match(find('.proc-document','Contract echipament').textContent,/v5/);assert.equal(app.mutations[1].body.version,5);await click(find('.proc-document button','Contract echipament'));assert.deepEqual(app.opened,['contract-1']);
});
test('typed child-to-parent links and explicit invoice acceptance amounts refresh the evidence lists',async t=>{
  const app=await setup(t,{detail:{documents:[evidence('invoice-1','invoice'),evidence('contract-1','contract'),evidence('acceptance-1','acceptance')]}});await click(find('.proc-case-card','Echipament pistă'));
  await select('Tip relație','invoices_against');await select('Document sursă','invoice-1');await select('Document țintă','contract-1');await click(find('button','Adaugă relația'));assert.ok(find('.proc-link','Facturează'));assert.equal(app.mutations[0].body.source_version,2);
  await select('Factură alocată','invoice-1');await select('Recepție alocată','acceptance-1');await input(document.querySelector('[aria-label="Sumă alocată cu TVA"]'),'700.25');await click(find('button','Salvează alocarea'));assert.ok(find('.proc-allocation','700,25'));assert.equal(app.mutations[1].body.amount,'700.25');
});
test('return requires a reason and carries an earlier target stage without deleting historical payments',async t=>{
  const app=await setup(t,{detail:{stage:'accepted'}});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Returnează dosarul'));assert.equal(find('button','Confirmă returnarea').disabled,true);await select('Etapa de revenire','needs_review');await input(document.querySelector('[aria-label="Motiv decizie"]'),'Revizuire angajament');await click(find('button','Confirmă returnarea'));assert.equal(app.detail().stage,'needs_review');assert.ok(find('.proc-history','Revizuire angajament'));
});
const financial={committed:'1000.00',accepted:'1000.00',invoiced:'1000.00',credited:'400.00',paid:'900.00',outstanding:'0.00',overpaid:'300.00',invoices:[{document_id:'invoice-1',title:'Factura 15',gross:'1000.00',credit:'400.00',net:'600.00',paid:'900.00',outstanding:'0.00',overpaid:'300.00'}]};
test('finance records refund separately from payment correction and preserves failed refund entry',async t=>{
  const app=await setup(t,{detail:{stage:'invoiced',documents:[evidence('invoice-1','invoice')],balances:financial,payments:[{id:'payment-1',kind:'payment',invoice_id:'invoice-1',invoice_version:2,amount:'300.00',date:'2026-11-01',reference:'OP-1',actor:'Financiar',created_at:'2026-11-01T08:00:00Z',reversed_entry_id:null}]},failPath:'/api/procurement/cases/case-1/payments'});await click(find('.proc-case-card','Echipament pistă'));
  assert.ok(find('.proc-finance','Supraplată'));await select('Tip înregistrare financiară','refund');await select('Factură pentru înregistrare','invoice-1');await input(document.querySelector('[aria-label="Sumă înregistrată"]'),'300.00');await input(document.querySelector('[aria-label="Referință financiară"]'),'EXTRAS-9');await input(document.querySelector('[aria-label="Data înregistrării"]'),'2026-11-01');await click(find('button','Înregistrează suma'));assert.equal(document.querySelector('[aria-label="Referință financiară"]').value,'EXTRAS-9');await click(find('button','Înregistrează suma'));assert.ok(find('.proc-payment','Rambursare'));assert.equal(app.detail().payments.length,2);
  await click(find('.proc-payment button','Corectează înregistrarea'));await input(document.querySelector('[aria-label="Motiv decizie"]'),'OP înregistrat eronat');await input(document.querySelector('[aria-label="Referință corecție"]'),'COR-1');await click(find('button','Confirmă corecția'));assert.ok(find('.proc-payment','Stornare'));assert.equal(app.detail().payments.at(-1).reversed_entry_id,'payment-1');
});
test('catalog forms use fixed field types and preserve decimal strings and boolean values',async t=>{
  assert.ok(TemplateFields,'Catalog forms must be implemented');const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});install(dom.window);const root=createRoot(document.getElementById('root'));t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});let values={};function Form(){const [state,setState]=React.useState(values);return createElement(TemplateFields,{template:templates[0],values:state,onChange:value=>{values=value;setState(value)}})}const React=await import('react');await act(async()=>root.render(createElement(Form)));await input(document.querySelector('[aria-label="Valoare cu TVA"]'),'12.50');await click(document.querySelector('[aria-label="Constatări rezolvate"]'));assert.equal(values.value,'12.50');assert.equal(values.resolved,true);assert.equal(document.querySelector('[aria-label="Justificare"]').tagName,'TEXTAREA');assert.equal(document.querySelector('[aria-label="Data emiterii"]').type,'date');
});
test('document metadata editing keeps a failed new-version draft and explicitly associates an accessible case',async t=>{
  const app=await setup(t,{documentPanel:true,failPath:'/api/procurement/documents/need-1'});await input(document.querySelector('[aria-label="Justificare"]'),'Justificare actualizată');await click(find('button','Salvează corecturile'));assert.equal(document.querySelector('[aria-label="Justificare"]').value,'Justificare actualizată');await click(find('button','Salvează corecturile'));assert.ok(find('.proc-document-panel','v5'));assert.equal(app.changed.length,1);
  await select('Dosar pentru document','case-1');await click(find('button','Asociază în dosar'));assert.equal(app.mutations.at(-1).body.version,5);assert.equal(app.mutations.at(-1).body.revision,3);
});

test('history retains the versions used for a decision and hides inaccessible document or commitment evidence',async t=>{
  await setup(t,{detail:{documents:[evidence('contract-1','contract')],history:[{...base.history[0],action:'advance',evidence:{'contract-1':1,'secret-document':3,committed_value:'987654.32'}}]}});await click(find('.proc-case-card','Echipament pistă'));
  assert.ok(find('.proc-history','Contract echipament · v1'));assert.doesNotMatch(document.querySelector('.proc-history').textContent,/secret-document|987654/);
});

test('external document updates refresh evidence without closing or replacing an unsaved case edit',async t=>{
  const app=await setup(t,{detail:{documents:[evidence('contract-1','contract')]}});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Editează dosarul'));await input(document.querySelector('[aria-label="Titlu dosar"]'),'Titlu în lucru');app.setDetail({revision:8,documents:[evidence('contract-1','contract',{stale:true,current_version:4})]});await app.render(2);
  assert.equal(document.querySelector('[aria-label="Titlu dosar"]').value,'Titlu în lucru');assert.ok(find('.proc-document','Dovadă depășită'));await click(find('button','Salvează dosarul'));assert.equal(app.mutations[0].body.revision,8);
});

test('advance, cancellation and reopening use explicit stage decisions with mandatory cancellation and reopen reasons',async t=>{
  const app=await setup(t,{detail:{capabilities:{...capability,can_advance:true,can_reopen:true},blockers:[]}});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Trimite spre verificare'));await click(find('button','Confirmă etapa următoare'));assert.equal(app.detail().stage,'needs_review');
  await click(find('button','Anulează dosarul'));assert.equal(find('button','Confirmă anularea').disabled,true);await input(document.querySelector('[aria-label="Motiv decizie"]'),'Necesitatea a fost retrasă');await click(find('button','Confirmă anularea'));assert.equal(app.detail().stage,'cancelled');await click(find('button','Redeschide dosarul'));assert.equal(find('button','Confirmă redeschiderea').disabled,true);await input(document.querySelector('[aria-label="Motiv decizie"]'),'Buget confirmat pentru reluare');await click(find('button','Confirmă redeschiderea'));assert.equal(app.detail().stage,'draft');assert.ok(find('.proc-history','Buget confirmat pentru reluare'));
});

test('a lost committed payment response is reconciled on retry without permitting another payment entry',async t=>{
  const app=await setup(t,{lostResponsePath:'/api/procurement/cases/case-1/payments',detail:{stage:'invoiced',documents:[evidence('invoice-1','invoice')],balances:financial}});await click(find('.proc-case-card','Echipament pistă'));await select('Factură pentru înregistrare','invoice-1');await input(document.querySelector('[aria-label="Sumă înregistrată"]'),'200.00');await input(document.querySelector('[aria-label="Referință financiară"]'),'OP-LOST');await click(find('button','Înregistrează suma'));assert.equal(app.detail().payments.length,1);assert.equal(document.querySelector('[aria-label="Referință financiară"]').value,'OP-LOST');
  await click(find('button','Înregistrează suma'));assert.equal(app.detail().payments.length,1);assert.equal(document.querySelector('[aria-label="Referință financiară"]').value,'');assert.ok(find('.proc-payment','OP-LOST'));
});

test('a lost stage decision response closes the acknowledged decision on retry instead of advancing twice',async t=>{
  const app=await setup(t,{lostResponsePath:'/api/procurement/cases/case-1/actions',detail:{capabilities:{...capability,can_advance:true},blockers:[]}});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Trimite spre verificare'));await click(find('button','Confirmă etapa următoare'));assert.equal(app.detail().history.length,2);await click(find('button','Confirmă etapa următoare'));assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(app.detail().history.length,2);
});

test('editing a later-stage case omits the unchanged primary award and prevents changing it without returning the case',async t=>{
  const app=await setup(t,{detail:{stage:'accepted',documents:[evidence('contract-1','contract')]}});await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Editează dosarul'));assert.equal(document.querySelector('[aria-label="Angajament principal"]').disabled,true);await input(document.querySelector('[aria-label="Titlu dosar"]'),'Titlu după recepție');await click(find('button','Salvează dosarul'));assert.equal(Object.hasOwn(app.mutations[0].body,'primary_document_id'),false);assert.ok(find('h2','Titlu după recepție'));
});

test('external refresh between a lost advance response and retry preserves the original stage intent',async t=>{
  const app=await setup(t,{lostResponsePath:'/api/procurement/cases/case-1/actions',detail:{capabilities:{...capability,can_advance:true},blockers:[]}});
  await click(find('.proc-case-card','Echipament pistă'));await click(find('button','Trimite spre verificare'));await click(find('button','Confirmă etapa următoare'));
  await app.render(2);assert.equal(app.detail().stage,'needs_review');
  await click(find('button','Confirmă etapa următoare'));assert.equal(document.querySelector('[role=dialog]'),null);
  assert.equal(app.detail().history.length,2);assert.equal(app.mutations[1].body.revision,3);
});
