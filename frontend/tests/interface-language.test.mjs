import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','Event','FormData','Node','Element'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:dom.window[name],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const bundle=await build({stdin:{contents:`export * from './src/i18n'; export {LoginPage} from './src/features/auth/LoginPage'; export {TemplateFields} from './src/features/procurement/TemplateFields'; export {statusLabel} from './src/utils/format';`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
function load(){const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports}
const ui=load();
const languageOnly=await build({stdin:{contents:`export * from './src/i18n';`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});
const change=(element,value)=>{const prototype=element instanceof dom.window.HTMLSelectElement?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}))};

test('switching the real login form keeps credentials and persists the interface language',async()=>{
  ui.setLanguage('ro');const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(createElement(ui.LoginPage,{session:{auth:{mode:'demo'}},onLogin:()=>{}})));
  const username=document.querySelector('[name=username]'),password=document.querySelector('[name=password]');
  await act(async()=>{change(username,'Ana Ionescu');change(password,'kept-in-form')});
  await act(async()=>change(document.querySelector('.language-switcher select'),'en'));
  assert.equal(document.documentElement.lang,'en');
  assert.equal(localStorage.getItem('flyleaf.interface-language'),'en');
  assert.match(document.body.textContent,/Welcome/);
  assert.equal(document.querySelector('[name=username]'),username,'language changes must not remount the form');
  assert.equal(username.value,'Ana Ionescu');assert.equal(password.value,'kept-in-form');
  assert.match(document.body.textContent,/Less paperwork\. More possibility\./);
  assert.equal(load().getLanguage(),'en','a new module session restores the saved preference');
  await act(async()=>ui.setLanguage('ro'));
  assert.match(document.body.textContent,/Bine ai venit/);assert.equal(password.value,'kept-in-form');
  await act(async()=>root.unmount());
});

test('English template labels retain the original option values and authored field content',async()=>{
  ui.setLanguage('en');const root=createRoot(document.getElementById('root')),changes=[];
  const template={id:'contract',fields:[{key:'approval',label:'Stare',type:'select',required:true,options:[{value:'approved',label:'Aprobat'},{value:'in_review',label:'În aprobare'}]},{key:'title',label:'Titlu',type:'text',required:true}]};
  await act(async()=>root.render(createElement(ui.TemplateFields,{template,values:{approval:'approved',title:'Contract Craiova – mentenanță'},onChange:v=>changes.push(v)})));
  const select=document.querySelector('select');assert.equal(select.value,'approved');
  assert.equal(select.options[1].textContent,'Approved');assert.equal(select.options[1].value,'approved');
  assert.equal(document.querySelector('[name=title]').value,'Contract Craiova – mentenanță');
  await act(async()=>change(select,'in_review'));
  assert.deepEqual(changes[0],{approval:'in_review',title:'Contract Craiova – mentenanță'});
  await act(async()=>root.unmount());ui.setLanguage('ro');
});

test('status labels follow language while unknown authored content and interpolation values stay intact',()=>{
  ui.setLanguage('en');assert.equal(ui.statusLabel.approved,'Approved');assert.equal(ui.getLocale(),'en-GB');
  assert.equal(ui.t('Angajat'),'Employee');assert.equal(ui.t('Angajat',undefined,'procurement'),'Committed');
  assert.equal(ui.t('Contract particular Craiova – Sibiu'),'Contract particular Craiova – Sibiu');
  assert.equal(ui.t('Dosar {p0}',{p0:'CRA/2026-42'}),'Case CRA/2026-42');
  ui.setLanguage('ro');assert.equal(ui.statusLabel.approved,'Aprobat');assert.equal(ui.getLocale(),'ro-RO');
});

test('disabled browser storage falls back to Romanian and still allows changing the current session',()=>{
  const storage=globalThis.localStorage;
  Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('Storage disabled')},configurable:true});
  try {const module={exports:{}};new Function('require','module','exports',languageOnly.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const isolated=module.exports;assert.equal(isolated.getLanguage(),'ro');assert.doesNotThrow(()=>isolated.setLanguage('en'));assert.equal(isolated.t('Documente'),'Documents')}
  finally {Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true,writable:true});ui.setLanguage('ro')}
});
