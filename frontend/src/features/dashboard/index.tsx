import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  FileStack,
  CalendarDays,
  FileCheck2,
} from "lucide-react";
import { api } from "@/services/api-client";
import { Loading, ErrorMessage, SectionHead, Empty } from "@/components/ui";
import { OperationsPulse } from "@/features/operations/OperationsPulse";
import { DocumentTable } from "@/features/documents";
import { date, time, actionLabel } from "@/utils/format";
import type { Dashboard, Page } from "@/types";
import './dashboard.css';
export function DashboardPage({
  name,
  onOpen,
  onNavigate,
  onUpload,
  revision,
}: {
  name: string;
  onOpen: (id: string) => void;
  onNavigate: (page: Page, filter?: string) => void;
  onUpload: () => void;
  revision: number;
}) {
  const [data, setData] = useState<Dashboard>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Dashboard>("/dashboard")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  if (error) return <ErrorMessage message={error} />;
  if (!data) return <Loading />;
  const stats = [
    {
      label: "Documente",
      value: data.stats.documents,
      icon: FileStack,
      to: "documents",
      filter: "",
    },
    {
      label: "De aprobat",
      value: data.stats.pending,
      icon: Clock3,
      to: "approvals",
      filter: "in_review",
    },
    {
      label: "Expiră în 60 zile",
      value: data.stats.expiring,
      icon: CalendarDays,
      to: "documents",
      filter: "soon",
    },
    {
      label: "Aprobate",
      value: data.stats.approved,
      icon: CheckCheck,
      to: "documents",
      filter: "approved",
    },
  ];
  return (
    <div className="dashboard-home">
      <div className="page-heading home-heading">
        <div>
          <h1>
            Bine ai venit, {name.split(" ")[0]}
            <span className="greeting-dot">.</span>
          </h1>
        </div>
        <button className="button primary" onClick={onUpload}>
          <span className="plus">+</span>Adaugă document
        </button>
      </div>
      <div className="dashboard-main">
        <div className="dashboard-primary">
          <div className="panel attention-panel">
            <SectionHead
              title="De rezolvat"
              onClick={() => onNavigate("approvals")}
              action="Toate aprobările"
            >
              <span className="count-badge">{data.stats.pending}</span>
            </SectionHead>
            {data.attention?.length ? (
              <div className="attention-list">
                {data.attention.slice(0, 3).map((item, i) => (
                  <button
                    className="attention-item"
                    key={item.id || i}
                    onClick={() => onOpen(item.document_id || item.id || "")}
                  >
                    <span
                      className={`attention-icon ${i === 0 ? "amber" : ""}`}
                    >
                      {i === 0 ? (
                        <Clock3 size={20} />
                      ) : (
                        <FileCheck2 size={20} />
                      )}
                    </span>
                    <span className="attention-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {item.department || "Document"}{" "}
                        <span className="meta-dot">·</span>{" "}
                        {item.type === "approval"
                          ? "Așteaptă aprobare"
                          : item.type === "expiry"
                            ? "Termen apropiat"
                            : item.type || "Necesită verificare"}
                      </small>
                    </span>
                    <span className="attention-due">
                      {item.due_date
                        ? date(item.due_date)
                        : item.expires_at
                          ? date(item.expires_at)
                          : "De verificat"}
                    </span>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Ești la zi"
                message="Niciun document nu așteaptă o acțiune."
              />
            )}
          </div>
          <div className="panel recent-panel">
            <SectionHead
              title="Documente recente"
              onClick={() => onNavigate("documents")}
            />
            <DocumentTable
              documents={data.recent_documents?.slice(0, 5) || []}
              onOpen={onOpen}
              compact
            />
          </div>
        </div>
        <aside className="dashboard-secondary">
          <div className="panel activity-panel">
            <SectionHead
              title="Ultimele activități"
              onClick={() => onNavigate("audit")}
              action="Istoric"
            />
            <div className="activity-list">
              {data.activity?.slice(0, 5).map((a, i) => (
                <div className="activity-item" key={a.id}>
                  <div className={`activity-marker marker-${i}`}>
                    <span />
                  </div>
                  <div>
                    <strong>{actionLabel[a.action] || a.action}</strong>
                    {a.document_title && (
                      <button
                        onClick={() => a.document_id && onOpen(a.document_id)}
                      >
                        {a.document_title}
                      </button>
                    )}
                    <small>
                      {a.actor} <span className="meta-dot">·</span>{" "}
                      {time(a.created_at)}
                    </small>
                  </div>
                </div>
              ))}
              {!data.activity?.length && (
                <p className="quiet-note">
                  Activitățile echipei vor apărea aici.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <details className="home-overview">
        <summary>Indicatori și situație operațională</summary>
      <div className="stats-grid">
        {stats.map((s, i) => (
          <button
            key={s.label}
            className={`stat-card stat-${i}`}
            onClick={() => onNavigate(s.to as Page, s.filter)}
          >
            <div className="stat-top">
              <span>{s.label}</span>
              <s.icon size={18} />
            </div>
            <div className="stat-number">
              {s.value}
              <ArrowUpRight size={19} />
            </div>
          </button>
        ))}
      </div>
      <OperationsPulse onOpen={() => onNavigate("operations")} />
      </details>
    </div>
  );
}
