import {t,useLanguage} from '@/i18n';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, CircleCheck, CircleDashed,
  CircleX, Clock3, FolderOpen, PackageCheck, ReceiptText, ShoppingCart, Truck } from 'lucide-react';
import { statusLabel } from '@/utils/format';
import { buildFlowGraphs } from './flow-graph';
import { readableFlowLabel } from './flow-label';
import type { FlowGraphEdge, FlowGraphGroup, FlowGraphNode } from './flow-graph';
import type { DocumentFlowData, DocumentFlowStageId } from '@/types';
import './document-flow.css';

const stages = [
  { id: 'purchasing', label: 'Achiziții', Icon: ShoppingCart },
  { id: 'shipping', label: 'Livrare', Icon: Truck },
  { id: 'inventory_management', label: 'Recepție', Icon: PackageCheck },
  { id: 'invoice_verification', label: 'Facturare', Icon: ReceiptText },
] satisfies { id: DocumentFlowStageId; label: string; Icon: typeof ShoppingCart }[];

// Shared with the grid through CSS variables so arrows always meet the card edges.
const STAGE_GAP = 32;
const CARD_HEIGHT = 112;
const SUPPORT_HEIGHT = 68;
const ROW_GAP = 20;
const CANVAS_PADDING = 40;
const CARD_INSET = 10;
const geometry = {
  '--flow-gap': `${STAGE_GAP}px`, '--flow-card-height': `${CARD_HEIGHT}px`,
  '--flow-row-gap': `${ROW_GAP}px`, '--flow-padding': `${CANVAS_PADDING}px`,
  '--flow-inset': `${CARD_INSET}px`,
} as CSSProperties;

function FlowLegendArrow({ kind = 'flow' }: { kind?: 'flow' | 'reference' | 'correction' | 'association' }) {
  useLanguage();
  return <svg className={`flow-legend-arrow flow-legend-arrow-${kind}`} viewBox="0 0 32 20"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M 3 10 H 28" strokeDasharray={kind === 'association' ? '2 4' : kind === 'reference' ? '4 4' : kind === 'correction' ? '6 3' : undefined} />
    <path d="m 23 5 5 5 -5 5" />
  </svg>;
}

function statusAppearance(status: string) {
  if (['approved', 'signed', 'active', 'completed'].includes(status)) return { tone: 'positive', Icon: CircleCheck };
  if (['in_review', 'pending'].includes(status)) return { tone: 'waiting', Icon: Clock3 };
  if (['rejected', 'expired', 'revoked'].includes(status)) return { tone: 'negative', Icon: CircleX };
  return { tone: 'neutral', Icon: CircleDashed };
}

type PositionedNode = FlowGraphNode & { top: number; height: number; compact: boolean };

function positionNodes(nodes: FlowGraphNode[]): PositionedNode[] {
  const bottoms = [CANVAS_PADDING, CANVAS_PADDING, CANVAS_PADDING, CANVAS_PADDING];
  const primary = nodes.find((node) => node.document.flow.document_type === 'Contract') || nodes[0];
  const subject = readableFlowLabel(primary.document.title).replace(/^.+?\s[-–—]\s/, '');
  return [...nodes].sort((first, second) => first.stageIndex - second.stageIndex || first.row - second.row).map((node) => {
    const compact = !node.document.metadata.flow_caption
      && readableFlowLabel(node.document.title).replace(/^.+?\s[-–—]\s/, '') === subject;
    const height = compact ? SUPPORT_HEIGHT : CARD_HEIGHT;
    const top = bottoms[node.stageIndex];
    bottoms[node.stageIndex] += height + ROW_GAP;
    return { ...node, compact, height, top };
  });
}

function connectorPath(edge: FlowGraphEdge, nodes: Map<string, PositionedNode>, width: number) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return '';
  const columnWidth = (width - STAGE_GAP * 3) / 4;
  const left = (node: FlowGraphNode) => node.stageIndex * (columnWidth + STAGE_GAP) + CARD_INSET;
  if (source.stageIndex === target.stageIndex) {
    const x = left(source) + (columnWidth - CARD_INSET * 2) / 2;
    const below = target.row > source.row;
    const sourceY = source.top + (below ? source.height : 0);
    const targetY = target.top + (below ? 0 : target.height);
    if (Math.abs(target.row - source.row) === 1) return `M ${x} ${sourceY} V ${targetY}`;
    const gutter = left(source) + columnWidth - CARD_INSET;
    const sourceExit = sourceY + (below ? ROW_GAP / 2 : -ROW_GAP / 2);
    const targetEntry = targetY + (below ? -ROW_GAP / 2 : ROW_GAP / 2);
    return `M ${x} ${sourceY} V ${sourceExit} H ${gutter} V ${targetEntry} H ${x} V ${targetY}`;
  }
  const backwards = target.stageIndex < source.stageIndex;
  const sourceX = left(source) + (backwards ? 0 : columnWidth - CARD_INSET * 2);
  const referenceOffset = edge.kind === 'reference' ? -14 : edge.kind === 'correction' ? 14 : 0;
  const sourceY = source.top + source.height / 2 + referenceOffset;
  const targetX = left(target) + (backwards ? columnWidth - CARD_INSET * 2 : 0);
  const targetY = target.top + target.height / 2 + referenceOffset;
  const direction = backwards ? -1 : 1;
  const laneOffset = edge.kind === 'reference' ? 12 : edge.kind === 'correction' ? -12 : (source.row % 3 - 1) * 6;
  const sourceGutter = sourceX + direction * (CARD_INSET + STAGE_GAP / 2) + laneOffset;
  if (target.stageIndex - source.stageIndex === 1) {
    return `M ${sourceX} ${sourceY} H ${sourceGutter} V ${targetY} H ${targetX}`;
  }
  const targetGutter = targetX - direction * (CARD_INSET + STAGE_GAP / 2) + laneOffset;
  const routeY = backwards ? 24 : 10 + (target.row % 3) * 5;
  return `M ${sourceX} ${sourceY} H ${sourceGutter} V ${routeY} H ${targetGutter} V ${targetY} H ${targetX}`;
}

function FlowCaseChart({ graph, onOpen }: { graph: FlowGraphGroup; onOpen: (id: string) => void }) {
  useLanguage();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(940);
  const [hovered, setHovered] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const active = hovered ?? focused;
  const arrowId = `flow-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const positioned = useMemo(() => positionNodes(graph.nodes), [graph.nodes]);
  const nodeMap = useMemo(() => new Map(positioned.map((node) => [node.id, node])), [positioned]);
  const related = new Set([active]);
  for (const edge of graph.edges) {
    if (edge.source === active) related.add(edge.target);
    if (edge.target === active) related.add(edge.source);
  }
  const height = Math.max(...positioned.map((node) => node.top + node.height)) + CANVAS_PADDING;
  const graphCaseId = graph.caseId || graph.id;
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => setWidth(body.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  return <div className={`flow-case-body${active ? ' flow-has-focus' : ''}`} ref={bodyRef}
    style={{ height }}>
    <svg className="flow-connectors" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><marker id={arrowId} markerWidth="12" markerHeight="12" viewBox="0 0 12 12" refX="10" refY="6" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 5 1 L 10 6 L 5 11" fill="none" stroke="context-stroke" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </marker></defs>
      {graph.edges.map((edge) => <path key={edge.id}
        className={`flow-connector flow-connector-${edge.kind}${edge.source === active || edge.target === active ? ' flow-connector-active' : ''}`}
        d={connectorPath(edge, nodeMap, width)} markerEnd={`url(#${arrowId})`}
        data-source-id={edge.source} data-target-id={edge.target} data-case-id={graphCaseId} />)}
      {graph.edges.filter((edge) => edge.kind === 'correction' && nodeMap.get(edge.source)!.stageIndex > nodeMap.get(edge.target)!.stageIndex)
        .map((edge) => <text className="flow-edge-label" key={`label-${edge.id}`} x={width / 3} y={18} textAnchor="middle">{edge.label || t("Retur")}</text>)}
    </svg>
    {positioned.map(({ document, stageIndex, top, height: cardHeight, compact }) => {
      const title = readableFlowLabel(document.title);
      const { tone, Icon } = statusAppearance(document.status);
      const inputs = graph.edges.filter((edge) => edge.target === document.id);
      const inputSummary = inputs.map((edge) => `${edge.label || 'Document legat'}: ${readableFlowLabel(nodeMap.get(edge.source)!.document.title)}`).join('\n');
      return <article key={document.id}
        className={`flow-document flow-tone-${tone}${compact ? ' flow-document-compact' : ''}${active && related.has(document.id) ? ' flow-document-related' : ''}`}
        style={{ gridColumn: `${stageIndex + 1} / ${stageIndex + 2}`, top, height: cardHeight }} data-node-id={document.id} data-case-id={graphCaseId}
        onMouseEnter={() => setHovered(document.id)} onMouseLeave={() => setHovered(undefined)}
        onFocus={() => setFocused(document.id)} onBlur={() => setFocused(undefined)}>
        <button className="flow-document-open" onClick={() => onOpen(document.id)}
          aria-label={t("Deschide {p0} · {p1}", {p0:title,p1:statusLabel[document.status] || document.status})}
          title={t("{p0}\n{p1}{p2}{p3}", {p0:title,p1:document.number,p2:document.supplier ? `\n${readableFlowLabel(document.supplier)}` : '',p3:inputSummary ? `\n${inputSummary}` : ''})}>
          <span className="flow-document-kind"><span>{document.flow.document_type}</span><ArrowUpRight size={14} /></span>
          {!compact && <strong>{typeof document.metadata.flow_caption === 'string' ? document.metadata.flow_caption : title.replace(/^.+?\s[-–—]\s/, '')}</strong>}
          <span className="flow-document-number">{document.number}</span>
          <span className="flow-document-footer">
            <span className="flow-document-status"><Icon size={14} />{statusLabel[document.status] || document.status}</span>
            {inputs.length > 1 && <span className="flow-input-count" aria-label={t("{p0} documente legate", {p0:inputs.length})} title={inputSummary}>
              <ArrowRight size={12} />{inputs.length}
            </span>}
          </span>
        </button>
      </article>;
    })}
    {graph.edges.length > 0 && <ul className="sr-only">{graph.edges.map((edge) => <li key={edge.id}>
      {readableFlowLabel(nodeMap.get(edge.source)!.document.title)} → {readableFlowLabel(nodeMap.get(edge.target)!.document.title)}
      {edge.label && t(" · {p0}", {p0:edge.label})}
    </li>)}</ul>}
  </div>;
}

function caseInfo(graph: FlowGraphGroup) {
  const primary = graph.nodes.find((node) => node.document.flow.document_type === 'Contract') || graph.nodes[0];
  const metadata = primary.document.metadata;
  return {
    name: typeof metadata.flow_case_name === 'string' ? metadata.flow_case_name : readableFlowLabel(primary.document.title).replace(/^.+?\s[-–—]\s/, ''),
    summary: typeof metadata.flow_case_summary === 'string' ? metadata.flow_case_summary : '',
    demo: metadata.flow_demo === true,
    attention: graph.nodes.filter(({document}) => ['rejected', 'in_review', 'pending', 'expired'].includes(document.status)).length,
  };
}

export function DocumentFlow({ data, caseId, onSelectCase, onOpen, onShowRegister }: {
  data: DocumentFlowData; caseId: string; onSelectCase: (id: string) => void;
  onOpen: (id: string) => void; onShowRegister: () => void;
}) {
  useLanguage();
  const graphs = useMemo(() => buildFlowGraphs(data.stages), [data.stages]);
  const [selected, setSelected] = useState('');
  const active = graphs.find((graph) => graph.id === selected) || graphs[0];
  const info = active ? caseInfo(active) : undefined;
  const headingId = useId();
  return <section className="document-flow" aria-label={t("Fluxul documentelor de achiziție")} style={geometry}>
    <div className="flow-toolbar">
      <div><h2>{t("Flux achiziții")}</h2><p role="status">{graphs.length} {t("dosare")}<span className="meta-dot">·</span> {data.classified_total} {t("documente")}</p></div>
      <label className="flow-case-filter"><FolderOpen size={16} />
        <select aria-label={t("Dosar de achiziție")} value={caseId} onChange={(event) => onSelectCase(event.target.value)}>
          <option value="">{t("Toate dosarele")}</option>
          {caseId && !data.cases.some((item) => item.id === caseId) && <option value={caseId}>{caseId} (0)</option>}
          {data.cases.map((item) => <option key={item.id} value={item.id}>{readableFlowLabel(item.label)} ({item.count})</option>)}
        </select>
      </label>
    </div>
    <div className="flow-workspace">
      <nav className="flow-case-nav" aria-label={t("Dosare de achiziție")}>
        {graphs.map((graph) => {
          const item = caseInfo(graph);
          return <button key={graph.id} className="flow-case-choice" aria-pressed={active?.id === graph.id}
            onClick={() => setSelected(graph.id)}>
            <span className="flow-choice-id">{graph.label}</span><strong>{item.name}</strong>
            <span className="flow-choice-meta">{graph.nodes.length} {t("documente")}{item.attention > 0 && <span><Clock3 size={11} />{item.attention} {t("de verificat")}</span>}</span>
          </button>;
        })}
        {caseId && <button className="text-button" onClick={() => onSelectCase('')}>{t("Toate dosarele")}</button>}
      </nav>
      <div className="flow-selected-case">
        {active && info && <>
          <div className="flow-case-intro"><div><h3>{info.name}</h3>{info.summary && <p>{info.summary}</p>}</div>
          </div>
          <p className="flow-semantics">{t("Fiecare document are propriile stări de aprobare. Coloanele grupează documentele; nu impun o succesiune unică între toate activitățile.")}</p>
          <div className="flow-legend"><span><FlowLegendArrow />{t("Dependență declarată")}</span><span><FlowLegendArrow kind="reference" />{t("Referință")}</span>
            {active.edges.some(edge=>edge.kind==='association')&&<span><FlowLegendArrow kind="association" />{t("Asociere · fără condiție de execuție")}</span>}
            {active.edges.some((edge) => edge.kind === 'correction') && <span><FlowLegendArrow kind="correction" />{t("Retur / corecție")}</span>}
            <span className="flow-scroll-hint">{t("Derulează pentru toate coloanele")}</span>
          </div>
          <div className="flow-chart-scroll" role="region" aria-label={t("Diagrama fluxului de achiziții")} tabIndex={0}>
            <div className="flow-chart">
              <div className="flow-lanes" aria-hidden="true">{stages.map(({ id }) => <div key={id} className="flow-lane" />)}</div>
              <div className="flow-stage-headings"><div className="flow-stage-columns">
                {stages.map(({id, label, Icon}) => {
                  const count = active.nodes.filter((node) => node.stage === id).length;
                  return <section className="flow-stage" key={id} aria-labelledby={`${headingId}-${id}`}>
                    <Icon size={18} /><h3 id={`${headingId}-${id}`}>{label}</h3><span className="flow-stage-count" aria-label={t("{p0} documente", {p0:count})}>{count}</span>
                  </section>;
                })}
              </div></div>
              <section className="flow-case-graph" aria-label={active.label} data-graph-id={active.id}>
                <FlowCaseChart key={active.id} graph={active} onOpen={onOpen} />
              </section>
            </div>
          </div>
        </>}
        {!active && <div className="flow-empty-diagram">{t("Niciun document în această selecție")}</div>}
        </div>
    </div>
    {data.unclassified_total > 0 && <div className="flow-note"><span>{data.unclassified_total} {t("documente în afara fluxului")}</span>
      <button className="text-button" onClick={onShowRegister}>{t("Vezi registrul")}<ArrowUpRight size={14} /></button>
    </div>}
  </section>;
}
