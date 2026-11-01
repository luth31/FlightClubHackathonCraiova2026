import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { PdfPage, Word } from './redaction-types';

/** Every input method returns the same word IDs to the one selection panel. */
export function RedactionCanvas({ page, src, hidden, focused, textMode, locked, onSelect, onImageError }: {
  page: PdfPage; src: string; hidden: Set<string>; focused: string[]; textMode: boolean;
  locked: boolean; onSelect: (ids: string[]) => void; onImageError: (error: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadedSrc, setLoadedSrc] = useState('');
  const [failedSrc, setFailedSrc] = useState('');
  const [dragIds, setDragIds] = useState<string[]>();
  const drag = useRef<{ anchor: string; ids: string[]; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const focus = new Set(dragIds || focused);

  useEffect(() => {
    if (!drag.current && (textMode || loadedSrc === src)) {
      const target = scrollRef.current?.querySelector<HTMLElement>('.focused');
      // Scroll the document surface, not the whole dialog (especially on phones).
      if (target && scrollRef.current) {
        const viewport = scrollRef.current.getBoundingClientRect(), rect = target.getBoundingClientRect();
        if (rect.top < viewport.top || rect.bottom > viewport.bottom)
          scrollRef.current.scrollBy({ top: rect.top - viewport.top - viewport.height / 3, behavior: 'smooth' });
      }
    }
  }, [focused, loadedSrc, src, textMode]);

  function range(anchor: string, end: string) {
    const a = page.words.findIndex(w => w.id === anchor), b = page.words.findIndex(w => w.id === end);
    return a < 0 || b < 0 ? [end] : page.words.slice(Math.min(a, b), Math.max(a, b) + 1).map(w => w.id);
  }
  function pointerDown(e: PointerEvent<HTMLButtonElement>, word: Word) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || locked) return;
    drag.current = { anchor: e.shiftKey && focused[0] ? focused[0] : word.id, ids: [word.id], moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !e.buttons) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-word-id]');
    if (!target || !scrollRef.current?.contains(target)) return;
    const ids = range(drag.current.anchor, target.dataset.wordId!);
    if (ids.length > 1 || drag.current.moved) {
      drag.current = { ...drag.current, ids, moved: true };
      setDragIds(ids);
    }
  }
  function pointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if (drag.current.moved) { onSelect(drag.current.ids); suppressClick.current = true; }
    drag.current = null; setDragIds(undefined);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function wordButton(word: Word) {
    return <button key={word.id} type="button" data-word-id={word.id} disabled={locked} tabIndex={textMode ? 0 : -1}
      className={`${textMode ? 'text-word' : 'pdf-word'} ${hidden.has(word.id) ? 'redacted' : ''} ${focus.has(word.id) ? 'focused' : ''}`}
      style={textMode ? undefined : { left: `${word.rect[0] / page.width * 100}%`, top: `${word.rect[1] / page.height * 100}%`, width: `${(word.rect[2] - word.rect[0]) / page.width * 100}%`, height: `${(word.rect[3] - word.rect[1]) / page.height * 100}%` }}
      title={word.text} aria-label={`${hidden.has(word.id) ? 'Ascuns: ' : 'Selectează: '}${word.text}`} aria-pressed={focus.has(word.id)}
      onPointerDown={e => pointerDown(e, word)} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={() => { drag.current = null; setDragIds(undefined); }}
      onClick={e => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        onSelect(e.shiftKey && focused[0] ? range(focused[0], word.id) : [word.id]);
      }}>{textMode ? word.text : null}</button>;
  }
  return <div className="paper-scroll" ref={scrollRef}>
    {page.method === 'ocr' && <p className="ocr-note">Text recunoscut prin OCR · verifică fragmentele în copie.</p>}
    {textMode ? <div className="studio-text-page"><div>{page.words.map(wordButton)}</div></div> :
      <div className="studio-paper" style={{ aspectRatio: `${page.width}/${page.height}` }}>
        <img draggable={false} alt={`Original, pagina ${page.number}`} src={src}
          onLoad={() => { setLoadedSrc(src); setFailedSrc(''); onImageError(false); }}
          onError={() => { setFailedSrc(src); onImageError(true); }} />
        {failedSrc === src ? <div className="paper-notice">Pagina nu poate fi afișată. Redeschide documentul pentru a reîncerca.</div> :
          loadedSrc !== src ? <div className="paper-notice"><LoaderCircle className="spin" size={20} />Se încarcă pagina…</div> : page.words.map(wordButton)}
      </div>}
    {!page.words.length && <p className="paper-empty">Nu există text selectabil pe această pagină. Verifică imaginile în original.</p>}
  </div>;
}
