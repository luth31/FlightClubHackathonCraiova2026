import {t,useLanguage} from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { api } from '@/services/api-client';
import { Modal, Loading, ErrorMessage, Empty } from '@/components/ui';
import { readableText } from '@/utils/text';
import type { DocumentRecord } from '@/types';

export function QuickSearch({ onClose, onOpen, onAll }: { onClose: () => void; onOpen: (id: string) => void; onAll: (q: string) => void }) {
  useLanguage();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const [items, setItems] = useState<DocumentRecord[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setError(''); setBusy(!!query.trim());
    if (!query.trim()) return () => controller.abort();
    const timer = setTimeout(() => {
      api<{ items: DocumentRecord[] }>(`/documents?q=${encodeURIComponent(query.trim())}&limit=8`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setItems(data.items); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <Modal title={t("Caută documente")} subtitle={t("În toate documentele la care ai acces, din orice pagină.")} onClose={onClose} initialFocusRef={input}>
    <div className="quick-lookup">
      <form onSubmit={e => { e.preventDefault(); onAll(query); }}>
        <label className="search-input"><Search size={18}/><input ref={input} maxLength={200} aria-label={t("Caută în toate documentele")} placeholder={t("Titlu, număr, furnizor sau echipament…")} value={query} onChange={e => setQuery(e.target.value)}/></label>
      </form>
      {error ? <ErrorMessage message={error}/> : busy ? <Loading/> : items.length ? <div className="lookup-results">{items.map(d => <button key={d.id} onClick={() => onOpen(d.id)}><span><strong>{readableText(d.title)}</strong><small>{readableText(d.number)} · {d.category} {t("· v")}{d.version}</small></span><ArrowUpRight size={16}/></button>)}</div> : <Empty title={query ? t("Niciun rezultat") : t("Găsește documentul potrivit")} message={query ? t("Încearcă alt număr, furnizor sau titlu.") : t("Căutarea include documentele autorizate, indiferent de filtrele paginii curente.")}/>}
      <button className="button secondary" onClick={() => onAll(query)}>{t("Vezi toate rezultatele în Documente")}{' '}<ArrowUpRight size={16}/></button>
    </div>
  </Modal>;
}
