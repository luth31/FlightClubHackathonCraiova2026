import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, LoaderCircle } from 'lucide-react';
import { api } from '@/services/api-client';
import type { DocumentRecord } from '@/types';

interface ExtractionPage {
  source_version: number; status: string; page_count: number;
  page?: { number: number; text: string; method: string; review_required: boolean };
}

export function ExtractedText({ doc, canReadText, onRetry }: {
  doc: DocumentRecord; canReadText: boolean; onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExtractionPage>();
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const pending = ['queued', 'processing'].includes(doc.extraction_status || '');
  useEffect(() => { setPage(1); setData(undefined); }, [doc.id, doc.version]);
  useEffect(() => {
    if (!open || pending || !canReadText || doc.extraction_status !== 'ready') return;
    let active = true;
    setData(undefined); setError('');
    api<ExtractionPage>(`/documents/${doc.id}/extraction?page=${page}`)
      .then(d => { if (active && d.source_version === doc.version) setData(d); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [open, pending, canReadText, doc.id, doc.version, doc.extraction_status, page]);
  async function retry() {
    setRetrying(true); setError('');
    try { await api(`/documents/${doc.id}/extraction/retry`, { method: 'POST' }); onRetry(); }
    catch (e) { setError((e as Error).message); }
    finally { setRetrying(false); }
  }
  return <section className="extracted-text">
    {pending ? <p className="extraction-progress" role="status"><LoaderCircle size={16} className="spin" />
      {doc.extraction_status === 'queued' ? 'Documentul așteaptă extragerea textului.' : 'Extragem textul local…'}
      <small>Poți continua lucrul. Informațiile apar automat.</small>
    </p> : doc.extraction_status === 'failed' ? <div role="status">
      <p>{doc.extraction?.error || 'Textul nu a putut fi extras.'}</p>
      {doc.permissions?.can_edit && <button className="text-button" disabled={retrying} onClick={retry}>Reîncearcă extragerea</button>}
    </div> : doc.extraction_status === 'ready' && canReadText ? <>
      <button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}><FileText size={15} />
        {open ? 'Ascunde textul extras' : 'Vezi textul extras'}
      </button>
      {open && <div className="extracted-text-body">
        {!data && !error ? <LoaderCircle size={16} className="spin" /> : data?.page && <>
          <div className="extracted-text-pagination">
            <button className="icon-button" aria-label="Pagina anterioară a textului" disabled={page <= 1} onClick={() => setPage(page-1)}><ChevronLeft size={16} /></button>
            <span>Pagina {page} din {data.page_count} · {data.page.method === 'ocr' ? 'OCR local' : 'Text digital'}</span>
            <button className="icon-button" aria-label="Pagina următoare a textului" disabled={page >= data.page_count} onClick={() => setPage(page+1)}><ChevronRight size={16} /></button>
          </div>
          {data.page.review_required && <p className="extraction-note">Text recunoscut din scanare. Verifică numele, cifrele și conturile în original.</p>}
          <pre>{data.page.text || 'Niciun text lizibil pe această pagină.'}</pre>
        </>}
      </div>}
    </> : null}
    {error && <p role="alert">{error}</p>}
  </section>;
}
