import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';

const initialDOM = new JSDOM('<div></div>');
function installDOM(window) {
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) {
    Object.defineProperty(globalThis, key, {value: key === 'window' ? window : window[key], configurable: true});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
}
installDOM(initialDOM.window);
const {createRoot} = await import('react-dom/client');
const bundle = await build({entryPoints: [fileURLToPath(new URL('../src/features/documents/DocumentFlow.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: {'.css': 'empty'}});
const module = {exports: {}};
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const {DocumentFlow} = module.exports;
initialDOM.window.close();

const stageIds = ['purchasing', 'shipping', 'inventory_management', 'invoice_verification'];
function record(id, stage, type, status = 'approved', caseId = 'ACH-1', related_ids = [], metadata = {}) {
  return {id, title: `${type} - Echipamente terminal`, number: id, status, category: type, related_ids, metadata,
    flow_case_id: caseId, flow: {stage, document_type: type}};
}
const records = [
  record('contract', 'purchasing', 'Contract', 'approved', 'ACH-1', ['delivery-a', 'delivery-b']),
  record('delivery-a', 'shipping', 'Livrare de intrare', 'approved', 'ACH-1', ['receipt']),
  record('delivery-b', 'shipping', 'Livrare de intrare', 'in_review', 'ACH-1', ['receipt']),
  record('receipt', 'inventory_management', 'Proces-verbal de recepție', 'rejected', 'ACH-1', ['invoice']),
  record('invoice', 'invoice_verification', 'Factură', 'draft', 'ACH-1', [], {contract_id: 'contract'}),
  record('second-contract', 'purchasing', 'Contract', 'signed', 'ACH-2'),
];
function flowData(items = records) {
  return {stages: stageIds.map(id => ({id, label: id, count: items.filter(item => item.flow.stage === id).length,
    items: items.filter(item => item.flow.stage === id)})), total: items.length, classified_total: items.length,
    unclassified_total: 2, cases: [...new Set(items.map(item => item.flow_case_id))].map(id => ({id, label: id, count: items.filter(item => item.flow_case_id === id).length}))};
}
async function setup(t, data = flowData()) {
  const dom = new JSDOM('<div id="root"></div>', {pretendToBeVisual: true});
  installDOM(dom.window);
  const opened = [], selected = [], register = [];
  const root = createRoot(document.getElementById('root'));
  const props = {data, caseId: '', onOpen: id => opened.push(id), onSelectCase: id => selected.push(id), onShowRegister: () => register.push(true)};
  t.after(async () => {await act(async () => root.unmount()); dom.window.close()});
  await act(async () => root.render(createElement(DocumentFlow, props)));
  return {root, props, opened, selected, register};
}
async function click(element) {assert.ok(element); await act(async () => element.click())}

test('the case navigator shows one dossier at a time and filters keep their callbacks', async t => {
  const {opened, selected} = await setup(t);
  assert.deepEqual([...document.querySelectorAll('.flow-stage h3')].map(node => node.textContent), ['Achiziții', 'Livrare', 'Recepție', 'Facturare']);
  assert.equal(document.querySelectorAll('.flow-lanes').length, 1);
  assert.equal(document.querySelectorAll('.flow-document').length, 5);
  const choices = document.querySelectorAll('.flow-case-choice');
  assert.equal(choices[0].getAttribute('aria-pressed'), 'true');
  assert.equal(choices[1].getAttribute('aria-pressed'), 'false');
  await click(choices[1]);
  assert.equal(choices[1].getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('.flow-case-graph').length, 1);
  assert.equal(document.querySelectorAll('.flow-document').length, 1);
  assert.equal(document.querySelector('[data-node-id="contract"]'), null);
  await click(document.querySelector('[data-node-id="second-contract"] button'));
  assert.deepEqual(opened, ['second-contract']);
  const select = document.querySelector('select');
  await act(async () => {select.value = 'ACH-1'; select.dispatchEvent(new window.Event('change', {bubbles: true}))});
  assert.deepEqual(selected, ['ACH-1']);
  await click(choices[0]);
  assert.equal(document.querySelectorAll('.flow-document').length, 5);
});

test('status labels accompany colors and keyboard focus highlights every linked input', async t => {
  const {opened} = await setup(t);
  for (const [id, tone, label] of [['contract', 'positive', 'Aprobat'], ['delivery-b', 'waiting', 'În aprobare'],
    ['receipt', 'negative', 'Returnat'], ['invoice', 'neutral', 'Ciornă']]) {
    const node = document.querySelector(`[data-node-id="${id}"]`);
    assert.ok(node.classList.contains(`flow-tone-${tone}`));
    assert.equal(node.querySelector('.flow-document-status').textContent, label);
  }
  const receipt = document.querySelector('[data-node-id="receipt"] button');
  await act(async () => receipt.focus());
  assert.deepEqual([...document.querySelectorAll('.flow-connector-active')].map(node => [node.dataset.sourceId, node.dataset.targetId]),
    [['delivery-a', 'receipt'], ['delivery-b', 'receipt'], ['receipt', 'invoice']]);
  assert.equal(document.querySelectorAll('.flow-document-related').length, 4);
  await click(receipt);
  assert.deepEqual(opened, ['receipt']);
  await act(async () => document.querySelector('select').focus());
  assert.equal(document.querySelectorAll('.flow-connector-active').length, 0);
  const invoice = document.querySelector('[data-node-id="invoice"] button');
  assert.match(invoice.title, /Contract de referință: Contract/);
  assert.match(invoice.title, /Document legat: Proces-verbal/);
});

test('a filtered case renders directly and empty results retain the route back to the register', async t => {
  const {root, props, register} = await setup(t, flowData(records.slice(5)));
  assert.equal(document.querySelectorAll('.flow-document').length, 1);
  assert.equal(document.querySelector('.flow-case-choice').getAttribute('aria-pressed'), 'true');
  await act(async () => root.render(createElement(DocumentFlow, {...props, data: flowData([])})));
  assert.match(document.querySelector('.flow-empty-diagram').textContent, /Niciun document/);
  assert.equal(document.querySelectorAll('.flow-connectors').length, 0);
  await click(document.querySelector('.flow-note button'));
  assert.deepEqual(register, [true]);
});

test('filtering out the selected case falls back to a visible case without stale documents', async t => {
  const {root, props} = await setup(t);
  await click(document.querySelectorAll('.flow-case-choice')[1]);
  await act(async () => root.render(createElement(DocumentFlow, {...props, data: flowData(records.slice(0, 5))})));
  assert.equal(document.querySelector('[data-node-id="second-contract"]'), null);
  assert.equal(document.querySelectorAll('.flow-document').length, 5);
  assert.equal(document.querySelector('.flow-case-choice').getAttribute('aria-pressed'), 'true');
});
