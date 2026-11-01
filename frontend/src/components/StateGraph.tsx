import {t,useLanguage} from '@/i18n';
import {useId,useRef,useState} from 'react';
import {Minus,Plus,Scan,Maximize2} from 'lucide-react';
import {Modal} from './ui';
import type {GraphLink} from './graph-layout';

export interface StateGraphNode {id:string;label:string;caption?:string;status?:string;tone?:string;column:number;row:number;current?:boolean}
const W=214,H=106,DX=274,DY=150,PAD=70;

export function StateGraph({label,nodes,edges,selected,onSelect,direction='horizontal',allowExpand=true}:{label:string;nodes:StateGraphNode[];edges:GraphLink[];selected?:string;onSelect?:(id:string)=>void;direction?:'horizontal'|'vertical';allowExpand?:boolean}) {
  useLanguage();
  const [zoom,setZoom]=useState(1),viewport=useRef<HTMLDivElement>(null),marker=useId().replace(/[^a-z0-9]/gi,'');
  const [expanded,setExpanded]=useState(false);
  const width=Math.max(1,...nodes.map(n=>n.column+1))*DX+PAD*2-DX+W;
  const height=Math.max(1,...nodes.map(n=>n.row+1))*DY+PAD*2+50;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const point=(n:StateGraphNode)=>({x:PAD+n.column*DX,y:PAD+n.row*DY});
  function path(edge:GraphLink,index:number){
    const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)return {d:'',x:0,y:0};
    const p=point(a),q=point(b);
    if(direction==='vertical'&&b.row>a.row){
      const y=p.y+H+(DY-H)/2;
      if(b.row===a.row+1)return {d:`M ${p.x+W/2} ${p.y+H} V ${y} H ${q.x+W/2} V ${q.y}`,x:(p.x+q.x+W)/2,y:y-7};
      const gutter=width-35+(index%4)*6,entry=q.y-15;
      return {d:`M ${p.x+W/2} ${p.y+H} V ${y} H ${gutter} V ${entry} H ${q.x+W/2} V ${q.y}`,x:gutter,y:entry-7};
    }
    if(a.id===b.id)return {d:`M ${p.x+W*.3} ${p.y} C ${p.x+W*.1} ${p.y-43} ${p.x+W*.9} ${p.y-43} ${p.x+W*.7} ${p.y}`,x:p.x+W/2,y:p.y-35};
    if(b.column>a.column){
      if(edge.label){const y=Math.min(p.y,q.y)-22-(index%2)*18;return {d:`M ${p.x+W*.7} ${p.y} V ${y} H ${q.x+W*.3} V ${q.y}`,x:(p.x+q.x+W)/2,y:y-7}}
      const x=p.x+W+(DX-W)/2;return {d:`M ${p.x+W} ${p.y+H/2} H ${x} V ${q.y+H/2} H ${q.x}`,x:(p.x+W+q.x)/2,y:q.y+H/2-10}
    }
    const y=Math.max(p.y,q.y)+H+25+(index%3)*17;
    return {d:`M ${p.x+W*.65} ${p.y+H} V ${y} H ${q.x+W*.35} V ${q.y+H}`,x:(p.x+q.x+W)/2,y:y-7};
  }
  return <section className="state-graph" aria-label={label}>
    <div className="state-graph-tools"><span>{label}</span><div><button type="button" aria-label={t("Micșorează diagrama")} onClick={()=>setZoom(v=>Math.max(.35,v-.15))}><Minus size={15}/></button><output>{Math.round(zoom*100)}%</output><button type="button" aria-label={t("Mărește diagrama")} onClick={()=>setZoom(v=>Math.min(1.6,v+.15))}><Plus size={15}/></button><button type="button" onClick={()=>setZoom(Math.max(.35,Math.min(1,(viewport.current?.clientWidth||width)/width)))}><Scan size={15}/>{t("Încadrează")}</button>{allowExpand&&<button type="button" title={t('Extinde diagrama')} aria-label={t('Extinde diagrama')} onClick={()=>setExpanded(true)}><Maximize2 size={15}/></button>}</div></div>
    <div className="state-graph-scroll" ref={viewport} tabIndex={0} role="region" aria-label={label+' · '+t('derulare și zoom')}><div style={{width:width*zoom,height:height*zoom}}><div className="state-graph-canvas" style={{width,height,transform:`scale(${zoom})`}}>
      <svg width={width} height={height} aria-hidden="true"><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="1.5"/></marker></defs>
        {edges.map((edge,index)=>{const route=path(edge,index);return <g key={edge.source+edge.target+index} className={'state-graph-edge '+(edge.kind||'')+(selected&&(edge.source===selected||edge.target===selected)?' selected':'')} data-source={edge.source} data-target={edge.target}><path d={route.d} markerEnd={`url(#${marker})`}/>{edge.label&&<text x={route.x} y={route.y} textAnchor="middle">{edge.label}</text>}</g>})}
      </svg>
      {nodes.map(node=>{const p=point(node);return <button type="button" key={node.id} className={'state-graph-node tone-'+(node.tone||'neutral')+(node.current?' current':'')} style={{left:p.x,top:p.y,width:W,height:H}} aria-pressed={selected===node.id} aria-label={[node.label,node.caption,node.status,node.current?t('Starea curentă'):''].filter(Boolean).join(' · ')} onClick={()=>onSelect?.(node.id)} data-graph-node={node.id}>
        <small>{node.status||t(node.current?'Starea curentă':'Stare')}</small><strong>{node.label}</strong>{node.caption&&<span>{node.caption}</span>}
      </button>})}
    </div></div></div>
    <ul className="sr-only">{edges.map((edge,i)=><li key={i}>{byId.get(edge.source)?.label} → {byId.get(edge.target)?.label}{edge.label&&' · '+edge.label}</li>)}</ul>
    {expanded&&<Modal title={label} wide className="state-graph-modal" onClose={()=>setExpanded(false)}><StateGraph label={label} nodes={nodes} edges={edges} selected={selected} onSelect={onSelect} direction={direction} allowExpand={false}/></Modal>}
  </section>;
}
