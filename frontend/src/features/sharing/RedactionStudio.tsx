import {useEffect, useState, useRef} from 'react';
import {ArrowLeft, ArrowRight, Check, Eye, FileCheck2, LoaderCircle, MousePointer2, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Undo2} from 'lucide-react';
import {api, fileUrl} from '@/services/api-client';
import {ErrorMessage, Loading, Modal} from '@/components/ui';
import type {DocumentRecord, Session} from '@/types';
import './redaction.css';

type Word = {id:string;text:string;rect:number[]};
type Page = {number:number;width:number;height:number;words:Word[];method?:string};
type Basis = {id:string;label:string;url:string;guidance:string};
type Layout = {source_version:number;source_sha256:string;pages:Page[];ai_available:boolean;legal_bases:Basis[]};
type Match = {page:number;word_ids:string[]};
type Suggestion = {word_ids:string[];category:string;reason:string;legal_basis_ids:string[];caution:string};
type Analysis = {suggestions:Suggestion[];summary:string;model:string};
type Preview = {preview_id:string;file_url:string;redactions:Array<{term:string;occurrences:number}>};

export function RedactionStudio({document:d,onClose,onShared}:{document:DocumentRecord;onClose:()=>void;onShared:()=>void}) {
  const [layout,setLayout]=useState<Layout>();
  const paperRef=useRef<HTMLDivElement>(null);
  const [textMode,setTextMode]=useState(false),[searched,setSearched]=useState(false),[jump,setJump]=useState(0);
  const [pageIndex,setPageIndex]=useState(0), [selected,setSelected]=useState<string[]>([]), [history,setHistory]=useState<string[][]>([]);
  const [focus,setFocus]=useState<string[]>([]), [term,setTerm]=useState(''), [matches,setMatches]=useState<Match[]>([]);
  const [context,setContext]=useState(''), [purpose,setPurpose]=useState('Schimb controlat cu aeroportul partener');
  const [analysis,setAnalysis]=useState<Analysis>(), [dismissed,setDismissed]=useState<number[]>([]);
  const [busy,setBusy]=useState(''), [error,setError]=useState(''), [preview,setPreview]=useState<Preview>();
  const [compare,setCompare]=useState(false);
  const [step,setStep]=useState<'edit'|'review'>('edit'), [reviewed,setReviewed]=useState(false);
  const [recipient,setRecipient]=useState('carpati'), [department,setDepartment]=useState(''), [expires,setExpires]=useState('2026-12-01');
  const [imageError,setImageError]=useState(false),[imageReady,setImageReady]=useState(false);
  useEffect(()=>{
    let active=true; let timer:number|undefined;
    async function load(){
      try {
        const extraction=await api<{status:string;error?:string}>(`/documents/${d.id}/extraction`);
        if(!active)return;
        if(['queued','processing'].includes(extraction.status)){timer=window.setTimeout(load,1500);return;}
        if(extraction.status==='failed')throw new Error(extraction.error||'Extragerea textului a eșuat. Reîncearcă din informațiile documentului.');
        const [data,session]=await Promise.all([api<Layout>(`/documents/${d.id}/redaction-layout`),api<Session>('/session')]);
        if(active){setLayout(data);setRecipient(session.current_user?.airport_id==='carpati'?'dunarea':'carpati')}
      }catch(e){if(active)setError((e as Error).message)}
    }
    load();return()=>{active=false;window.clearTimeout(timer)};
  },[d.id]);
  useEffect(()=>{if(imageReady||textMode)paperRef.current?.querySelector('.focused')?.scrollIntoView({block:'center',behavior:'smooth'})},[jump,imageReady,textMode]);
  const words=layout?.pages.flatMap(p=>p.words)||[];
  const page=layout?.pages[pageIndex];
  const wordMap=new Map(words.map(w=>[w.id,w]));
  const selectedSet=new Set(selected), focusSet=new Set(focus);
  const binding=layout?{source_version:layout.source_version,source_sha256:layout.source_sha256}:{};
  function changeSelection(ids:string[]) {if(busy)return;setHistory(h=>[...h.slice(-29),selected]);setSelected([...new Set(ids)]);setPreview(undefined);setReviewed(false)}
  function add(ids:string[]) {changeSelection([...selected,...ids])}
  function undo(){if(busy)return;const last=history.at(-1);if(last){setSelected(last);setHistory(h=>h.slice(0,-1));setPreview(undefined);setReviewed(false)}}
  function goPage(index:number){if(index!==pageIndex){setPageIndex(index);setImageError(false);setImageReady(false)}}
  function choose(word:Word,extend:boolean){
    const anchor=focus[0];let ids=[word.id];
    if(extend&&page&&anchor){const a=page.words.findIndex(w=>w.id===anchor),b=page.words.findIndex(w=>w.id===word.id);if(a>=0)ids=page.words.slice(Math.min(a,b),Math.max(a,b)+1).map(w=>w.id)}
    setFocus(ids);setTerm(ids.map(id=>wordMap.get(id)?.text).join(' '));setMatches([]);setSearched(false);
  }
  async function find(){if(!term.trim())return;setBusy('search');setError('');try{const result=await api<{items:Match[]}>(`/documents/${d.id}/redaction-matches`,{method:'POST',body:JSON.stringify({...binding,term})});setMatches(result.items);setSearched(true);setJump(j=>j+1);setFocus(result.items[0]?.word_ids||[]);if(result.items[0])goPage(result.items[0].page-1)}catch(e){setError((e as Error).message)}finally{setBusy('')}}
  async function suggest(){setBusy('ai');setError('');try{setAnalysis(await api<Analysis>(`/documents/${d.id}/redaction-analysis`,{method:'POST',body:JSON.stringify({...binding,context,purpose})}));setDismissed([])}catch(e){setError((e as Error).message)}finally{setBusy('')}}
  async function prepare(){setBusy('preview');setError('');try{setPreview(await api<Preview>(`/documents/${d.id}/share-preview`,{method:'POST',body:JSON.stringify({...binding,word_ids:selected})}));setReviewed(false);setCompare(false);setStep('review')}catch(e){setError((e as Error).message)}finally{setBusy('')}}
  async function share(){setBusy('share');setError('');try{await api(`/documents/${d.id}/shares`,{method:'POST',body:JSON.stringify({recipient_airport_id:recipient,recipient_department:department||null,expires_at:expires,preview_id:preview?.preview_id,reviewed})});onShared()}catch(e){setError((e as Error).message);setBusy('')}}
  function showSuggestion(s:Suggestion){setJump(j=>j+1);setFocus(s.word_ids);setTerm(s.word_ids.map(id=>wordMap.get(id)?.text).join(' '));setMatches([]);const index=layout?.pages.findIndex(p=>p.words.some(w=>w.id===s.word_ids[0]));if(index!==undefined&&index>=0)goPage(index)}
  return <Modal title="Atelier de redactare" subtitle={d.title} onClose={onClose} wide>
    <div className="redaction-studio">
      <div className="studio-topbar"><div className="studio-steps"><span className={step==='edit'?'active':'done'}><span>{step==='edit'?'1':<Check size={13}/>}</span>Selectează</span><ArrowRight size={15}/><span className={step==='review'?'active':''}><span>2</span>Verifică și partajează</span></div><span className="studio-original"><ShieldCheck size={15}/>Original protejat · v{layout?.source_version||d.version}</span></div>
      {error&&<div className="studio-error"><ErrorMessage message={error}/></div>}
      {!layout?(!error&&<Loading/>):step==='edit'?<>
        <div className="studio-workspace">
          <nav className="studio-pages" aria-label="Paginile documentului">{layout.pages.map((p,i)=><button key={p.number} className={pageIndex===i?'current':''} onClick={()=>goPage(i)} aria-label={`Pagina ${p.number}`} aria-current={pageIndex===i?'page':undefined}><FileCheck2 size={24}/><span>{p.number}</span>{p.words.some(w=>selectedSet.has(w.id))&&<span className="page-dot"/>}</button>)}</nav>
          <section className="studio-canvas" aria-label="Document interactiv">
            <div className="canvas-toolbar"><span><MousePointer2 size={15}/>Selectează un cuvânt · Shift + clic pentru un fragment</span><div className="canvas-options"><button type="button" className="text-button" aria-pressed={textMode} onClick={()=>{setTextMode(!textMode);setImageReady(false)}}>{textMode?'Vezi PDF':'Mod text'}</button><span>{pageIndex+1} / {layout.pages.length}</span></div></div>
            {page?.method==='ocr'&&<p className="quiet-note">Selecții din OCR local. Verifică vizual conturul fiecărui fragment și copia finală.</p>}<div className="paper-scroll" ref={paperRef}>{textMode?<div className="studio-text-page"><h3>Pagina {pageIndex+1} · text selectabil</h3><p>Același document, cu selecții mai ușor de atins.</p><div>{page?.words.map(w=><button key={w.id} disabled={!!busy} className={`text-word ${selectedSet.has(w.id)?'redacted':''} ${focusSet.has(w.id)?'focused':''}`} aria-pressed={focusSet.has(w.id)} onClick={e=>choose(w,e.shiftKey)}>{w.text}</button>)}</div></div>:page&&<div className="studio-paper" style={{aspectRatio:`${page.width}/${page.height}`}}>
              <img draggable={false} alt={`Original, pagina ${page.number}`} src={fileUrl(`/api/documents/${d.id}/redaction-pages/${page.number}?source_version=${layout.source_version}&source_sha256=${layout.source_sha256}`)} onLoad={()=>{setImageReady(true);setImageError(false)}} onError={()=>setImageError(true)}/>
              {imageError?<div className="paper-notice">Pagina nu poate fi afișată. Redeschide editorul pentru a verifica versiunea.</div>:!imageReady?<div className="paper-notice"><LoaderCircle className="spin"/>Se încarcă pagina…</div>:page.words.map(w=><button key={w.id} type="button" disabled={!!busy} className={`pdf-word ${selectedSet.has(w.id)?'redacted':''} ${focusSet.has(w.id)?'focused':''}`} style={{left:`${w.rect[0]/page.width*100}%`,top:`${w.rect[1]/page.height*100}%`,width:`${(w.rect[2]-w.rect[0])/page.width*100}%`,height:`${(w.rect[3]-w.rect[1])/page.height*100}%`}} title={w.text} aria-label={`${selectedSet.has(w.id)?'Marcat pentru eliminare: ':'Selectează: '}${w.text}`} aria-pressed={focusSet.has(w.id)} onClick={e=>choose(w,e.shiftKey)}/>)}
            </div>}{!page?.words.length&&<p className="paper-empty">Această pagină nu are text selectabil. OCR nu a identificat text lizibil. Verifică pagina în original.</p>}</div>
            <div className="selection-bar"><div><strong>{focus.length?focus.map(id=>wordMap.get(id)?.text).join(' '):'Tu alegi ce rămâne privat.'}</strong><small>{focus.length?`${focus.length} ${focus.length===1?'cuvânt':'cuvinte'} în fragment`:'Selecțiile sunt reversibile până pregătești copia.'}</small></div>{focus.length>0&&<button className="button primary" disabled={!!busy} onClick={()=>selectedSet.has(focus[0])?changeSelection(selected.filter(id=>!focusSet.has(id))):add(focus)}>{selectedSet.has(focus[0])?<><RotateCcw size={15}/>Păstrează</>:<>Redactează doar aici</>}</button>}</div>
          </section>
          <aside className="studio-inspector">
            <section className="studio-find"><label htmlFor="redaction-search">Găsește și redactează</label><form onSubmit={e=>{e.preventDefault();void find()}}><input disabled={!!busy} id="redaction-search" placeholder="Nume, e-mail sau fragment…" maxLength={500} value={term} onChange={e=>{setTerm(e.target.value);setMatches([]);setFocus([]);setSearched(false)}}/><button className="icon-button" disabled={!!busy||!term.trim()} aria-label="Caută toate aparițiile"><Search size={18}/></button></form>{matches.length>0?<><div className="match-summary"><span>{matches.length} apariții</span><button className="text-button" disabled={!!busy} onClick={()=>add(matches.flatMap(m=>m.word_ids))}>Redactează toate</button></div><div className="match-list">{matches.map((m,i)=><button key={i} className={focus[0]===m.word_ids[0]?'active':''} onClick={()=>{setFocus(m.word_ids);setJump(j=>j+1);goPage(m.page-1)}}>#{i+1} · p. {m.page}</button>)}</div></>:term&&busy!=='search'&&<small>{searched?'Nicio apariție exactă în textul documentului.':'Apasă Enter pentru a căuta toate aparițiile.'}</small>}</section>
            <section className="studio-ai"><div className="ai-heading"><span className="luna-symbol"><Sparkles size={20}/></span><div><h3>Luna</h3><span>O a doua privire, cu temei.</span></div><span className="ai-label">AI</span></div>
              <label className="field">Scopul copiei<select disabled={!!busy} value={purpose} onChange={e=>{setPurpose(e.target.value);setAnalysis(undefined)}}><option>Schimb controlat cu aeroportul partener</option><option>Publicare pentru acces public</option><option>Model reutilizabil fără date de identificare</option></select></label>
              <label className="field">Context <small>Opțional</small><textarea disabled={!!busy} rows={3} maxLength={3000} value={context} onChange={e=>{setContext(e.target.value);setAnalysis(undefined)}} placeholder="Ex. Destinatarul are nevoie de procedură, dar nu de datele de contact personale."/></label>
              <button className="button primary full-width luna-action" disabled={!!busy||!layout.ai_available} onClick={suggest}>{busy==='ai'?<LoaderCircle size={17} className="spin"/>:<Sparkles size={17}/>} {busy==='ai'?'Luna citește documentul…':'Analizează cu Luna'}</button>
              <p className="ai-disclosure">{layout.ai_available?'Textul documentului și contextul sunt trimise către OpenAI numai la analiză. Tu decizi ce se elimină.':'Luna nu este conectată încă. Editorul manual este disponibil; cheia API se configurează pe server.'}</p>
            </section>
            {analysis&&<section className="studio-advice" aria-live="polite"><h3>{analysis.suggestions.length} {analysis.suggestions.length===1?'sugestie':'sugestii'} de verificat</h3><p>{analysis.summary}</p>{analysis.suggestions.map((s,i)=>{if(dismissed.includes(i))return null;const applied=s.word_ids.every(id=>selectedSet.has(id));return <article key={i} className={applied?'advice-card applied':'advice-card'}><button className="advice-excerpt" onClick={()=>showSuggestion(s)}>{s.word_ids.map(id=>wordMap.get(id)?.text).join(' ')}</button><span className="advice-category">{s.category}</span><p>{s.reason}</p><div className="legal-links">{s.legal_basis_ids.map(id=>{const basis=layout.legal_bases.find(b=>b.id===id);return basis&&<a key={id} href={basis.url} target="_blank" rel="noreferrer" title={basis.guidance}>{basis.label} ↗</a>})}</div>{s.caution&&<small>{s.caution}</small>}<div className="advice-actions"><button className="text-button" onClick={()=>{if(applied)changeSelection(selected.filter(id=>!s.word_ids.includes(id)));else add(s.word_ids)}}>{applied?<><Check size={14}/>Aplicată · anulează</>:'Aplică fragmentul'}</button><button className="text-button" onClick={()=>setDismissed([...dismissed,i])}>Ignoră</button></div></article>})}<p className="ai-disclosure">Referințe pentru evaluare umană, nu o decizie juridică automată.</p></section>}
          </aside>
        </div>
        <footer className="studio-footer"><div className="selection-total"><ShieldCheck size={18}/><strong>{selected.length}</strong> {selected.length===1?'cuvânt marcat':'cuvinte marcate'}<button className="icon-button" disabled={!history.length||!!busy} onClick={undo} aria-label="Anulează ultima selecție"><Undo2 size={17}/></button><button className="icon-button" disabled={!selected.length||!!busy} onClick={()=>changeSelection([])} aria-label="Șterge toate selecțiile"><Trash2 size={16}/></button></div><button className="button primary" disabled={!!busy||imageError} onClick={prepare}>{busy==='preview'?<LoaderCircle className="spin" size={17}/>:<Eye size={17}/>}Verifică copia<ArrowRight size={16}/></button></footer>
      </>:<div className="studio-review"><div className="review-document"><div className="review-toolbar"><button className="text-button" onClick={()=>{setStep('edit');setReviewed(false);setImageReady(false)}}><ArrowLeft size={15}/>Înapoi la selecții</button><a className="text-button" href={fileUrl(preview?.file_url||'')} target="_blank" rel="noreferrer">Deschide copia PDF ↗</a></div><div className="review-page-controls"><button className="icon-button" aria-label="Pagina precedentă" disabled={pageIndex===0} onClick={()=>goPage(pageIndex-1)}><ArrowLeft size={16}/></button><span>Pagina {pageIndex+1} din {layout.pages.length}</span><button className="icon-button" aria-label="Pagina următoare" disabled={pageIndex===layout.pages.length-1} onClick={()=>goPage(pageIndex+1)}><ArrowRight size={16}/></button><button className="text-button" aria-pressed={compare} onClick={()=>setCompare(!compare)}>{compare?'Vezi copia redactată':'Compară cu originalul'}</button></div><div className="review-image-scroll"><span className={compare?'compare-label original':'compare-label'}>{compare?'Original · informații neeliminate':'Copie · conținut eliminat efectiv'}</span><img alt={`${compare?'Original':'Copie redactată'}, pagina ${pageIndex+1}`} src={fileUrl(compare?`/api/documents/${d.id}/redaction-pages/${pageIndex+1}?source_version=${layout.source_version}&source_sha256=${layout.source_sha256}`:`/api/share-previews/${preview?.preview_id}/pages/${pageIndex+1}`)} onError={()=>setError('Pagina nu poate fi afișată. Verifică PDF-ul înainte de partajare.')}/></div></div><aside className="review-controls"><span className="review-icon"><ShieldCheck size={30}/></span><h3>O ultimă privire.</h3><p>{selected.length} {selected.length===1?'cuvânt eliminat':'cuvinte eliminate'} din copia PDF. Verifică fiecare pagină, inclusiv imaginile.</p><label className="field">Destinatar<select value={recipient} disabled><option value={recipient}>{recipient==='carpati'?'Aeroportul Carpați':'Aeroportul Dunărea'}</option></select></label><label className="field">Acces pentru<select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Avizatorii și directorii autorizați</option>{['Achiziții','Tehnic','Financiar','Operațiuni','Resurse umane','Conformitate'].map(dep=><option key={dep} value={dep}>Doar {dep}</option>)}</select></label><label className="field">Acces până la<input type="date" min="2026-10-31" value={expires} onChange={e=>setExpires(e.target.value)}/></label><label className="checkbox-field"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>Am verificat integral copia și confirm că poate fi partajată.</span></label><button className="button primary full-width" disabled={!reviewed||!expires||!!busy} onClick={share}>{busy==='share'?<LoaderCircle className="spin" size={17}/>:<ShieldCheck size={17}/>}Partajează copia</button><p className="quiet-note">Accesul poate fi revocat. Copiile deja descărcate nu pot fi retrase. Semnătura originalului nu se transferă.</p></aside></div>}
    </div>
  </Modal>
}
