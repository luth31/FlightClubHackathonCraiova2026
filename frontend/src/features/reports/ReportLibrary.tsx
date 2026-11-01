import {useState} from 'react';
import {ArrowRight, ArrowUpRight, FileText, Search, Star, X} from 'lucide-react';
import type {Page} from '@/types';
import type {ReportBriefing, SelectReport} from './types';
import {number} from './labels';
import {searchText} from './export';
import {PreviewChart, REPORT_ICONS} from './briefing-visuals';

export function ReportLibrary({data,pins,onPin,onSelect,onNavigate}:{data:ReportBriefing;pins:string[];onPin:(id:string)=>void;onSelect:SelectReport;onNavigate:(page:Page)=>void}){
 const [search,setSearch]=useState(''),[category,setCategory]=useState('Toate'),[pinnedOnly,setPinnedOnly]=useState(false);
 const catalog=data.catalog;
 const categories=['Toate',...new Set(catalog.items.map(r=>r.category))];
 const reports=data.reports.filter(r=>(category==='Toate'||r.report.category===category)&&(!pinnedOnly||pins.includes(r.report.id))&&searchText(`${r.report.title} ${r.report.subtitle}`).includes(searchText(search)));
 const favoriteCount=catalog.items.filter(r=>pins.includes(r.id)).length;
 const refreshTime=new Intl.DateTimeFormat('ro-RO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(data.generated_at));
 const open:SelectReport=(id,options={})=>onSelect(id,{department:data.department,...options});
 function reset(){setSearch('');setCategory('Toate');setPinnedOnly(false);}
 return <div className="db-briefing px-library">
    <section className="db-library" aria-labelledby="report-library-title"><header><div><span className="db-eyebrow">APROFUNDEAZĂ ANALIZA</span><h2 id="report-library-title">Rapoartele aeroportului <span>{catalog.items.length}</span></h2><p>Previzualizări calculate din aceleași date. Deschide un raport pentru detalii.</p></div><div className="db-library-tools"><label><Search size={17}/><input placeholder="Caută un raport…" aria-label="Caută un raport" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch('')} aria-label="Șterge căutarea"><X size={14}/></button>}</label><button className="db-favorites" aria-pressed={pinnedOnly} onClick={()=>setPinnedOnly(!pinnedOnly)}><Star size={16} fill={pinnedOnly?'currentColor':'none'}/>Favorite <b>{favoriteCount}</b></button></div></header><div className="db-category-tabs">{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}<span aria-live="polite">{reports.length} rapoarte</span></div>
      <div className="db-report-grid">{reports.map(r=>{const Icon=REPORT_ICONS[r.report.id as keyof typeof REPORT_ICONS]||FileText;const headline=r.metrics[0];return <article key={r.report.id} className={`db-report-card db-card-${r.report.id}`}><header><span className="db-report-icon"><Icon size={19}/></span><span>{r.report.category}</span><button onClick={()=>onPin(r.report.id)} aria-label={`${pins.includes(r.report.id)?'Elimină':'Adaugă'} ${r.report.title} ${pins.includes(r.report.id)?'din':'la'} favorite`} aria-pressed={pins.includes(r.report.id)}><Star size={16} fill={pins.includes(r.report.id)?'currentColor':'none'}/></button></header><button className="db-card-main" onClick={()=>open(r.report.id)}><h3>{r.report.title}</h3><p>{r.report.subtitle}</p><div className="db-card-metric"><strong>{number(headline.value)}</strong><span>{headline.label}</span><ArrowUpRight size={19}/></div><PreviewChart data={r}/></button><footer><span>{r.total?`${r.total} înregistrări · ${refreshTime}`:'Sursă conectată · fără înregistrări'}</span><button onClick={()=>open(r.report.id)}>Deschide<ArrowRight size={14}/></button></footer>{!r.total&&["suppliers","sharing"].includes(r.report.id)&&<button className="db-report-empty-action" onClick={()=>onNavigate(r.report.id as Page)}>{r.report.id==="suppliers"?"Deschide verificările de furnizori":"Deschide partajările"}<ArrowUpRight size={13}/></button>}</article>;})}</div>
      {!reports.length&&<div className="db-empty-library"><Search size={26}/><h3>{pinnedOnly?'Niciun raport favorit în această selecție.':'Niciun raport găsit.'}</h3><p>Adaugă rapoarte la favorite folosind steaua sau ajustează căutarea.</p><button onClick={reset}>Vezi toate rapoartele<ArrowRight size={15}/></button></div>}
    </section>
 </div>;
}
