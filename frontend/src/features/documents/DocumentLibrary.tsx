import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, Download, X } from "lucide-react";
import { api, download } from "@/services/api-client";
import { Loading, ErrorMessage } from "@/components/ui";
import { DocumentTable } from "./DocumentTable";
import type { DocumentRecord } from "@/types";
export function DocumentLibrary({
  onOpen,
  onUpload,
  notify,
  initialFilter = "",
  revision,
}: {
  onOpen: (id: string) => void;
  onUpload: () => void;
  notify: (s: string) => void;
  initialFilter?: string;
  revision: number;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(initialFilter),
    [category, setCategory] = useState(""),
    [data, setData] = useState<{
      items: DocumentRecord[];
      total: number;
      categories: string[];
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    setStatus(initialFilter);
  }, [initialFilter]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<{ items: DocumentRecord[]; total: number; categories: string[] }>(
        `/documents?limit=500&q=${encodeURIComponent(query)}&status=${status}&category=${encodeURIComponent(category)}`,
      )
        .then((v) => {
          if (active) {
            setData(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, status, category, revision]);
  const exportCsv = async () => {
    try {
      await download(
        "/reports/register.csv",
        "Registru-documente-AeroDesk.csv",
      );
      notify("Registrul a fost exportat.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UN SINGUR LOC. TOTUL LA ÎNDEMÂNĂ.</div>
          <h1>Documente</h1>
          <p>Găsește rapid documentul de care ai nevoie.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={exportCsv}>
            <Download size={17} />
            Exportă registrul
          </button>
          <button className="button primary" onClick={onUpload}>
            <span className="plus">+</span>Adaugă document
          </button>
        </div>
      </div>
      <div className="panel library-panel">
        <div className="library-tabs">
          {[
            ["", "Toate documentele"],
            ["in_review", "În aprobare"],
            ["approved", "Aprobate"],
            ["draft", "Ciorne"],
            ["archived", "Arhivă"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={status === id ? "active" : ""}
              onClick={() => setStatus(id)}
            >
              {label}
              {id === "" && data && !status && !query && !category && (
                <span>{data.total}</span>
              )}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="Caută documente"
              placeholder="Caută după titlu, număr, furnizor…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Șterge căutarea">
                <X size={15} />
              </button>
            )}
          </label>
          <label className="filter-select">
            <SlidersHorizontal size={16} />
            <select
              aria-label="Tip document"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Toate tipurile</option>
              {(data?.categories || []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <ErrorMessage message={error} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <DocumentTable documents={data.items} onOpen={onOpen} />
            <div className="table-footer">
              <span>
                {data.items.length} din {data.total} documente
              </span>
              <span>Acces conform rolului tău</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
