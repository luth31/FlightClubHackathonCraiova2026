import {t,useLanguage} from '@/i18n';
import { ArrowUpRight } from "lucide-react";
import { FileIcon, Status, Empty } from "@/components/ui";
import { date } from "@/utils/format";
import type { DocumentRecord } from "@/types";
export function DocumentTable({
  documents,
  onOpen,
  compact = false,
}: {
  documents: DocumentRecord[];
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  useLanguage();
  if (!documents.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table className={`document-table ${compact ? "compact" : ""}`}>
        <thead>
          <tr>
            <th>{t("Document")}</th>
            {!compact && <th>{t("Departament")}</th>}
            <th>{t("Status")}</th>
            <th>{compact ? t("Actualizat") : t("Termen")}</th>
            <th>
              <span className="sr-only">{t("Deschide")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="document-cell" onClick={() => onOpen(d.id)}>
                  <FileIcon category={d.category} />
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.number} <span className="meta-dot">·</span>{" "}
                      {d.category}
                    </small>
                  </span>
                </button>
              </td>
              {!compact && (
                <td>
                  <span className="department-name">{d.department}</span>
                </td>
              )}
              <td>
                <Status value={d.status} />
              </td>
              <td className="date-cell">
                {date(compact ? d.updated_at || d.created_at : d.expires_at)}
              </td>
              <td>
                <button
                  className="row-open"
                  aria-label={t("Deschide {p0}", {p0:d.title})}
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
  );
}
