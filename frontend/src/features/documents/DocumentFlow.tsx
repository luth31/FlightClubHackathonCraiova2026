import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { FileIcon, Status } from "@/components/ui";
import { buildFlowGraphs } from "./flow-graph";
import { readableFlowLabel } from "./flow-label";
import type { FlowGraphEdge, FlowGraphGroup, FlowGraphNode } from "./flow-graph";
import type { DocumentFlowData, DocumentFlowStageId } from "@/types";
import "./document-flow.css";

const stageIcons = {
  purchasing: ShoppingCart,
  shipping: Truck,
  inventory_management: PackageCheck,
  invoice_verification: ReceiptText,
} satisfies Record<DocumentFlowStageId, typeof ShoppingCart>;

const STAGE_GAP = 64;
const CARD_HEIGHT = 132;
const ROW_GAP = 32;
const CANVAS_PADDING = 18;
const CARD_INSET = 12;

function FlowCaseFolder({graph,onOpen,onSelectCase,initiallyOpen=false}:{
  graph:FlowGraphGroup;onOpen:(id:string)=>void;onSelectCase:(id:string)=>void;initiallyOpen?:boolean;
}){
  const [open,setOpen]=useState(initiallyOpen);
  return <details className="flow-case-folder" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><FolderOpen size={17}/><strong>{graph.label}</strong><span>{graph.nodes.length} documente</span></summary>
    {open&&<FlowCaseChart graph={graph} onOpen={onOpen} onSelectCase={onSelectCase}/>}
  </details>;
}

function connectorPath(edge: FlowGraphEdge, nodes: Map<string, FlowGraphNode>, width: number) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return "";
  const columnWidth = (width - STAGE_GAP * 3) / 4;
  const left = (node: FlowGraphNode) => node.stageIndex * (columnWidth + STAGE_GAP) + CARD_INSET;
  const top = (node: FlowGraphNode) => CANVAS_PADDING + node.row * (CARD_HEIGHT + ROW_GAP);

  if (source.stageIndex === target.stageIndex) {
    const x = left(source) + (columnWidth - CARD_INSET * 2) / 2;
    const below = target.row > source.row;
    const sourceY = top(source) + (below ? CARD_HEIGHT : 0);
    const targetY = top(target) + (below ? 0 : CARD_HEIGHT);
    if (Math.abs(target.row - source.row) === 1) {
      return `M ${x} ${sourceY} V ${targetY}`;
    }
    const gutter = left(source) + columnWidth - CARD_INSET * 2 + CARD_INSET / 2;
    const sourceExit = sourceY + (below ? ROW_GAP / 2 : -ROW_GAP / 2);
    const targetEntry = targetY + (below ? -ROW_GAP / 2 : ROW_GAP / 2);
    return `M ${x} ${sourceY} V ${sourceExit} H ${gutter} V ${targetEntry} H ${x} V ${targetY}`;
  }

  const sourceX = left(source) + columnWidth - CARD_INSET * 2;
  const sourceY = top(source) + CARD_HEIGHT / 2;
  const targetX = left(target);
  const targetY = top(target) + CARD_HEIGHT / 2;
  const sourceGutter = sourceX + CARD_INSET + STAGE_GAP / 2;
  if (target.stageIndex - source.stageIndex === 1) {
    return `M ${sourceX} ${sourceY} H ${sourceGutter} V ${targetY} H ${targetX}`;
  }

  // Stage skips follow the empty space above the cards
  const targetGutter = targetX - CARD_INSET - STAGE_GAP / 2;
  const routeY = Math.min(top(source), top(target)) - ROW_GAP / 2;
  return `M ${sourceX} ${sourceY} H ${sourceGutter} V ${routeY} H ${targetGutter} V ${targetY} H ${targetX}`;
}

function FlowCaseChart({
  graph,
  onOpen,
  onSelectCase,
}: {
  graph: FlowGraphGroup;
  onOpen: (id: string) => void;
  onSelectCase: (id: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1040);
  const [focusedDocument, setFocusedDocument] = useState<string>();
  const arrowId = `flow-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const related = new Set([focusedDocument]);
  for (const edge of graph.edges) {
    if (edge.source === focusedDocument) related.add(edge.target);
    if (edge.target === focusedDocument) related.add(edge.source);
  }
  const height = CANVAS_PADDING * 2 + graph.rowCount * CARD_HEIGHT + (graph.rowCount - 1) * ROW_GAP;
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

  return (
    <section className="flow-case-graph" aria-label={graph.label} data-graph-id={graph.id}>
      <div className="flow-case-heading">
        <div>
          <FolderOpen size={15} />
          {graph.caseId ? (
            <button onClick={() => onSelectCase(graph.caseId!)}>{graph.label}</button>
          ) : (
            <strong>{graph.label}</strong>
          )}
          <span>{graph.nodes.length} documente</span>
        </div>
        <span>{graph.edges.length} conexiuni</span>
      </div>
      <div
        className="flow-case-body"
        ref={bodyRef}
        style={{ gridTemplateRows: `repeat(${graph.rowCount}, ${CARD_HEIGHT}px)` }}
      >
        <div className="flow-lanes" aria-hidden="true">
          {Object.keys(stageIcons).map((stage) => (
            <div key={stage} className={`flow-lane flow-stage-${stage}`} />
          ))}
        </div>
        <svg
          className="flow-connectors"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          <defs>
            <marker id={arrowId} markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
              <path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke" />
            </marker>
          </defs>
          {graph.edges.map((edge) => (
            <path
              key={edge.id}
              className={`flow-connector flow-connector-${edge.kind}${focusedDocument && (edge.source === focusedDocument || edge.target === focusedDocument) ? " flow-connector-active" : ""}`}
              d={connectorPath(edge, nodeMap, width)}
              markerEnd={`url(#${arrowId})`}
              data-source-id={edge.source}
              data-target-id={edge.target}
              data-case-id={graphCaseId}
            />
          ))}
        </svg>
        {graph.nodes.map(({ document, stage, stageIndex, row }) => {
          const title = readableFlowLabel(document.title);
          return (
            <article
              key={document.id}
              className={`flow-document flow-stage-${stage}${focusedDocument && related.has(document.id) ? " flow-document-related" : ""}`}
              style={{ gridColumn: stageIndex + 1, gridRow: row + 1 }}
              data-node-id={document.id}
              data-case-id={graphCaseId}
              onMouseEnter={() => setFocusedDocument(document.id)}
              onMouseLeave={() => setFocusedDocument(undefined)}
              onFocus={() => setFocusedDocument(document.id)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocusedDocument(undefined);
              }}
            >
              <button
                className="flow-document-open"
                onClick={() => onOpen(document.id)}
                aria-label={`Deschide ${title}`}
                title={`${title}\n${document.number}${document.supplier ? `\n${readableFlowLabel(document.supplier)}` : ""}`}
              >
                <span className="flow-document-kind">
                  <FileIcon category={document.category} />
                  <span>{document.flow.document_type}</span>
                  <ArrowUpRight size={14} />
                </span>
                <strong>{title}</strong>
                <span className="flow-document-number">{document.number}</span>
              </button>
              <div className="flow-document-footer">
                <Status value={document.status} />
              </div>
            </article>
          );
        })}
      </div>
      {graph.edges.length > 0 && (
        <ul className="sr-only">
          {graph.edges.map((edge) => (
            <li key={edge.id}>
              {readableFlowLabel(nodeMap.get(edge.source)?.document.title || "")} → {readableFlowLabel(nodeMap.get(edge.target)?.document.title || "")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DocumentFlow({
  data,
  caseId,
  onSelectCase,
  onOpen,
  onShowRegister,
}: {
  data: DocumentFlowData;
  caseId: string;
  onSelectCase: (id: string) => void;
  onOpen: (id: string) => void;
  onShowRegister: () => void;
}) {
  const graphs = useMemo(() => buildFlowGraphs(data.stages), [data.stages]);

  return (
    <section className="document-flow" aria-label="Fluxul documentelor de achiziție">
      <div className="flow-toolbar">
        <div>
          <h2>Dosare de achiziție</h2>
        </div>
        <label className="flow-case-filter">
          <span><FolderOpen size={15} /> Dosar de achiziție</span>
          <select aria-label="Dosar de achiziție" value={caseId} onChange={(event) => onSelectCase(event.target.value)}>
            <option value="">Toate dosarele</option>
            {caseId && !data.cases.some((item) => item.id === caseId) && (
              <option value={caseId}>{caseId} (0)</option>
            )}
            {data.cases.map((item) => (
              <option key={item.id} value={item.id}>{item.label} ({item.count})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flow-summary" role="status">
        <span>
          <strong>{graphs.length}</strong> dosare
          <span className="meta-dot">·</span>{data.classified_total} documente
        </span>
        {caseId && <button className="text-button" onClick={() => onSelectCase("")}>Vezi toate dosarele</button>}
      </div>
      <div className="flow-legend">
        <span><ArrowRight size={25} /> Flux între documente</span>
        <span><i /> Document asociat</span>
        <span className="flow-scroll-hint">Derulează diagrama pentru a vedea toate etapele</span>
      </div>
      <div
        className="flow-chart-scroll"
        role="region"
        aria-label="Diagrama cu cele patru etape ale fluxului"
        tabIndex={0}
      >
        <div className="flow-chart">
          <div className="flow-stage-headings">
            {data.stages.map((stage, index) => {
              const Icon = stageIcons[stage.id];
              return (
                <section className={`flow-stage flow-stage-${stage.id}`} key={stage.id} aria-labelledby={`flow-heading-${stage.id}`}>
                  <div className="flow-stage-header">
                    <div className="flow-stage-step">
                      <span className="flow-stage-icon"><Icon size={21} /></span>
                      <span>ETAPA {index + 1}</span>
                    </div>
                    <div className="flow-stage-title">
                      <h3 id={`flow-heading-${stage.id}`}>{stage.label}</h3>
                      <span className="flow-stage-count" aria-label={`${stage.count} documente`}>{stage.count}</span>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          {graphs.map((graph,index) => (
            graphs.length===1?<FlowCaseChart key={graph.id} graph={graph} onOpen={onOpen} onSelectCase={onSelectCase}/>:<FlowCaseFolder key={graph.id} graph={graph} onOpen={onOpen} onSelectCase={onSelectCase} initiallyOpen={index===0}/>
          ))}
          {!graphs.length && (
            <div className="flow-empty-diagram">Niciun document în această selecție</div>
          )}
        </div>
      </div>
      <div className="flow-note">
        {data.unclassified_total > 0 && (
          <span className="flow-other-documents">
            {data.unclassified_total} documente în afara fluxului
            <button className="text-button" onClick={onShowRegister}>Vezi registrul <ArrowUpRight size={14} /></button>
          </span>
        )}
      </div>
    </section>
  );
}
