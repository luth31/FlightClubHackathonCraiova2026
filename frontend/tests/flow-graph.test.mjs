import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { buildFlowGraphs } from '../src/features/documents/flow-graph.ts';

const stageIds = ['purchasing', 'shipping', 'inventory_management', 'invoice_verification'];

function document(id, stage, type, relatedIds = [], caseId = 'CASE-1', metadata = {}) {
  return {
    id, title: `${type} ${id}`, number: id.toUpperCase(), category: type,
    department: 'Tehnic', status: 'approved', created_at: '2026-10-01',
    filename: `${id}.pdf`, file_url: `/api/documents/${id}/file`, tags: [],
    version: 1, validated: true, related_ids: relatedIds, metadata,
    flow_case_id: caseId,
    flow: { stage, document_type: type, reason: 'Document type', source: 'category' },
  };
}

function stages(documents) {
  return stageIds.map((id) => ({ id, label: id, description: id,
    items: documents.filter((item) => item.flow.stage === id),
    count: documents.filter((item) => item.flow.stage === id).length }));
}

function paths(group) {
  return group.edges.map((edge) => `${edge.source}->${edge.target}:${edge.kind}`);
}

test('dense associations retain the procurement flow and amendment without empty leading rows', () => {
  const records = [
    document('need', 'purchasing', 'Referat de necesitate'),
    document('spec', 'purchasing', 'Caiet de sarcini'),
    document('contract', 'purchasing', 'Contract'),
    document('amendment', 'purchasing', 'Act adițional', [], 'CASE-1', { contract_id: 'contract' }),
    document('delivery', 'shipping', 'Raport de prestare'),
    document('receipt', 'inventory_management', 'Proces-verbal de recepție'),
    document('invoice', 'invoice_verification', 'Factură', [], 'CASE-1', { contract_id: 'contract' }),
  ];
  for (const item of records) item.related_ids = records.filter((other) => other !== item).map((other) => other.id);
  const input = stages(records);
  const original = JSON.stringify(input);
  const [group] = buildFlowGraphs(input);
  assert.deepEqual(paths(group), [
    'need->spec:flow', 'spec->contract:flow', 'contract->amendment:related',
    'contract->delivery:flow', 'delivery->receipt:flow', 'receipt->invoice:flow', 'contract->invoice:reference',
  ]);
  const rows = Object.fromEntries(group.nodes.map((node) => [node.id, node.row]));
  assert.deepEqual(rows, { need: 0, spec: 1, contract: 2, amendment: 3, delivery: 0, receipt: 0, invoice: 0 });
  assert.equal(group.rowCount, 4);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(buildFlowGraphs([...input].reverse().map((stage) => ({ ...stage, items: [...stage.items].reverse() }))), [group]);
});

test('different cases and hidden relation IDs never connect', () => {
  const groups = buildFlowGraphs(stages([
    document('contract', 'purchasing', 'Contract', ['invoice', 'hidden']),
    document('invoice', 'invoice_verification', 'Factură', ['contract'], 'CASE-2'),
  ]));
  assert.equal(groups.length, 2);
  assert.equal(groups.flatMap((group) => group.edges).length, 0);
  assert.deepEqual(groups.flatMap((group) => group.nodes.map((node) => node.id)), ['contract', 'invoice']);
});

test('case metadata alone does not fabricate a flow dependency', () => {
  const [group] = buildFlowGraphs(stages([
    document('contract', 'purchasing', 'Contract'),
    document('invoice', 'invoice_verification', 'Factură'),
  ]));
  assert.equal(group.nodes.length, 2);
  assert.deepEqual(group.edges, []);
});

test('unassigned documents form visible relation components and standalone groups', () => {
  const groups = buildFlowGraphs(stages([
    document('delivery', 'shipping', 'Livrare de intrare', ['receipt', 'hidden'], null),
    document('receipt', 'inventory_management', 'Document de material', [], null),
    document('invoice', 'invoice_verification', 'Factură', [], null),
  ]));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].nodes.map((node) => node.id), ['delivery', 'receipt']);
  assert.deepEqual(paths(groups[0]), ['delivery->receipt:flow']);
  assert.deepEqual(groups[1].nodes.map((node) => node.id), ['invoice']);
  assert.deepEqual(groups[1].edges, []);
});

test('a visible direct dependency skips filtered stages and keeps its flow kind', () => {
  const [group] = buildFlowGraphs(stages([
    document('contract', 'purchasing', 'Contract', ['invoice', 'hidden-delivery']),
    document('invoice', 'invoice_verification', 'Factură'),
  ]));
  assert.deepEqual(paths(group), ['contract->invoice:flow']);
  assert.deepEqual(group.nodes.map((node) => node.stageIndex), [0, 3]);
  assert.equal(group.nodes[0].row, group.nodes[1].row);
});

test('service delivery is not routed through an amendment when its contract is absent', () => {
  const [group] = buildFlowGraphs(stages([
    document('amendment', 'purchasing', 'Act adițional', ['delivery'], 'CASE-1', { contract_id: 'hidden-contract' }),
    document('delivery', 'shipping', 'Raport de prestare', ['amendment']),
  ]));
  assert.deepEqual(group.edges, []);
});

test('return and replacement orders feed their corresponding delivery directions', () => {
  const records = [
    document('order', 'purchasing', 'Comandă de achiziție'),
    document('return', 'purchasing', 'Comandă de retur'),
    document('replace', 'purchasing', 'Comandă de înlocuire'),
    document('outbound', 'shipping', 'Livrare de ieșire'),
    document('inbound', 'shipping', 'Livrare de intrare'),
  ];
  for (const item of records) item.related_ids = records.filter((other) => other !== item).map((other) => other.id);
  const [group] = buildFlowGraphs(stages(records));
  assert.ok(paths(group).includes('return->outbound:flow'));
  assert.ok(paths(group).includes('replace->inbound:flow'));
  assert.ok(paths(group).includes('order->return:flow'));
  assert.ok(paths(group).includes('return->replace:flow'));
  const rows = Object.fromEntries(group.nodes.map((node) => [node.id, node.row]));
  assert.equal(rows.outbound, 0);
  assert.equal(rows.inbound, 1);
});

test('multiple documents in one stage never occupy the same grid cell', () => {
  const records = [
    document('contract', 'purchasing', 'Contract', ['delivery-a', 'delivery-b']),
    document('delivery-a', 'shipping', 'Raport de prestare', ['receipt-a']),
    document('delivery-b', 'shipping', 'Raport de prestare', ['receipt-b']),
    document('receipt-a', 'inventory_management', 'Document de material'),
    document('receipt-b', 'inventory_management', 'Document de material'),
  ];
  const [group] = buildFlowGraphs(stages(records));
  const cells = group.nodes.map((node) => `${node.stageIndex}:${node.row}`);
  assert.equal(new Set(cells).size, cells.length);
  assert.ok(paths(group).includes('delivery-a->receipt-a:flow'));
  assert.ok(paths(group).includes('delivery-b->receipt-b:flow'));
});

test('an empty result produces no graphs', () => {
  assert.deepEqual(buildFlowGraphs(stages([])), []);
});

test('split deliveries and a consolidated invoice retain every linked input with compact columns', () => {
  const records = [
    document('need', 'purchasing', 'Referat de necesitate', ['spec']),
    document('spec', 'purchasing', 'Caiet de sarcini', ['contract']),
    document('contract', 'purchasing', 'Contract', ['delivery-a', 'delivery-b']),
    document('delivery-a', 'shipping', 'Livrare de intrare', ['receipt-a']),
    document('delivery-b', 'shipping', 'Livrare de intrare', ['receipt-b']),
    document('receipt-a', 'inventory_management', 'Proces-verbal de recepție', ['invoice']),
    document('receipt-b', 'inventory_management', 'Proces-verbal de recepție', ['invoice']),
    document('invoice', 'invoice_verification', 'Factură', [], 'CASE-1', { contract_id: 'contract' }),
  ];
  const [group] = buildFlowGraphs(stages(records));
  assert.deepEqual(paths(group), [
    'need->spec:flow', 'spec->contract:flow', 'contract->delivery-a:flow', 'contract->delivery-b:flow',
    'delivery-a->receipt-a:flow', 'delivery-b->receipt-b:flow',
    'receipt-a->invoice:flow', 'receipt-b->invoice:flow', 'contract->invoice:reference',
  ]);
  assert.equal(group.rowCount, 3);
  for (const stage of stageIds) {
    const rows = group.nodes.filter((node) => node.stage === stage).map((node) => node.row).sort();
    assert.deepEqual(rows, rows.map((_, index) => index), 'No empty cells before or between documents');
  }
  assert.deepEqual(buildFlowGraphs(stages([...records].reverse())), [group]);
});

test('multiple requisitions can feed a shared specification', () => {
  const [group] = buildFlowGraphs(stages([
    document('need-a', 'purchasing', 'Referat de necesitate', ['spec']),
    document('need-b', 'purchasing', 'Referat de necesitate', ['spec']),
    document('spec', 'purchasing', 'Caiet de sarcini'),
  ]));
  assert.deepEqual(paths(group), ['need-a->spec:flow', 'need-b->spec:flow']);
});

test('invoice references never expose hidden contracts or connect different cases', () => {
  const groups = buildFlowGraphs(stages([
    document('contract', 'purchasing', 'Contract', [], 'CASE-2'),
    document('receipt', 'inventory_management', 'Proces-verbal de recepție', ['invoice', 'invoice-2']),
    document('invoice', 'invoice_verification', 'Factură', [], 'CASE-1', { contract_id: 'contract' }),
    document('invoice-2', 'invoice_verification', 'Factură', [], 'CASE-1', { contract_id: 'hidden' }),
  ]));
  assert.deepEqual(groups.flatMap(paths), ['receipt->invoice:flow', 'receipt->invoice-2:flow']);
});

test('explicit relationships support return loops and invoice corrections without inferred shortcuts', () => {
  const records = [
    document('contract', 'purchasing', 'Contract', ['delivery', 'receipt', 'return'], 'CASE-1', {flow_links: []}),
    document('return', 'purchasing', 'Comandă de retur', [], 'CASE-1', {flow_links: [{source_id: 'receipt', kind: 'correction', label: 'Retur'}]}),
    document('delivery', 'shipping', 'Livrare de intrare', ['return'], 'CASE-1', {flow_links: [{source_id: 'contract', kind: 'flow'}]}),
    document('receipt', 'inventory_management', 'Proces-verbal de recepție', [], 'CASE-1', {flow_links: [{source_id: 'delivery', kind: 'flow'}]}),
    document('invoice', 'invoice_verification', 'Factură', [], 'CASE-1', {flow_links: [{source_id: 'receipt', kind: 'flow'}]}),
    document('credit', 'invoice_verification', 'Notă de credit', [], 'CASE-1', {flow_links: [{source_id: 'invoice', kind: 'correction'}]}),
  ];
  const [group] = buildFlowGraphs(stages(records));
  assert.deepEqual(new Set(paths(group)), new Set(['receipt->return:correction', 'contract->delivery:flow', 'delivery->receipt:flow', 'receipt->invoice:flow', 'invoice->credit:correction']));
  assert.deepEqual(buildFlowGraphs(stages([...records].reverse())), [group]);
});

test('hidden, invalid and cross-case explicit inputs cannot be replaced with invented edges', () => {
  const [group] = buildFlowGraphs(stages([
    document('receipt', 'inventory_management', 'Proces-verbal de recepție', ['invoice']),
    document('invoice', 'invoice_verification', 'Factură', [], 'CASE-1', {flow_links: [
      {source_id: 'hidden', kind: 'flow'}, {source_id: 'invoice', kind: 'flow'}, null,
      {source_id: 'receipt', kind: 'invalid'}, {source_id: 'other-contract', kind: 'reference'},
    ]}),
    document('other-contract', 'purchasing', 'Contract', [], 'CASE-2'),
  ]));
  assert.deepEqual(group.edges, []);
});

test('the shipped demo dossiers render their exact split, return, consolidation and advance relationships', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../data/procurement-scenarios.json', import.meta.url), 'utf8'));
  const typeStage = type => type.includes('Livrare') || type.includes('Raport') ? 'shipping'
    : type.includes('recepție') ? 'inventory_management' : ['Factură', 'Notă de credit'].includes(type) ? 'invoice_verification' : 'purchasing';
  const input = fixture.documents.map(item => ({...item, flow_case_id: item.metadata.case_id,
    flow: {stage: typeStage(item.category), document_type: item.category}}));
  const groups = buildFlowGraphs(stages(input));
  assert.equal(groups.length, 3);
  for (const group of groups) {
    const expected = group.nodes.flatMap(({document}) => document.metadata.flow_links.map(link => `${link.source_id}->${document.id}:${link.kind}`));
    assert.deepEqual(new Set(paths(group)), new Set(expected));
  }
  assert.ok(paths(groups[0]).includes('flow-01-receipt-b->flow-01-return-order:correction'));
  assert.equal(groups[1].edges.filter(edge => edge.target === 'flow-02-receipt').length, 2);
  assert.ok(paths(groups[2]).includes('flow-03-advance->flow-03-balance:reference'));
});
