import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp, ArrowUpRight, X } from 'lucide-react';
import { api } from '@/services/api-client';
import { ErrorMessage, Loading } from '@/components/ui';
import { date } from '@/utils/format';
import { readableText } from '@/utils/text';
import type { DocumentRecord } from '@/types';

interface Answer { answer: string; sources: Array<{ id: string; title: string; number: string; page: number | null; version: number; excerpt: string }>; reference_date: string; notice: string }
export function AssistantPage({ documentId, onOpen }: { documentId?: string; onOpen: (id: string) => void }) {
  const [context, setContext] = useState<DocumentRecord>(), [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Array<{ question: string; answer: Answer }>>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [contextError, setContextError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (documentId) api<DocumentRecord>('/documents/' + encodeURIComponent(documentId), { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setContext(d); }).catch(e => { if (!controller.signal.aborted) setContextError(e.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [documentId]);
  async function ask(value = question) {
    if (busy || value.trim().length < 2 || (documentId && !context)) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const answer = await api<Answer>('/assistant', { method: 'POST', signal: controller.signal, body: JSON.stringify({ question: value.trim(), ...(context ? { document_id: context.id, version: context.version } : {}) }) });
      if (!controller.signal.aborted) { setTurns(t => [...t, { question: value, answer }]); setQuestion(''); }
    } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="assistant-workspace workspace-content"><div className="page-heading"><div><div className="eyebrow">RĂSPUNSURI CU SURSE</div><h1>Întreabă FlyLeaf</h1><p>Caută informații și verifică termenele din documentele validate.</p></div></div>
    <div className="assistant-scope"><Sparkles size={20}/><div><small>Surse pentru această conversație</small><strong>{context ? readableText(context.title) + ' · v' + context.version : documentId ? 'Se verifică accesul la document…' : 'Toate documentele validate la care ai acces'}</strong></div>{documentId && <button className="icon-button" aria-label="Elimină documentul din context" onClick={() => { location.hash = 'assistant'; }}><X size={18}/></button>}</div>
    {contextError ? <ErrorMessage message={contextError}/> : documentId && !context ? <Loading/> : <>
      {!turns.length && <div className="panel assistant-start"><Sparkles size={30}/><h2>De unde începem?</h2><p>{context ? 'Întrebările folosesc numai această versiune a documentului.' : 'Alege o întrebare sau caută un document după număr, furnizor ori subiect.'}</p><div className="assistant-suggestions">{(context ? ['Rezumă acest document', 'Care este furnizorul acestui document?', 'Care este termenul acestui document?'] : ['Câte contracte au expirat?', 'Ce contracte expiră în următoarele 30 de zile?', 'Câte documente sunt în aprobare?']).map(q => <button disabled={busy} key={q} onClick={() => ask(q)}>{q}<ArrowUpRight size={15}/></button>)}</div></div>}
      <div className="assistant-conversation" aria-live="polite">{turns.map((turn, i) => <article key={i}><div className="assistant-question">{turn.question}</div><div className="panel assistant-response"><p>{readableText(turn.answer.answer)}</p><small>Data de referință: {date(turn.answer.reference_date)}</small>{turn.answer.sources.length > 0 && <div className="lookup-results">{turn.answer.sources.map(s => <button key={s.id} onClick={() => onOpen(s.id)}><span><strong>{readableText(s.title)}</strong><small>{s.number} · v{s.version} · {s.page ? 'pagina ' + s.page : 'Metadate validate'}</small></span><ArrowUpRight size={16}/></button>)}</div>}<p className="workspace-note">{turn.answer.notice}</p></div></article>)}</div>
      {busy && <Loading/>}{error && <ErrorMessage message={error}/>}
      <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void ask(); }}><label htmlFor="flyleaf-question">Întrebarea ta</label><div><textarea id="flyleaf-question" maxLength={1000} rows={3} placeholder="Ce ai vrea să afli?" value={question} onChange={e => setQuestion(e.target.value)}/><button className="button primary" disabled={busy || question.trim().length < 2}><ArrowUp size={18}/>Trimite</button></div><small>Fiecare întrebare consultă sursele selectate. Pentru o explicație nouă, include subiectul în întrebare.</small></form>
    </>}
  </div>;
}
