import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, Download, X, List, Workflow } from "lucide-react";
import { api, download, getIdentity } from "@/services/api-client";
import { Loading, ErrorMessage } from "@/components/ui";
import { DocumentTable } from "./DocumentTable";
import { DocumentFlow } from "./DocumentFlow";
import type { DocumentRecord, DocumentFlowData } from "@/types";

type LibraryView = "list" | "flow";
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
  const caseStorageKey = `flyleaf-document-case:${getIdentity()}`;
  const [view, setView] = useState<LibraryView>(
    () => sessionStorage.getItem("flyleaf-document-view") === "flow" ? "flow" : "list",
  ),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(initialFilter),
    [category, setCategory] = useState(""),
    [caseId, setCaseId] = useState(() => sessionStorage.getItem(caseStorageKey) || ""),
    [data, setData] = useState<{
      items: DocumentRecord[];
      total: number;
      categories: string[];
    }>(),
    [flowData, setFlowData] = useState<DocumentFlowData>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);

  const changeView = (next: LibraryView) => {
    setView(next);
    sessionStorage.setItem("flyleaf-document-view", next);
  };
  const selectCase = (id: string) => {
    setCaseId(id);
    sessionStorage.setItem(caseStorageKey, id);
  };
  useEffect(() => {
    setStatus(initialFilter);
  }, [initialFilter]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, status, category });
      const request = view === "flow"
        ? api<DocumentFlowData>(`/documents/flow?${params}&case_id=${encodeURIComponent(caseId)}`)
          .then((value) => {
            if (active) {
              setFlowData(value);
            }
          })
        : api<{ items: DocumentRecord[]; total: number; categories: string[] }>(
          `/documents?limit=500&${params}`,
        ).then((value) => {
          if (active) setData(value);
        });
      request.catch((e) => {
        if (active) setError(e.message);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, status, category, caseId, view, revision, reload]);
  const exportCsv = async () => {
    try {
      await download(
        "/reports/register.csv",
        "Registru-documente-FlyLeaf.csv",
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
      <div className="library-view-switch" role="group" aria-label="Vizualizare documente">
        <button aria-pressed={view === "list"} onClick={() => changeView("list")}>
          <List size={16} /> Registru
        </button>
        <button aria-pressed={view === "flow"} onClick={() => changeView("flow")}>
          <Workflow size={16} /> Flux achiziții
        </button>
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
              {id === "" && !loading && !status && !query && !category && (
                <span>{view === "flow" ? flowData?.total : data?.total}</span>
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
              {((view === "flow" ? flowData?.categories : data?.categories) || []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <ErrorMessage message={error} retry={() => setReload((value) => value + 1)} />
        ) : loading ? (
          <Loading />
        ) : view === "flow" && flowData ? (
          <DocumentFlow
            data={flowData}
            caseId={caseId}
            onSelectCase={selectCase}
            onOpen={onOpen}
            onShowRegister={() => changeView("list")}
          />
        ) : data ? (
          <>
            <DocumentTable documents={data.items} onOpen={onOpen} />
            <div className="table-footer">
              <span>
                {data.items.length} din {data.total} documente
              </span>
              <span>Acces conform rolului tău</span>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
