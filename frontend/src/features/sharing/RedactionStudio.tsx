import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, EyeOff, LoaderCircle, MousePointer2, Search, ShieldCheck, Sparkles, Undo2, X } from 'lucide-react';
import { api, fileUrl } from '@/services/api-client';
import { ErrorMessage, Loading, Modal } from '@/components/ui';
import type { DocumentRecord, Session } from '@/types';
import type { Analysis, Layout, Match, Preview, Suggestion } from './redaction-types';
import { RedactionCanvas } from './RedactionCanvas';
import './redaction.css';

export function RedactionStudio({ document: doc, onClose, onShared }: {
  document: DocumentRecord; onClose: () => void; onShared: () => void;
}) {
  const [layout, setLayout] = useState<Layout>();
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [pageIndex, setPageIndex] = useState(0);
  const [textMode, setTextMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<string[][]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [finding, setFinding] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState('');
  const lookup = useRef<AbortController | null>(null);
  const [context, setContext] = useState('');
  const [purpose, setPurpose] = useState('Schimb controlat cu aeroportul partener');
  const [analysis, setAnalysis] = useState<Analysis>();
  const [advice, setAdvice] = useState<Suggestion>();
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [aiError, setAiError] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [compare, setCompare] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [recipient, setRecipient] = useState('carpati');
  const [department, setDepartment] = useState('');
  const [expires, setExpires] = useState('2026-12-01');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let active = true; let timer: number | undefined;
    async function load() {
      try {
        const extraction = await api<{ status: string; error?: string }>(`/documents/${doc.id}/extraction`);
        if (!active) return;
        if (['queued', 'processing'].includes(extraction.status)) { timer = window.setTimeout(load, 1500); return; }
        if (extraction.status === 'failed') throw new Error(extraction.error || 'Reîncearcă extragerea textului din informațiile documentului.');
        const [data, session] = await Promise.all([api<Layout>(`/documents/${doc.id}/redaction-layout`), api<Session>('/session')]);
        if (active) { setLayout(data); setRecipient(session.current_user?.airport_id === 'carpati' ? 'dunarea' : 'carpati'); }
      } catch (e) { if (active) setError((e as Error).message); }
    }
    void load();
    return () => { active = false; window.clearTimeout(timer); lookup.current?.abort(); };
  }, [doc.id]);

  const wordMap = useMemo(() => new Map(layout?.pages.flatMap(p => p.words).map(w => [w.id, w]) || []), [layout]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const page = layout?.pages[pageIndex];
  const binding = layout ? { source_version: layout.source_version, source_sha256: layout.source_sha256 } : {};
  const locked = busy === 'preview' || busy === 'share';
  const phrase = focus.map(id => wordMap.get(id)?.text).join(' ');
  const matchIndex = matches.findIndex(m => m.word_ids.join('|') === focus.join('|'));
  const targetIds = scope === 'all' ? [...new Set(matches.flatMap(m => m.word_ids))] : focus;
  const allHidden = targetIds.length > 0 && targetIds.every(id => selectedSet.has(id));
  const hiddenGroups = useMemo(() => {
    const groups: Match[] = [];
    for (const p of layout?.pages || []) {
      let current: Match | undefined;
      for (const w of p.words) {
        if (selectedSet.has(w.id)) {
          if (!current) { current = { page: p.number, word_ids: [] }; groups.push(current); }
          current.word_ids.push(w.id);
        } else current = undefined;
      }
    }
    return groups;
  }, [layout, selectedSet]);

  function goPage(index: number) { if (index !== pageIndex) { setPageIndex(index); setImageError(false); } }
  function clearFocus() {
    lookup.current?.abort(); setFocus([]); setMatches([]); setAdvice(undefined);
    setQuery(''); setScope('one'); setFinding(false); setSelectionNotice('');
  }
  function browsePage(index: number) { if (step === 'edit') clearFocus(); goPage(index); }
  async function inspect(term: string, ids?: string[], suggestion?: Suggestion) {
    lookup.current?.abort();
    const request = new AbortController(); lookup.current = request;
    setFocus(ids || []); setQuery(term); setScope('one'); setMatches([]);
    setAdvice(suggestion); setSelectionNotice(''); setFinding(true);
    if (ids?.[0]) {
      const index = layout?.pages.findIndex(p => p.words.some(w => w.id === ids[0]));
      if (index !== undefined && index >= 0) goPage(index);
    }
    if (term.length > 500) { setFinding(false); setSelectionNotice('Acest fragment poate fi ascuns doar aici.'); return; }
    try {
      const result = await api<{ items: Match[] }>(`/documents/${doc.id}/redaction-matches`, {
        method: 'POST', body: JSON.stringify({ ...binding, term }), signal: request.signal,
      });
      if (request.signal.aborted) return;
      setMatches(result.items);
      if (!ids) {
        setFocus(result.items[0]?.word_ids || []);
        if (result.items[0]) goPage(result.items[0].page - 1);
      }
      if (!result.items.length) setSelectionNotice('Nicio apariție exactă. Încearcă un fragment mai scurt.');
    } catch (e) {
      if (!request.signal.aborted) setSelectionNotice((e as Error).message);
    } finally { if (!request.signal.aborted) setFinding(false); }
  }
  function inspectWords(ids: string[], suggestion?: Suggestion) {
    void inspect(ids.map(id => wordMap.get(id)?.text).join(' '), ids, suggestion);
  }
  function navigateMatch(index: number) {
    const match = matches[index]; if (!match) return;
    setFocus(match.word_ids); goPage(match.page - 1);
  }
  function changeSelection(ids: string[]) {
    if (locked) return;
    const next = [...new Set(ids)];
    if (next.length === selected.length && next.every(id => selectedSet.has(id))) return;
    setHistory(h => [...h.slice(-29), selected]); setSelected(next); setPreview(undefined); setReviewed(false);
  }
  function applySelection() {
    const count = scope === 'all' ? matches.length : 1;
    const targets = new Set(targetIds);
    changeSelection(allHidden ? selected.filter(id => !targets.has(id)) : [...selected, ...targetIds]);
    setAnnouncement(`${count === 1 ? 'Fragment' : `${count} apariții`} ${allHidden ? 'restabilit' + (count === 1 ? '' : 'e') : 'ascuns' + (count === 1 ? '' : 'e')} în copie.`);
  }
  function undo() {
    const last = history.at(-1);
    if (last && !locked) { setSelected(last); setHistory(h => h.slice(0, -1)); setPreview(undefined); setReviewed(false); setAnnouncement('Ultima modificare a fost anulată.'); }
  }
  async function suggest() {
    setBusy('ai'); setAiError('');
    try { setAnalysis(await api<Analysis>(`/documents/${doc.id}/redaction-analysis`, { method: 'POST', body: JSON.stringify({ ...binding, context, purpose }) })); setDismissed([]); }
    catch (e) { setAiError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function prepare() {
    setBusy('preview'); setError('');
    try {
      setPreview(await api<Preview>(`/documents/${doc.id}/share-preview`, { method: 'POST', body: JSON.stringify({ ...binding, word_ids: selected }) }));
      setReviewed(false); setCompare(false); setPageIndex(0); setStep('review');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function share() {
    setBusy('share'); setError('');
    try {
      await api(`/documents/${doc.id}/shares`, { method: 'POST', body: JSON.stringify({ recipient_airport_id: recipient, recipient_department: department || null, expires_at: expires, preview_id: preview?.preview_id, reviewed }) });
      onShared();
    } catch (e) { setError((e as Error).message); setBusy(''); }
  }
  const pageNavigation = layout && <div className="studio-pagination">
    <button className="icon-button" aria-label="Pagina precedentă" disabled={!pageIndex || locked} onClick={() => browsePage(pageIndex - 1)}><ChevronLeft size={17} /></button>
    <select aria-label="Pagina documentului" disabled={locked} value={pageIndex} onChange={e => browsePage(Number(e.target.value))}>
      {layout.pages.map((p, i) => <option key={p.number} value={i}>Pagina {p.number} din {layout.pages.length}</option>)}
    </select>
    <button className="icon-button" aria-label="Pagina următoare" disabled={pageIndex === layout.pages.length - 1 || locked} onClick={() => browsePage(pageIndex + 1)}><ChevronRight size={17} /></button>
  </div>;

  return <Modal title="Pregătește copia" subtitle={doc.title} onClose={onClose} wide>
    <div className="redaction-studio">
      <div className="studio-topbar">
        <div className="studio-steps"><span className={step === 'edit' ? 'active' : 'done'}><span>{step === 'edit' ? '1' : <Check size={12} />}</span>Anonimizează</span><ChevronRight size={14} /><span className={step === 'review' ? 'active' : ''}><span>2</span>Verifică și partajează</span></div>
        <span className="studio-original"><ShieldCheck size={14} />Originalul rămâne intact</span>
      </div>
      {error && <div className="studio-error"><ErrorMessage message={error} /></div>}
      {!layout ? (!error && <Loading />) : step === 'edit' ? <>
        <div className="studio-workspace">
          <section className="studio-canvas" aria-label="Document interactiv">
            <div className="canvas-toolbar">
              <form className="studio-search" onSubmit={e => { e.preventDefault(); if (query.trim()) void inspect(query.trim()); }}>
                <Search size={16} /><input aria-label="Caută text în document" placeholder="Caută un nume sau un fragment…" maxLength={500} value={query} disabled={locked} onChange={e => { const value = e.target.value; clearFocus(); setQuery(value); }} />
                <button className="icon-button" aria-label="Caută" disabled={!query.trim() || locked}>{finding ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />}</button>
              </form>
              {pageNavigation}
              <select className="studio-view" aria-label="Vizualizare document" disabled={locked} value={textMode ? 'text' : 'pdf'} onChange={e => setTextMode(e.target.value === 'text')}><option value="pdf">PDF</option><option value="text">Text selectabil</option></select>
            </div>
            {page && <RedactionCanvas key={page.number} page={page} src={fileUrl(`/api/documents/${doc.id}/redaction-pages/${page.number}?source_version=${layout.source_version}&source_sha256=${layout.source_sha256}`)} hidden={selectedSet} focused={focus} textMode={textMode} locked={locked} onSelect={inspectWords} onImageError={setImageError} />}
          </section>
          <aside className="studio-inspector" aria-label="Selecție și anonimizare">
            <section className="selection-panel" aria-label="Fragment selectat">
              {focus.length ? <>
                <div className="selection-heading"><h3>{advice ? 'Sugestie Luna' : 'Fragment selectat'}</h3><button className="icon-button" aria-label="Închide selecția" disabled={locked} onClick={clearFocus}><X size={16} /></button></div>
                <blockquote>{phrase}</blockquote>
                <div className="occurrence-navigation">
                  <span>{finding ? 'Căutăm aparițiile…' : matches.length > 1 ? `Apariția ${matchIndex + 1 || 1} din ${matches.length}` : matches.length === 1 ? 'O singură apariție' : 'Fragment selectat'} · p. {Number(focus[0].split('-')[0].slice(1))}</span>
                  {matches.length > 1 && <div><button className="icon-button" aria-label="Apariția precedentă" disabled={locked || matchIndex <= 0} onClick={() => navigateMatch(matchIndex - 1)}><ChevronLeft size={16} /></button><button className="icon-button" aria-label="Apariția următoare" disabled={locked || matchIndex >= matches.length - 1} onClick={() => navigateMatch(matchIndex + 1)}><ChevronRight size={16} /></button></div>}
                </div>
                {matches.length > 1 && <fieldset className="redaction-scope"><legend>Unde aplici modificarea?</legend>
                  <label><input type="radio" name="redaction-scope" disabled={locked} checked={scope === 'one'} onChange={() => setScope('one')} /><span>Doar această apariție</span></label>
                  <label><input type="radio" name="redaction-scope" disabled={locked} checked={scope === 'all'} onChange={() => setScope('all')} /><span>Toate cele {matches.length} apariții</span></label>
                </fieldset>}
                <button className={`button ${allHidden ? 'secondary' : 'primary'} full-width apply-redaction`} disabled={locked || !targetIds.length || (scope === 'all' && finding)} onClick={applySelection}>
                  {allHidden ? <Undo2 size={16} /> : <EyeOff size={16} />}
                  {allHidden ? 'Restabilește' : 'Ascunde'} {scope === 'all' ? `toate cele ${matches.length} apariții` : 'această apariție'}
                </button>
                {advice && <details className="advice-reason"><summary>De ce sugerează Luna acest fragment?</summary><p>{advice.reason}</p><div className="legal-links">{advice.legal_basis_ids.map(id => { const basis = layout.legal_bases.find(b => b.id === id); return basis && <a key={id} href={basis.url} target="_blank" rel="noreferrer" title={basis.guidance}>{basis.label} ↗</a>; })}</div>{advice.caution && <p>{advice.caution}</p>}<button className="text-button" disabled={locked} onClick={() => { const index = analysis?.suggestions.indexOf(advice); if (index !== undefined && index >= 0) setDismissed([...dismissed, index]); clearFocus(); }}>Ignoră sugestia</button></details>}
              </> : <div className="selection-empty"><span><MousePointer2 size={22} /></span><h3>Ce vrei să ascunzi?</h3><p>Selectează text în document sau caută un fragment.</p></div>}
              {finding && !focus.length && <p className="selection-notice" role="status">Căutăm în document…</p>}
              {selectionNotice && <p className="selection-notice" role="status">{selectionNotice}</p>}
            </section>
            {selected.length > 0 && <details className="studio-marked"><summary>Fragmente ascunse <span>{hiddenGroups.length}</span></summary><div>{hiddenGroups.map((group, i) => <button key={i} className="marked-fragment" disabled={locked} onClick={() => inspectWords(group.word_ids)}><span>{group.word_ids.map(id => wordMap.get(id)?.text).join(' ')}</span><small>p. {group.page}</small></button>)}</div><button className="text-button" disabled={locked} onClick={() => { changeSelection([]); setAnnouncement('Toate fragmentele au fost restabilite.'); }}>Restabilește tot</button></details>}
            <details className="studio-ai"><summary><Sparkles size={17} /><span>Ajutor de la Luna</span>{analysis && <small>{analysis.suggestions.filter((_, i) => !dismissed.includes(i)).length} sugestii</small>}</summary>
              <div className="studio-ai-content"><p>Luna propune. Tu alegi ce ascunzi.</p>
                <details className="ai-context"><summary>Scop și context opțional</summary>
                  <label className="field">Scopul copiei<select disabled={busy === 'ai'} value={purpose} onChange={e => { setPurpose(e.target.value); setAnalysis(undefined); setAdvice(undefined); }}><option>Schimb controlat cu aeroportul partener</option><option>Publicare pentru acces public</option><option>Model reutilizabil fără date de identificare</option></select></label>
                  <label className="field">Context<textarea disabled={busy === 'ai'} rows={3} maxLength={3000} value={context} onChange={e => { setContext(e.target.value); setAnalysis(undefined); setAdvice(undefined); }} placeholder="Ce informații îi sunt necesare destinatarului?" /></label>
                </details>
                <button className="button secondary full-width" disabled={!!busy || !layout.ai_available} onClick={suggest}>{busy === 'ai' ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{busy === 'ai' ? 'Luna analizează…' : analysis ? 'Analizează din nou' : 'Cere sugestii'}</button>
                <p className="ai-disclosure">{layout.ai_available ? 'La analiză, textul și contextul sunt trimise către OpenAI.' : 'Luna nu este conectată. Poți continua manual.'}</p>
                {aiError && <p className="selection-notice" role="alert">{aiError}</p>}
                {analysis && <div className="studio-advice">{!analysis.suggestions.length && <p>Nicio sugestie de anonimizare.</p>}<details className="advice-reason"><summary>Ce a observat Luna</summary><p>{analysis.summary}</p></details>{analysis.suggestions.map((s, i) => !dismissed.includes(i) && <button key={i} className={`advice-choice ${advice === s ? 'active' : ''}`} disabled={locked} onClick={() => inspectWords(s.word_ids, s)}><span>{s.word_ids.map(id => wordMap.get(id)?.text).join(' ')}</span><small>{s.category} · p. {Number(s.word_ids[0].split('-')[0].slice(1))}{s.word_ids.every(id => selectedSet.has(id)) ? ' · ascuns' : ''}</small><ChevronRight size={15} /></button>)}</div>}
              </div>
            </details>
          </aside>
        </div>
        <footer className="studio-footer"><div className="selection-total"><span>{selected.length ? `${selected.length} cuvinte ascunse` : 'Nicio modificare încă'}</span>{history.length > 0 && <button className="text-button" disabled={locked} onClick={undo}><Undo2 size={15} />Anulează ultima</button>}</div><button className="button primary" disabled={!!busy || imageError} onClick={prepare}>{busy === 'preview' ? <LoaderCircle className="spin" size={17} /> : null}Verifică copia<ArrowRight size={16} /></button></footer>
      </> : <>
        <div className="studio-review"><section className="review-document" aria-label="Verifică documentul">
          <div className="review-toolbar"><button className="text-button" disabled={locked} onClick={() => { setStep('edit'); setReviewed(false); setImageError(false); }}><ArrowLeft size={15} />Înapoi la editare</button>{pageNavigation}<label className="compare-toggle"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />Arată originalul</label></div>
          <div className="review-image-scroll"><span className={`compare-label ${compare ? 'original' : ''}`}>{compare ? 'Original · datele sunt vizibile' : 'Copia pregătită pentru partajare'}</span><img alt={`${compare ? 'Original' : 'Copie anonimizată'}, pagina ${pageIndex + 1}`} src={fileUrl(compare ? `/api/documents/${doc.id}/redaction-pages/${pageIndex + 1}?source_version=${layout.source_version}&source_sha256=${layout.source_sha256}` : `/api/share-previews/${preview?.preview_id}/pages/${pageIndex + 1}`)} onError={() => { setImageError(true); setError('Pagina nu poate fi afișată. Deschide copia PDF pentru verificare.'); }} onLoad={() => setImageError(false)} /></div>
        </section><aside className="review-controls"><h3>Verifică înainte de partajare</h3><p>{selected.length ? `${selected.length} cuvinte eliminate din copie.` : 'Copia păstrează tot conținutul.'} Parcurge toate paginile, inclusiv imaginile.</p><a className="text-button" href={fileUrl(preview?.file_url || '')} target="_blank" rel="noreferrer">Deschide copia PDF ↗</a>
          <div className="share-recipient"><span>Destinatar</span><strong>{recipient === 'carpati' ? 'Aeroportul Carpați' : 'Aeroportul Dunărea'}</strong></div>
          <label className="field">Cine poate accesa<select disabled={locked} value={department} onChange={e => setDepartment(e.target.value)}><option value="">Avizatorii și directorii autorizați</option>{['Achiziții', 'Tehnic', 'Financiar', 'Operațiuni', 'Resurse umane', 'Conformitate'].map(dep => <option key={dep} value={dep}>Doar {dep}</option>)}</select></label>
          <label className="field">Acces până la<input disabled={locked} type="date" min="2026-10-31" value={expires} onChange={e => setExpires(e.target.value)} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={reviewed} disabled={locked} onChange={e => setReviewed(e.target.checked)} /><span>Am verificat copia și confirm că poate fi partajată.</span></label>
          <p className="quiet-note">Originalul rămâne intact. Accesul poate fi revocat; copiile deja descărcate nu se pot retrage.</p>
        </aside></div>
        <footer className="studio-footer"><span className="review-status"><ShieldCheck size={16} />{reviewed ? 'Copie verificată' : 'Confirmă verificarea copiei'}</span><button className="button primary" disabled={!reviewed || !expires || !!busy || imageError} onClick={share}>{busy === 'share' ? <LoaderCircle className="spin" size={16} /> : null}Partajează copia<ArrowRight size={16} /></button></footer>
      </>}
      <span className="studio-sr-only" role="status">{announcement}</span>
    </div>
  </Modal>;
}
