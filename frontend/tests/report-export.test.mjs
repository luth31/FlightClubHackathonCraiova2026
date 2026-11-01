import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvCell, reportCsv, searchText} from '../src/features/reports/export.ts';
import {normalizeReport} from '../src/features/reports/normalize.ts';

test('CSV neutralizes formulas including leading whitespace, and escapes quoted multiline fields', () => {
  for (const input of ['=SUM(A1)', '  =1+1', '\t+1', '\r\n@cmd', '-10', '\uFEFF=1']) assert.ok(csvCell(input).startsWith('"\''), input);
  assert.equal(csvCell('Contract "A"\nB'), '"Contract ""A""\nB"');
  assert.equal(csvCell(null), '""');
});

test('CSV exports exactly the supplied selection with currencies and document provenance', () => {
  const csv = reportCsv([{id:'one',number:'C-1',title:'Mentenanță',department:'Tehnic',status:'approved',owner:'Ana',value:42,currency:'EUR',document_id:'doc-1'}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.includes('"42","EUR"'));
  assert.ok(csv.endsWith('"doc-1"'));
  assert.equal(reportCsv([]).split('\r\n').length, 1);
});

test('Romanian searches work with or without accents and capitalization', () => {
  assert.equal(searchText('  Achiziții ȘI MENTENANȚĂ '), 'achizitii si mentenanta');
  assert.ok(searchText('Sănătatea documentelor').includes(searchText('sanatatea')));
});

test('legacy Romanian titles are readable without changing source identity or stored input', () => {
  const row = {id:'source-1',document_id:'doc-1',title:'FacturÄƒ',owner:'Ana',department:'Tehnic',status:'approved'};
  const source = {rows:[row],secondary:[],recent_activity:[]};
  const result = normalizeReport(source);
  assert.equal(result.rows[0].title, 'Factură');
  assert.equal(result.rows[0].document_id, 'doc-1');
  assert.equal(row.title, 'FacturÄƒ');
});
