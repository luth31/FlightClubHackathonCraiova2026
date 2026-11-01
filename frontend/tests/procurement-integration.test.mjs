import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';

function installDOM(window) {
  for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'FormData']) {
    Object.defineProperty(globalThis, key, {value: key === 'window' ? window : window[key], configurable: true});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}
const initial = new JSDOM('<div></div>', {url: 'http://flyleaf.test/'});
installDOM(initial.window);
const {createRoot} = await import('react-dom/client');
const result = await build({entryPoints: [fileURLToPath(new URL('../src/features/documents/UploadDialog.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: {'.css': 'empty'}});
const module = {exports: {}};
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const {UploadDialog} = module.exports;
initial.window.close();

const catalog = {version: 1, stages: [], relationships: [], templates: [
  {id: 'contract', label: 'Contract de achiziții', category: 'Contract', fields: [
    {key: 'supplier', label: 'Furnizor', type: 'text', required: true, source: 'supplier'},
    {key: 'value', label: 'Valoare totală cu TVA', type: 'money', required: true, source: 'value'},
  ]},
  {id: 'acceptance', label: 'Proces-verbal de recepție', category: 'Proces-verbal', fields: []},
]};
const user = {id: 'admin', name: 'Director', roles: ['director'], department: 'Conducere'};
async function setup(t) {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://flyleaf.test/', pretendToBeVisual: true});
  installDOM(dom.window);
  const uploaded = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === '/api/procurement/templates') return Response.json(catalog);
    assert.equal(String(url), '/api/documents');
    uploaded.push(options.body);
    return Response.json({id: 'created', version: 1});
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(createElement(UploadDialog, {user, onClose() {}, onCreated() {}})));
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 30))});
  t.after(async () => {await act(async () => root.unmount()); dom.window.close()});
  return {dom, uploaded};
}
test('intake asks only for the PDF and leaves document values for review', async t => {
  await setup(t);
  assert.ok(document.querySelector('input[type="file"]'));
  assert.equal(document.querySelectorAll('select, input[name="value"], input[name="supplier"]').length, 0);
  assert.equal([...document.querySelectorAll('button')].find(button => button.textContent.includes('Încarcă și verifică')).disabled, true);
});

test('intake uploads the PDF for automatic extraction without submitting document fields', async t => {
  const {dom, uploaded} = await setup(t);
  const file = new dom.window.File(['%PDF-1.4 fixture'], 'fixture.pdf', {type: 'application/pdf'});
  const fileInput = document.querySelector('input[type="file"]');
  Object.defineProperty(fileInput, 'files', {value: [file], configurable: true});
  await act(async () => fileInput.dispatchEvent(new window.Event('change', {bubbles: true})));
  await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true})));
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].get('file').name, 'fixture.pdf');
  assert.equal(uploaded[0].get('auto_extract'), 'true');
  assert.equal(uploaded[0].has('procurement_fields'), false);
  assert.equal(uploaded[0].has('supplier'), false);
});
