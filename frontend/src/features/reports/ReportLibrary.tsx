import {t,useLanguage} from '@/i18n';
import {useState} from 'react';
import {ArrowRight, ArrowUpRight, FileText, Search, Star, X} from 'lucide-react';
import type {Page} from '@/types';
import type {ReportBriefing, SelectReport} from './types';
import {number} from './labels';
import {searchText} from './export';
import {PreviewChart, REPORT_ICONS} from './briefing-visuals';

export function ReportLibrary({data,pins,onPin,onSelect,onNavigate}:{data:ReportBriefing;pins:string[];onPin:(id:string)=>void;onSelect:SelectReport;onNavigate:(page:Page)=>void}){
  useLanguage();
 const [search,setSearch]=useState(''),[category,setCategory]=useState('Toate'),[pinnedOnly,setPinnedOnly]=useState(false);
 const catalog=data.catalog;
 const categories=['Toate',...new Set(catalog.items.map(r=>r.category))];
 const reports=data.reports.filter(r=>(category==='Toate'||r.report.category===category)&&(!pinnedOnly||pins.includes(r.report.id))&&searchText(`${r.report.title} ${r.report.subtitle}`).includes(searchText(search)));
 const favoriteCount=catalog.items.filter(r=>pins.includes(r.id)).length;
 const refreshTime=new Intl.DateTimeFormat('ro-RO',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(data.generated_at));
 const open:SelectReport=(id,options={})=>onSelect(id,{department:data.department,...options});
 function reset(){setSearch('');setCategory('Toate');setPinnedOnly(false);}
 return <div className="db-briefing px-library">
    <section className="db-library" aria-labelledby="report-library-title"><header><div><span className="db-eyebrow">{t("APROFUNDEAZĂ ANALIZA")}</span><h2 id="report-library-title">{t("Rapoartele aeroportului")}{' '}<span>{catalog.items.length}</span></h2><p>{t("Previzualizări calculate din aceleași date. Deschide un raport pentru detalii.")}</p></div><div className="db-library-tools"><label><Search size={17}/><input placeholder={t("Caută un raport…")} aria-label={t("Caută un raport")} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch('')} aria-label={t("Șterge căutarea")}><X size={14}/></button>}</label><button className="db-favorites" aria-pressed={pinnedOnly} onClick={()=>setPinnedOnly(!pinnedOnly)}><Star size={16} fill={pinnedOnly?'currentColor':'none'}/>{t("Favorite")}{' '}<b>{favoriteCount}</b></button></div></header><div className="db-category-tabs">{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}<span aria-live="polite">{reports.length} {t("rapoarte")}</span></div>
      <div className="db-report-grid">{reports.map(r=>{const Icon=REPORT_ICONS[r.report.id as keyof typeof REPORT_ICONS]||FileText;const headline=r.metrics[0];return <article key={r.report.id} className={`db-report-card db-card-${r.report.id}`}><header><span className="db-report-icon"><Icon size={19}/></span><span>{r.report.category}</span><button onClick={()=>onPin(r.report.id)} aria-label={t("{p0} {p1} {p2} favorite", {p0:pins.includes(r.report.id)?'Elimină':'Adaugă',p1:r.report.title,p2:pins.includes(r.report.id)?'din':'la'})} aria-pressed={pins.includes(r.report.id)}><Star size={16} fill={pins.includes(r.report.id)?'currentColor':'none'}/></button></header><button className="db-card-main" onClick={()=>open(r.report.id)}><h3>{r.report.title}</h3><p>{r.report.subtitle}</p><div className="db-card-metric"><strong>{number(headline.value)}</strong><span>{t(headline.label)}</span><ArrowUpRight size={19}/></div><PreviewChart data={r}/></button><footer><span>{r.total?t("{p0} înregistrări · {p1}", {p0:r.total,p1:refreshTime}):t("Sursă conectată · fără înregistrări")}</span><button onClick={()=>open(r.report.id)}>{t("Deschide")}<ArrowRight size={14}/></button></footer>{!r.total&&["suppliers","sharing"].includes(r.report.id)&&<button className="db-report-empty-action" onClick={()=>onNavigate(r.report.id as Page)}>{r.report.id==="suppliers"?t("Deschide verificările de furnizori"):t("Deschide partajările")}<ArrowUpRight size={13}/></button>}</article>;})}</div>
      {!reports.length&&<div className="db-empty-library"><Search size={26}/><h3>{pinnedOnly?t("Niciun raport favorit în această selecție."):t("Niciun raport găsit.")}</h3><p>{t("Adaugă rapoarte la favorite folosind steaua sau ajustează căutarea.")}</p><button onClick={reset}>{t("Vezi toate rapoartele")}<ArrowRight size={15}/></button></div>}
    </section>
 </div>;
}
