import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';

function install(window) {
  for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement', 'CustomEvent'])
    Object.defineProperty(globalThis, key, {value: key === 'window' ? window : window[key], configurable: true});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
}
const initial = new JSDOM('', {url: 'http://flyleaf.test/'});
install(initial.window);
const {createRoot} = await import('react-dom/client');
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/features/people/index.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', loader: {'.css': 'empty'},
});
const module = {exports: {}};
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const {PeoplePage} = module.exports;
initial.window.close();

test('directory avatars open a usable profile on hover, focus and click', async t => {
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', {url: 'http://flyleaf.test/'});
  install(dom.window);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    items: [{id: 'ana', name: 'Ana Ionescu', email: 'admin@craiova.example', department: 'Conducere',
      role: 'director', roles: ['director'], active: true, availability: 'away', job_title: 'Director aeroport',
      manager_name: 'Mara Demo'}],
    total: 1, departments: ['Conducere'], delegations: [], leaves: [], current_user_id: 'ana',
    can_manage_accounts: false, can_manage_delegations: false, reference_date: '2026-11-01',
  });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.window.close();});
  await act(async () => root.render(createElement(PeoplePage, {revision: 0, notify: () => {}})));
  const avatar = document.querySelector('.people-grid .person-avatar');
  assert.equal(avatar.tagName, 'BUTTON', 'The visible avatar must be interactive, not a text span.');
  assert.equal(avatar.getAttribute('aria-expanded'), 'false');

  await act(async () => {
    avatar.dispatchEvent(new window.MouseEvent('pointerover', {bubbles: true}));
    await new Promise(resolve => setTimeout(resolve, 220));
  });
  const panel = document.querySelector('[role="dialog"]');
  assert.ok(panel, 'Hovering the avatar should open its profile.');
  assert.match(panel.textContent, /În concediu/);
  assert.match(panel.textContent, /Director aeroport/);
  assert.match(panel.textContent, /Mara Demo/);
  assert.equal(panel.querySelector('a').getAttribute('href'), 'mailto:admin@craiova.example');

  await act(async () => {
    avatar.dispatchEvent(new window.MouseEvent('pointerout', {bubbles: true, relatedTarget: panel}));
    panel.dispatchEvent(new window.MouseEvent('pointerover', {bubbles: true, relatedTarget: avatar}));
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  assert.ok(document.querySelector('[role="dialog"]'), 'The profile stays open when moving into it.');
  await act(async () => document.getElementById('outside').dispatchEvent(new window.Event('pointerdown', {bubbles: true})));
  assert.equal(document.querySelector('[role="dialog"]'), null);

  await act(async () => avatar.focus());
  assert.equal(avatar.getAttribute('aria-expanded'), 'true');
  await act(async () => avatar.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Tab', bubbles: true})));
  assert.equal(document.activeElement.className, 'person-profile-close');
  await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, avatar);

  await act(async () => avatar.click());
  assert.equal(avatar.getAttribute('aria-expanded'), 'true');
  await act(async () => document.querySelector('.person-profile-close').click());
  assert.equal(avatar.getAttribute('aria-expanded'), 'false');
});
