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
  kind: 'flow' | 'related' | 'reference' | 'correction';
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
  const references = (node: FlowGraphNode, id: string) => Array.isArray(node.document.metadata.flow_links)
    && node.document.metadata.flow_links.some((link: unknown) => link && typeof link === 'object'
      && 'source_id' in link && link.source_id === id);
  return first.document.related_ids.includes(second.id)
    || second.document.related_ids.includes(first.id) || references(first, second.id) || references(second, first.id);
}

function makeEdge(source: FlowGraphNode, target: FlowGraphNode, kind: FlowGraphEdge['kind']): FlowGraphEdge {
  return {
    id: `${source.id}->${target.id}`,
    source: source.id,
    target: target.id,
    kind,
    ...(kind === 'related' ? { label: 'Act adițional' } : {}),
    ...(kind === 'reference' ? { label: 'Contract de referință' } : {}),
  };
}

function purchasingPredecessors(target: FlowGraphNode, candidates: FlowGraphNode[]) {
  const type = normalize(target.document.flow.document_type);
  let available = candidates;
  if (type.includes('iesire') || type.includes('outbound')) {
    const returns = candidates.filter((node) => purchasingRank(node) === 4);
    available = returns.length ? returns : candidates.filter((node) => purchasingRank(node) < 4);
  } else if (type.includes('intrare') || type.includes('inbound')) {
    const replacements = candidates.filter((node) => purchasingRank(node) === 5);
    available = replacements.length ? replacements : candidates.filter((node) => purchasingRank(node) < 4);
  }
  const nearestRank = Math.max(-1, ...available.map(purchasingRank));
  return available.filter((node) => purchasingRank(node) === nearestRank).sort(compareNodes);
}

function layoutGroup(id: string, label: string, caseId: string | null, nodes: FlowGraphNode[]): FlowGraphGroup {
  const ordered = [...nodes].sort(compareNodes);
  const edges: FlowGraphEdge[] = [];
  const explicit = new Set<string>();
  const visible = new Set(nodes.map((node) => node.id));
  for (const node of ordered) {
    const links = node.document.metadata.flow_links;
    if (!Array.isArray(links)) continue;
    // An explicit empty list is a root, including when all its inputs are filtered out.
    explicit.add(node.id);
    for (const link of links) {
      if (!link || typeof link !== 'object' || !visible.has(link.source_id) || link.source_id === node.id
        || !['flow', 'related', 'reference', 'correction'].includes(link.kind)) continue;
      const id = `${link.source_id}->${node.id}`;
      if (edges.some((edge) => edge.id === id)) continue;
      edges.push({id, source: link.source_id, target: node.id, kind: link.kind,
        ...(typeof link.label === 'string' && link.label ? {label: link.label} : {})});
    }
  }
  const purchases = ordered.filter((node) => node.stage === 'purchasing');
  const mainPurchases = purchases.filter((node) => !isAmendment(node));
  mainPurchases.forEach((node, index) => {
    node.row = index;
    if (explicit.has(node.id)) return;
    const predecessors = mainPurchases.filter((candidate) => purchasingRank(candidate) < purchasingRank(node)
      && linked(candidate, node));
    for (const predecessor of purchasingPredecessors(node, predecessors)) {
      edges.push(makeEdge(predecessor, node, 'flow'));
    }
  });

  purchases.filter(isAmendment).forEach((node, index) => {
    node.row = mainPurchases.length + index;
    if (explicit.has(node.id)) return;
    const contractId = node.document.metadata.contract_id;
    const contracts = mainPurchases.filter((candidate) => purchasingRank(candidate) === 2
      && (linked(candidate, node) || candidate.id === contractId));
    const contract = contracts.find((candidate) => candidate.id === contractId) || contracts[0];
    if (contract) edges.push(makeEdge(contract, node, 'related'));
  });

  for (let stageIndex = 1; stageIndex < stageOrder.length; stageIndex += 1) {
    const stageNodes = ordered.filter((node) => node.stageIndex === stageIndex);
    for (const node of stageNodes) {
      if (explicit.has(node.id)) continue;
      const previous = ordered.filter((candidate) => candidate.stageIndex < stageIndex
        && !isAmendment(candidate) && linked(candidate, node));
      const nearestStage = Math.max(-1, ...previous.map((candidate) => candidate.stageIndex));
      const candidates = previous.filter((candidate) => candidate.stageIndex === nearestStage);
      const predecessors = nearestStage === 0 ? purchasingPredecessors(node, candidates) : candidates;
      // Keep every linked input: split deliveries and consolidated invoices are not single chains.
      for (const predecessor of predecessors) edges.push(makeEdge(predecessor, node, 'flow'));
      if (node.stage === 'invoice_verification' && nearestStage > 0) {
        const contract = purchases.find((candidate) => purchasingRank(candidate) === 2
          && candidate.id === node.document.metadata.contract_id);
        if (contract) edges.push(makeEdge(contract, node, 'reference'));
      }
    }
    // Order by the average position of linked inputs, then pack without inheriting empty rows.
    const inputPosition = (node: FlowGraphNode) => {
      const inputs = edges.filter((edge) => edge.target === node.id && edge.kind === 'flow')
        .map((edge) => ordered.find((candidate) => candidate.id === edge.source)!.row);
      return inputs.length ? inputs.reduce((sum, row) => sum + row, 0) / inputs.length : Number.MAX_SAFE_INTEGER;
    };
    stageNodes.sort((first, second) => inputPosition(first) - inputPosition(second)
      || compareNodes(first, second)).forEach((node, index) => { node.row = index; });
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
