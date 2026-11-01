import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, Download, X, List, Workflow, ChevronLeft, ChevronRight } from "lucide-react";
import { api, download, getIdentity } from "@/services/api-client";
import { Loading, ErrorMessage } from "@/components/ui";
import { DocumentTable } from "./DocumentTable";
import { DocumentFlow } from "./DocumentFlow";
import type { DocumentRecord, DocumentFlowData } from "@/types";
import "./documents.css";

type LibraryView = "list" | "flow";
const PAGE_SIZE = 20;
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<LibraryView>(
    () => sessionStorage.getItem("flyleaf-document-view") === "flow" ? "flow" : "list",
  ),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
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
    setPage(1);
  }, [initialFilter]);
  const pageCount = Math.max(1, Math.ceil((data?.items.length || 0) / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleDocuments = data?.items.slice(firstIndex, firstIndex + PAGE_SIZE) || [];
  const changePage = (next: number) => {
    setPage(next);
    panelRef.current?.scrollIntoView?.({block: "start"});
  };
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
          <h1>Documente</h1>
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
      <div className="panel library-panel" ref={panelRef}>
      <div className="library-navigation">
      <div className="library-view-switch" role="group" aria-label="Vizualizare documente">
        <button aria-pressed={view === "list"} onClick={() => changeView("list")}>
          <List size={16} /> Registru
        </button>
        <button aria-pressed={view === "flow"} onClick={() => changeView("flow")}>
          <Workflow size={16} /> Flux achiziții
        </button>
      </div>
        <div className="library-tabs">
          {[
            ["", "Toate documentele"],
            ["in_review", "În aprobare"],
            ["approved", "Aprobate"],
            ["draft", "Ciorne"],
            ["archived", "Arhivă"],
            ...(initialFilter === "soon" ? [["soon", "Expiră în 60 zile"]] : []),
          ].map(([id, label]) => (
            <button
              key={id}
              className={status === id ? "active" : ""}
              aria-pressed={status === id}
              onClick={() => {setStatus(id);setPage(1)}}
            >
              {label}
              {id === "" && !loading && !status && !query && !category && (
                <span>{view === "flow" ? flowData?.total : data?.total}</span>
              )}
            </button>
          ))}
        </div>
      </div>
        <div className="filters">
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="Caută documente"
              placeholder="Caută după titlu, număr, furnizor…"
              value={query}
              onChange={(e) => {setQuery(e.target.value);setPage(1)}}
            />
            {query && (
              <button onClick={() => {setQuery("");setPage(1)}} aria-label="Șterge căutarea">
                <X size={15} />
              </button>
            )}
          </label>
          <label className="filter-select">
            <SlidersHorizontal size={16} />
            <select
              aria-label="Tip document"
              value={category}
              onChange={(e) => {setCategory(e.target.value);setPage(1)}}
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
            <DocumentTable documents={visibleDocuments} onOpen={onOpen} />
            <div className="table-footer library-pagination">
              <span role="status">
                {data.items.length ? `${firstIndex + 1}–${firstIndex + visibleDocuments.length}` : "0"} din {data.total} documente
              </span>
              {pageCount > 1 && <nav aria-label="Paginare documente">
                <button className="button secondary small" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16}/>Anterior</button>
                <span>{currentPage} / {pageCount}</span>
                <button className="button secondary small" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Următor<ChevronRight size={16}/></button>
              </nav>}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
