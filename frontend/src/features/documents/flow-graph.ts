import type {
  DocumentFlowData,
  DocumentFlowStageId,
  FlowDocument,
} from '@/types';

export interface FlowGraphNode {
  id: string;
  document: FlowDocument;
  stage: DocumentFlowStageId;
  stageIndex: number;
  row: number;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'flow' | 'related';
  label?: string;
}

export interface FlowGraphGroup {
  id: string;
  label: string;
  caseId: string | null;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  rowCount: number;
}

const stageOrder: DocumentFlowStageId[] = [
  'purchasing',
  'shipping',
  'inventory_management',
  'invoice_verification',
];

function normalize(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function isAmendment(node: FlowGraphNode) {
  const type = normalize(node.document.flow.document_type);
  return type.startsWith('act aditional') || type.startsWith('contract amendment');
}

function purchasingRank(node: FlowGraphNode) {
  const type = normalize(node.document.flow.document_type);
  if (type.startsWith('referat') || type.includes('requisition')) return 0;
  if (type.startsWith('caiet') || type.includes('specification')) return 1;
  if (isAmendment(node)) return 6;
  if (type.startsWith('contract')) return 2;
  if (type.includes('retur') || type.includes('return')) return 4;
  if (type.includes('inlocuire') || type.includes('replacement')) return 5;
  return 3;
}

function compareText(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareNodes(first: FlowGraphNode, second: FlowGraphNode) {
  const stage = first.stageIndex - second.stageIndex;
  if (stage) return stage;
  if (first.stage === 'purchasing') {
    const rank = purchasingRank(first) - purchasingRank(second);
    if (rank) return rank;
  }
  return compareText(first.document.number, second.document.number)
    || compareText(first.id, second.id);
}

function linked(first: FlowGraphNode, second: FlowGraphNode) {
  return first.document.related_ids.includes(second.id)
    || second.document.related_ids.includes(first.id);
}

function makeEdge(source: FlowGraphNode, target: FlowGraphNode, kind: FlowGraphEdge['kind']): FlowGraphEdge {
  return {
    id: `${source.id}->${target.id}`,
    source: source.id,
    target: target.id,
    kind,
    ...(kind === 'related' ? { label: 'Act adițional' } : {}),
  };
}

function choosePurchasingPredecessor(target: FlowGraphNode, candidates: FlowGraphNode[]) {
  const type = normalize(target.document.flow.document_type);
  let available = candidates;
  if (type.includes('iesire') || type.includes('outbound')) {
    const returns = candidates.filter((node) => purchasingRank(node) === 4);
    available = returns.length ? returns : candidates.filter((node) => purchasingRank(node) < 4);
  } else if (type.includes('intrare') || type.includes('inbound')) {
    const replacements = candidates.filter((node) => purchasingRank(node) === 5);
    available = replacements.length ? replacements : candidates.filter((node) => purchasingRank(node) < 4);
  }
  return [...available].sort((first, second) => purchasingRank(second) - purchasingRank(first)
    || compareNodes(first, second))[0];
}

function layoutGroup(id: string, label: string, caseId: string | null, nodes: FlowGraphNode[]): FlowGraphGroup {
  const ordered = [...nodes].sort(compareNodes);
  const edges: FlowGraphEdge[] = [];
  const purchases = ordered.filter((node) => node.stage === 'purchasing');
  const mainPurchases = purchases.filter((node) => !isAmendment(node));
  mainPurchases.forEach((node, index) => {
    node.row = index;
    const predecessors = mainPurchases.filter((candidate) => purchasingRank(candidate) < purchasingRank(node)
      && linked(candidate, node));
    const predecessor = choosePurchasingPredecessor(node, predecessors);
    if (predecessor) edges.push(makeEdge(predecessor, node, 'flow'));
  });

  purchases.filter(isAmendment).forEach((node, index) => {
    node.row = mainPurchases.length + index;
    const contractId = node.document.metadata.contract_id;
    const contracts = mainPurchases.filter((candidate) => purchasingRank(candidate) === 2
      && (linked(candidate, node) || candidate.id === contractId));
    const contract = contracts.find((candidate) => candidate.id === contractId) || contracts[0];
    if (contract) edges.push(makeEdge(contract, node, 'related'));
  });

  for (let stageIndex = 1; stageIndex < stageOrder.length; stageIndex += 1) {
    const stageNodes = ordered.filter((node) => node.stageIndex === stageIndex);
    const occupied = new Set<number>();
    stageNodes.forEach((node, index) => {
      const previous = ordered.filter((candidate) => candidate.stageIndex < stageIndex
        && !isAmendment(candidate) && linked(candidate, node));
      const nearestStage = Math.max(-1, ...previous.map((candidate) => candidate.stageIndex));
      const candidates = previous.filter((candidate) => candidate.stageIndex === nearestStage);
      const predecessor = nearestStage === 0
        ? choosePurchasingPredecessor(node, candidates)
        : [...candidates].sort((first, second) => first.row - second.row
          || compareNodes(first, second))[Math.min(index, candidates.length - 1)];
      if (predecessor) edges.push(makeEdge(predecessor, node, 'flow'));
      let row = predecessor?.row ?? index;
      while (occupied.has(row)) row += 1;
      occupied.add(row);
      node.row = row;
    });
  }

  return { id, label, caseId, nodes: ordered, edges,
    rowCount: Math.max(1, ...ordered.map((node) => node.row + 1)) };
}

export function buildFlowGraphs(stages: DocumentFlowData['stages']): FlowGraphGroup[] {
  const nodes = new Map<string, FlowGraphNode>();
  for (const stage of [...stages].sort((first, second) => stageOrder.indexOf(first.id) - stageOrder.indexOf(second.id))) {
    for (const document of stage.items) {
      if (!nodes.has(document.id)) {
        nodes.set(document.id, { id: document.id, document, stage: stage.id,
          stageIndex: stageOrder.indexOf(stage.id), row: 0 });
      }
    }
  }

  const cases = new Map<string, FlowGraphNode[]>();
  const unassigned: FlowGraphNode[] = [];
  for (const node of nodes.values()) {
    const caseId = node.document.flow_case_id;
    if (caseId) {
      const members = cases.get(caseId) ?? [];
      members.push(node);
      cases.set(caseId, members);
    } else {
      unassigned.push(node);
    }
  }

  const groups = [...cases.entries()].sort(([first], [second]) => compareText(first, second))
    .map(([caseId, members]) => layoutGroup(`case:${caseId}`, caseId, caseId, members));
  const remaining = new Set([...unassigned].sort(compareNodes));
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const component = [first];
    for (let index = 0; index < component.length; index += 1) {
      for (const candidate of remaining) {
        if (linked(component[index], candidate)) {
          remaining.delete(candidate);
          component.push(candidate);
        }
      }
    }
    groups.push(layoutGroup(`unassigned:${first.id}`,
      component.length === 1 ? `Fără dosar · ${first.document.number}` : 'Documente asociate fără dosar',
      null, component));
  }
  return groups;
}
