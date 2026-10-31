import assert from 'node:assert/strict';
import test from 'node:test';
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

test('dense procurement relations produce a clear chain with an amendment branch', () => {
  const records = [
    document('need', 'purchasing', 'Referat de necesitate'),
    document('spec', 'purchasing', 'Caiet de sarcini'),
    document('contract', 'purchasing', 'Contract'),
    document('amendment', 'purchasing', 'Act adițional', [], 'CASE-1', { contract_id: 'contract' }),
    document('delivery', 'shipping', 'Raport de prestare'),
    document('receipt', 'inventory_management', 'Proces-verbal de recepție'),
    document('invoice', 'invoice_verification', 'Factură'),
  ];
  for (const item of records) item.related_ids = records.filter((other) => other !== item).map((other) => other.id);
  const input = stages(records);
  const original = JSON.stringify(input);
  const [group] = buildFlowGraphs(input);
  assert.deepEqual(paths(group), [
    'need->spec:flow', 'spec->contract:flow', 'contract->amendment:related',
    'contract->delivery:flow', 'delivery->receipt:flow', 'receipt->invoice:flow',
  ]);
  const rows = Object.fromEntries(group.nodes.map((node) => [node.id, node.row]));
  assert.deepEqual(rows, { need: 0, spec: 1, contract: 2, amendment: 3, delivery: 2, receipt: 2, invoice: 2 });
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
  assert.equal(rows.outbound, rows.return);
  assert.equal(rows.inbound, rows.replace);
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
