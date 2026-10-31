import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'localStorage', {value: {getItem: () => null}});

// Use the existing TSX compiler and React renderer; no browser/test framework dependency.
async function component(name, exportedName) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/features/suppliers/${name}.tsx`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    jsx: 'automatic', loader: { '.css': 'empty' },
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports);
  return module.exports[exportedName];
}

const SupplierContent = await component('SupplierContent', 'SupplierContent');
const ReviewDetail = await component('index', 'ReviewDetail');
const SupplierBankHistory = await component('SupplierBankHistory', 'SupplierBankHistory');
const noop = () => {};

test('failed filter request leaves editable date controls mounted', () => {
  const html = renderToStaticMarkup(createElement(SupplierContent, { error: 'Invalid date range', loading: false },
    createElement('label', null, 'De la', createElement('input', { type: 'date', defaultValue: '2026-11-02' }))));
  assert.match(html, /role="alert"/);
  assert.match(html, /type="date"/);
  assert.match(html, /2026-11-02/);
});

test('failed profile update leaves the form and entered values mounted', () => {
  const html = renderToStaticMarkup(createElement(SupplierContent, { error: 'Revision changed', loading: false },
    createElement('form', null, createElement('input', { defaultValue: 'Corrected supplier address' }),
      createElement('button', null, 'Salvează fișa'))));
  assert.match(html, /<form/);
  assert.match(html, /Corrected supplier address/);
  assert.match(html, /Revision changed/);
});

const review = {
  id: 'current', supplier_name: 'Demo SRL', status: 'clear', created_at: '2026-10-31',
  expected_iban: '', observed_iban: '', sender_email: 'demo@example.test', verified_contact: '',
  reasons: [], freshness: {state: 'current', reasons: []}, assignment_state: 'unassigned',
  assignment_revision: 1, assignment_history: [], previous_review_id: 'original',
  rechecks: [{id: 'followup', status: 'needs_review', created_at: '2026-11-01'}],
};

test('review details expose accessible predecessor and reevaluation navigation', () => {
  const html = renderToStaticMarkup(createElement(ReviewDetail, {
    review, user: {id: 'admin', name: 'Demo'}, onClose: noop, onOpen: noop,
    onChanged: noop, onRecheck: noop, onReview: noop,
  }));
  assert.match(html, /Verificarea precedentă/);
  assert.match(html, /original/);
  assert.match(html, /followup/);
});

test('bank history exposes the independently approved registration origin', () => {
  const html = renderToStaticMarkup(createElement(SupplierBankHistory, {
    history: [{iban: 'RO DEMO', version: 1, created_at: '2026-10-31', source_registration_id: 'registration-origin'}],
    onReview: noop, onRegistration: noop,
  }));
  assert.match(html, /Deschide dosarul de înregistrare/);
});
