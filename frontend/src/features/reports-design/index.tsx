import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, Download, ExternalLink, Heart, LayoutGrid, Plane, Search, SlidersHorizontal, X} from 'lucide-react';
import {createPortal} from 'react-dom';
import references from './references.json';
import './reports-design.css';

type Reference = typeof references[number];
const key = 'aerodesk-report-inspiration-favorites';
const categories = ['All designs', 'Analytics', 'Finance', 'Operations', 'Editorial', 'Templates', 'Report builders'];
const collections = [
  {name:'Dribbble · report dashboards',url:'https://dribbble.com/search/report-dashboard'},
  {name:'Dribbble · bento dashboards',url:'https://dribbble.com/search/bento-dashboard'},
  {name:'Behance · report design',url:'https://www.behance.net/search/projects/report%20dashboard%20design'},
  {name:'Untitled UI · dashboards',url:'https://www.untitledui.com/components/dashboards'},
  {name:'TailAdmin · live templates',url:'https://tailadmin.com/'},
  {name:'Tremor · chart compositions',url:'https://blocks.tremor.so/blocks'},
  {name:'Geckoboard · dashboard examples',url:'https://www.geckoboard.com/dashboard-examples/'},
];
function readFavorites(): string[] {
  try {const value:unknown=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&references.some(r=>r.id===id)):[];} catch {return [];}
}

function ReferenceImage({reference,large=false}: {reference:Reference;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return failed?<div className="ri-image-fallback"><LayoutGrid size={30}/><strong>View this design on the original site</strong><span>The creator’s preview image is unavailable.</span><span>Use the Original link to explore the design.</span></div>:<img src={reference.image} alt={`${reference.title} — design by ${reference.author}`} loading={large?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>;
}

function PreviewDialog({items,onClose,onToggle,favorites,onStep}: {items:Reference[];onClose:()=>void;onToggle:(id:string)=>void;favorites:string[];onStep?:(step:number)=>void}) {
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.focus();
    function handle(e:KeyboardEvent) {
      if(e.key==='Escape')onClose();
      if(e.key==='ArrowLeft'&&onStep)onStep(-1);
      if(e.key==='ArrowRight'&&onStep)onStep(1);
      if(e.key==='Tab') {
        const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
        if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',handle);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',handle);previous?.focus();};
  },[onClose,onStep]);
  return createPortal(<div className="ri-modal-backdrop" onClick={onClose}><div ref={dialog} tabIndex={-1} className={`ri-modal ${items.length>1?'ri-modal-compare':''}`} role="dialog" aria-modal="true" aria-labelledby="ri-modal-title" onClick={e=>e.stopPropagation()}>
    <header><div><span>ORIGINAL WEB REFERENCE{items.length>1?'S':''}</span><h2 id="ri-modal-title">{items.length>1?'Compare your directions':items[0].title}</h2></div><div className="ri-modal-controls">{onStep&&<><button onClick={()=>onStep(-1)} aria-label="Previous design"><ArrowLeft size={18}/></button><button onClick={()=>onStep(1)} aria-label="Next design"><ArrowRight size={18}/></button></>}<button onClick={onClose} aria-label="Close preview"><X size={21}/></button></div></header>
    <div className="ri-modal-items">{items.map(item=><section key={item.id}><div className="ri-modal-image"><ReferenceImage reference={item} large/></div><div className="ri-modal-caption"><div><span className="ri-category">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p><small>By {item.author}</small></div><div className="ri-modal-links"><button className={`ri-pill ${favorites.includes(item.id)?'ri-is-favorite':''}`} onClick={()=>onToggle(item.id)}><Heart size={15} fill={favorites.includes(item.id)?'currentColor':'none'}/>{favorites.includes(item.id)?'Shortlisted':'Shortlist'}</button><a className="ri-primary" href={item.url} target="_blank" rel="noreferrer">Open original <ArrowUpRight size={16}/></a></div></div></section>)}</div>
    <footer>Preview artwork belongs to its creator. {onStep?'Use ← → to explore. ':''}Press Esc to close.</footer>
  </div></div>,document.body);
}

export function ReportsDesignPage() {
  const [category,setCategory]=useState('All designs');
  const [search,setSearch]=useState('');
  const [favorites,setFavorites]=useState<string[]>(readFavorites);
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const [preview,setPreview]=useState<string|null>(null);
  const [compare,setCompare]=useState<string[]>([]);
  const [comparing,setComparing]=useState(false);
  const [message,setMessage]=useState('');
  const visible=references.filter(r=>(category==='All designs'||r.category===category)&&(!favoritesOnly||favorites.includes(r.id))&&`${r.title} ${r.author} ${r.category} ${r.description}`.toLowerCase().includes(search.toLowerCase().trim()));
  function toggleFavorite(id:string) {
    const next=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];setFavorites(next);
    try {localStorage.setItem(key,JSON.stringify(next));setMessage(next.includes(id)?'Added to your shortlist.':'Removed from your shortlist.');} catch {setMessage('Shortlist updated for this visit. Download it to keep your choices.');}
  }
  function toggleCompare(id:string) {
    if(compare.includes(id)){setCompare(compare.filter(v=>v!==id));return;}
    if(compare.length===3){setMessage('Compare up to three designs. Remove one to add another.');return;}
    setCompare([...compare,id]);
  }
  function exportShortlist() {
    const data=references.filter(r=>favorites.includes(r.id)).map(({id,title,author,url,category})=>({id,title,author,url,category}));
    const url=URL.createObjectURL(new Blob([JSON.stringify({project:'FlyLeaf report design',references:data},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='flyleaf-report-inspiration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const active=references.find(r=>r.id===preview);
  function step(direction:number) {
    const list=visible.length&&visible.some(r=>r.id===preview)?visible:references;
    const index=list.findIndex(r=>r.id===preview);setPreview(list[(index+direction+list.length)%list.length].id);
  }
  return <div className="ri-page">
    <header className="ri-header"><a href="/" className="ri-brand"><span><Plane size={19}/></span>FlyLeaf<b>/</b><small>Inspiration board</small></a><div><button className="ri-header-shortlist" onClick={()=>{setFavoritesOnly(!favoritesOnly);setCategory('All designs');setSearch('');}}><Heart size={15}/>{favorites.length} saved</button><a href="/" className="ri-back">Workspace <ArrowUpRight size={15}/></a></div></header>
    <section className="ri-hero"><div className="ri-kicker"><span/> REPORTS, WITH PERSONALITY</div><div className="ri-hero-row"><h1>Find your<br/><span>design direction.</span></h1><div><p>A wider world of reports. Explore original work from designers, studios, and real products. Save the details you love; mix ideas from different references.</p><div className="ri-hero-count"><strong>{references.length}</strong><span>web references<br/>to explore</span><i/><strong>6</strong><span>different<br/>directions</span></div></div></div><div className="ri-hero-foot"><span>Dark & dramatic. Bright & playful. Editorial & expressive.</span><span>Original previews · Creator links · Your shortlist <ArrowDownIcon/></span></div></section>
    <section className="ri-filter-bar" aria-label="Filter design references"><div className="ri-categories">{categories.map(c=><button key={c} className={category===c?'active':''} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}<span>{c==='All designs'?references.length:references.filter(r=>r.category===c).length}</span></button>)}</div><div className="ri-filter-tools"><label className="ri-search"><Search size={15}/><input aria-label="Search references" placeholder="Search styles, charts, creators…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch('')} aria-label="Clear search"><X size={13}/></button>}</label><button className={`ri-pill ${favoritesOnly?'ri-is-favorite':''}`} aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(!favoritesOnly)}><Heart size={14} fill={favoritesOnly?'currentColor':'none'}/>Shortlist{favorites.length>0&&<span>{favorites.length}</span>}</button></div></section>
    <div className="ri-results-heading"><span>{visible.length} {visible.length===1?'reference':'references'}{favoritesOnly?' in your shortlist':''}</span><span><SlidersHorizontal size={12}/> Select up to 3 to compare</span></div>
    <section className="ri-grid" aria-label="Original report design references">{visible.map((r)=><article key={r.id} className="ri-card"><div className="ri-card-visual"><button className="ri-preview-button" onClick={()=>setPreview(r.id)} aria-label={`Preview ${r.title}`}><ReferenceImage reference={r}/><span className="ri-open-overlay">Explore design <ArrowUpRight size={16}/></span></button><span className="ri-card-number">{r.id.replace('ref-','')}</span><button className={`ri-heart ${favorites.includes(r.id)?'ri-is-favorite':''}`} onClick={()=>toggleFavorite(r.id)} aria-label={`${favorites.includes(r.id)?'Remove':'Save'} ${r.title}`} aria-pressed={favorites.includes(r.id)}><Heart size={16} fill={favorites.includes(r.id)?'currentColor':'none'}/></button></div><div className="ri-card-body"><span className="ri-category">{r.category}</span><button className="ri-card-title" onClick={()=>setPreview(r.id)}><h2>{r.title}</h2></button><p>{r.description}</p><div className="ri-card-author">By {r.author}</div><div className="ri-card-actions"><button className={compare.includes(r.id)?'selected':''} aria-pressed={compare.includes(r.id)} onClick={()=>toggleCompare(r.id)}><span>{compare.includes(r.id)&&<Check size={11}/>}</span>Compare</button><a href={r.url} target="_blank" rel="noreferrer">Original <ExternalLink size={12}/></a></div></div></article>)}</section>
    {!visible.length&&<div className="ri-empty"><Search size={28}/><h2>{favoritesOnly?'No matching favorites yet.':'No matching designs.'}</h2><p>Explore the board or try a different category or search.</p><button className="ri-primary" onClick={()=>{setFavoritesOnly(false);setCategory('All designs');setSearch('');}}>Show all designs <ArrowRight size={15}/></button></div>}
    <section className="ri-more"><div><span className="ri-kicker">KEEP EXPLORING</span><h2>More places to find your style.</h2><p>Browse these larger collections for thousands of additional directions.</p></div><div className="ri-collection-links">{collections.map(c=><a href={c.url} key={c.url} target="_blank" rel="noreferrer">{c.name}<ArrowUpRight size={15}/></a>)}</div></section>
    <section className="ri-shortlist-footer"><div><Heart size={21}/><div><strong>{favorites.length?`${favorites.length} ${favorites.length===1?'design':'designs'} in your shortlist`:'Keep what catches your eye.'}</strong><p>Favorites are saved in this browser. Download your shortlist to share your direction.</p></div></div><button className="ri-primary" disabled={!favorites.length} onClick={exportShortlist}><Download size={15}/>Download shortlist</button></section>
    <p className="ri-message" role="status" aria-live="polite">{message}</p>
    <footer className="ri-footer"><span>FlyLeaf · Report inspiration</span><span>Preview artwork belongs to its credited creators. References are inspiration for your future report page.</span></footer>
    {compare.length>0&&<div className="ri-compare-dock"><div><strong>{compare.length} / 3</strong><span>selected to compare</span>{compare.map(id=><button className="ri-compare-chip" key={id} onClick={()=>toggleCompare(id)} aria-label={`Remove ${references.find(r=>r.id===id)?.title} from comparison`}>{id.replace('ref-','#')}<X size={12}/></button>)}</div><div><button className="ri-clear" onClick={()=>setCompare([])}>Clear</button><button className="ri-primary" disabled={compare.length<2} onClick={()=>setComparing(true)}>Compare designs <ArrowRight size={15}/></button></div></div>}
    {active&&<PreviewDialog items={[active]} onClose={()=>setPreview(null)} onToggle={toggleFavorite} favorites={favorites} onStep={step}/>}
    {comparing&&<PreviewDialog items={references.filter(r=>compare.includes(r.id))} onClose={()=>setComparing(false)} onToggle={toggleFavorite} favorites={favorites}/>}
  </div>;
}

function ArrowDownIcon(){return <ArrowRight size={13} style={{transform:'rotate(90deg)'}}/>;}
