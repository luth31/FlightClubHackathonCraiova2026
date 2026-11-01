import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

function installDOM(window) {
  for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement'])
    Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}
const initialDOM = new JSDOM('', { url: 'http://flyleaf.test/' });
installDOM(initialDOM.window);
const { createRoot } = await import('react-dom/client');
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/features/people/index.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', loader: { '.css': 'empty' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { PeoplePage } = module.exports;
initialDOM.window.close();

async function setup(t) {
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'http://flyleaf.test/' });
  installDOM(dom.window);
  const base = { email: 'demo@example.test', role: 'technician', roles: ['technician'], active: true, availability: 'available', job_title: 'Demo' };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    items: [{ ...base, id: 'ana', name: 'Ana Demo', department: 'Conducere' }, { ...base, id: 'teo', name: 'Teo Demo', department: 'Tehnic' }],
    total: 2, departments: ['Conducere', 'Tehnic'], delegations: [], leaves: [],
    current_user_id: 'ana', can_manage_accounts: false, can_manage_delegations: false, reference_date: '2026-10-31',
  });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = previousFetch; dom.window.close(); });
  await act(async () => root.render(createElement(PeoplePage, { revision: 0, notify: () => {} })));
  const trigger = document.querySelector('[role="combobox"][aria-label="Departament echipă"]');
  assert.ok(trigger, 'Department filter should expose an accessible custom dropdown');
  await act(async () => trigger.focus());
  return trigger;
}
async function click(element) { assert.ok(element); await act(async () => element.click()); }
async function key(element, value) {
  await act(async () => element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true })));
}
const names = () => [...document.querySelectorAll('.person-card h2')].map(element => element.textContent);

test('department menu filters colleagues and can restore all departments', async t => {
  const trigger = await setup(t);
  await click(trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  await click([...document.querySelectorAll('[role="option"]')].find(element => element.textContent === 'Tehnic'));
  assert.deepEqual(names(), ['Teo Demo']);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, trigger);
  await click(trigger);
  assert.equal(document.querySelector('[role="option"][aria-selected="true"]').textContent, 'Tehnic');
  await click(document.querySelector('[role="option"]'));
  assert.deepEqual(names(), ['Ana Demo', 'Teo Demo']);
});

test('keyboard navigation selects a department and Escape cancels a pending choice', async t => {
  const trigger = await setup(t);
  await key(trigger, 'ArrowDown');
  await key(trigger, 'End');
  await key(trigger, 'Enter');
  assert.deepEqual(names(), ['Teo Demo']);
  await key(trigger, 'ArrowUp');
  await key(trigger, 'Home');
  await key(trigger, 'Escape');
  assert.deepEqual(names(), ['Teo Demo']);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  await key(trigger, 'ArrowDown');
  await key(trigger, 'c');
  await key(trigger, 'Enter');
  assert.deepEqual(names(), ['Ana Demo']);
});

test('outside pointer and focus changes dismiss the menu without changing the filter', async t => {
  const trigger = await setup(t);
  await click(trigger);
  await act(async () => document.getElementById('outside').dispatchEvent(new window.Event('pointerdown', { bubbles: true })));
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  await click(trigger);
  await act(async () => document.getElementById('outside').focus());
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(names(), ['Ana Demo', 'Teo Demo']);
});
