import { useEffect, useState } from "react";
import {
  Search,
  ArrowUpRight,
  CalendarClock,
  Building2,
  Download,
} from "lucide-react";
import { api, download } from "@/services/api-client";
import {
  Loading,
  ErrorMessage,
  Status,
  FileIcon,
  Empty,
} from "@/components/ui";
import { date, money } from "@/utils/format";
import type { DocumentRecord } from "@/types";
export function ContractsPage({
  onOpen,
  revision,
  notify,
  initialFilter,
}: {
  onOpen: (id: string) => void;
  revision: number;
  notify: (s: string) => void;
  initialFilter?: string;
}) {
  const [data, setData] = useState<DocumentRecord[]>(),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(initialFilter || "all"),
    [error, setError] = useState("");
  useEffect(() => {
    setFilter(initialFilter || "all");
  }, [initialFilter]);
  useEffect(() => {
    api<{ items: DocumentRecord[] }>("/contracts")
      .then((v) => setData(v.items))
      .catch((e) => setError(e.message));
  }, [revision]);
  const filtered = (data || []).filter(
    (d) =>
      `${d.title} ${d.supplier} ${d.number}`
        .toLocaleLowerCase("ro")
        .includes(query.toLocaleLowerCase("ro")) &&
      (filter === "all" ||
        (filter === "soon" &&
          d.days_remaining != null &&
          d.days_remaining >= 0 &&
          d.days_remaining <= 60) ||
        (filter === "expired" &&
          d.days_remaining != null &&
          d.days_remaining < 0) ||
        (filter === "active" && d.contract_status === "active")),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Contracte</h1>
        </div>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await download(
                "/reports/register.csv?category=Contract",
                "Registru-contracte-FlyLeaf.csv",
              );
              notify("Registrul a fost exportat.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Download size={17} />
          Exportă CSV
        </button>
      </div>
      <div className="contract-summary">
        <button
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >
          <span>Toate contractele</span>
          <strong>{data?.length ?? "—"}</strong>
        </button>
        <button
          className={filter === "active" ? "selected" : ""}
          onClick={() => setFilter("active")}
        >
          <span>
            <i className="dot green" />
            Active
          </span>
          <strong>
            {data?.filter((d) => d.contract_status === "active").length ?? "—"}
          </strong>
        </button>
        <button
          className={filter === "soon" ? "selected" : ""}
          onClick={() => setFilter("soon")}
        >
          <span>
            <i className="dot amber" />
            Expiră în 60 de zile
          </span>
          <strong>
            {data?.filter(
              (d) =>
                d.days_remaining != null &&
                d.days_remaining >= 0 &&
                d.days_remaining <= 60,
            ).length ?? "—"}
          </strong>
        </button>
        <button
          className={filter === "expired" ? "selected" : ""}
          onClick={() => setFilter("expired")}
        >
          <span>
            <i className="dot red" />
            Expirate
          </span>
          <strong>
            {data?.filter(
              (d) => d.days_remaining != null && d.days_remaining < 0,
            ).length ?? "—"}
          </strong>
        </button>
      </div>
      <div className="panel">
        <div className="filters">
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="Caută contracte"
              placeholder="Caută un contract sau un furnizor…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="result-count">{filtered.length} contracte</span>
        </div>
        {error ? (
          <ErrorMessage message={error} />
        ) : !data ? (
          <Loading />
        ) : !filtered.length ? (
          <Empty title="Niciun contract găsit" message="Încearcă altă căutare sau schimbă filtrul." />
        ) : (
          <div className="table-scroll">
            <table className="document-table contracts-table">
              <thead>
                <tr>
                  <th>Contract / furnizor</th>
                  <th>Valoare</th>
                  <th>Valabil până la</th>
                  <th>Stare contract</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button
                        className="document-cell"
                        onClick={() => onOpen(d.id)}
                      >
                        <FileIcon category="Contract" />
                        <span>
                          <strong>{d.title}</strong>
                          <small>
                            <Building2 size={12} />
                            {d.supplier || d.number}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td className="money-cell">{money(d.value, d.currency)}</td>
                    <td>
                      <div className="deadline-cell">
                        <span>{date(d.expires_at)}</span>
                        {d.days_remaining != null && d.days_remaining <= 60 && (
                          <small
                            className={
                              d.days_remaining < 0
                                ? "danger-text"
                                : "amber-text"
                            }
                          >
                            <CalendarClock size={12} />
                            {d.days_remaining < 0
                              ? `Expirat de ${Math.abs(d.days_remaining)} zile`
                              : `În ${d.days_remaining} zile`}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <Status value={d.contract_status || d.status} />
                    </td>
                    <td>
                      <button
                        className="row-open"
                        aria-label={`Deschide ${d.title}`}
                        onClick={() => onOpen(d.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
