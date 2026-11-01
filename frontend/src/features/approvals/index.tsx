import {PersonReference} from '@/components/people/PersonReference';
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Clock3,
  UserRound,
  UserRoundPen,
  CalendarClock,
  ArrowRightLeft,
  LoaderCircle,
} from "lucide-react";
import { api } from "@/services/api-client";
import { Loading, ErrorMessage, Empty, FileIcon, Modal } from "@/components/ui";
import { date, time } from "@/utils/format";
import type { Task } from "@/types";
import "./approvals.css";
import {AppointmentPanel} from '@/features/people/AppointmentPanel';
import type {User} from '@/types';
import {personalTasks} from '@/services/access';
interface AssignedTask extends Task {
  document_version?: number;
  assigned_to?: string;
  effective_assignee?: string;
  delegated_from?: string;
  overdue?: boolean;
  assignment_state?: string;
  can_act?: boolean;
  can_reassign?: boolean;
  history?: Array<{
    actor: string;
    action: string;
    comment: string;
    created_at: string;
  }>;
  eligible_assignees?: Array<{ id: string; name: string; department: string }>;
}
const taskLabels: Record<string, string> = {
  approval: "Avizare document",
  validation: "Validare informații",
  signature: "Semnare document",
  renewal: "Pregătire reînnoire",
};
export function ApprovalsPage({
  onOpen,
  revision,
  notify,
  user,
  embedded = false,
  initialFilter = 'all',
}: {
  onOpen: (id: string) => void;
  revision: number;
  notify: (message: string) => void;
  user?: User;
  embedded?: boolean;
  initialFilter?: string;
}) {
  const [data, setData] = useState<AssignedTask[]>(),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(initialFilter),
    [selected, setSelected] = useState<AssignedTask>(),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ items: AssignedTask[] }>("/tasks")
      .then((v) => {
        if (active) {
          setData(v.items);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision, refresh]);
  const items = data?.filter(
    (t) =>
      filter === "all" ||
      (filter === "mine" && t.can_act) ||
      (filter === "overdue" && t.overdue) ||
      (filter === "unassigned" && t.assignment_state === "needs_reassignment"),
  );
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setFormError("");
    try {
      await api(`/tasks/${selected.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          assigned_to: fields.get("assigned_to"),
          due_date: fields.get("due_date") || null,
          comment: fields.get("comment"),
          version: selected.document_version,
        }),
      });
      notify("Responsabilul și termenul sarcinii au fost actualizate.");
      setSelected(undefined);
      setRefresh((n) => n + 1);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          {embedded ? <h2>Aprobări și sarcini documentare</h2> : <h1>{personalTasks(user)?'Sarcinile mele':'Aprobări'}</h1>}
        </div>
        <span className="heading-pill">
          <Clock3 size={16} />
          {data?.length ?? "—"} în așteptare
        </span>
      </div>
      {user?.roles.some(role=>['hr','director','admin'].includes(role))&&<AppointmentPanel revision={revision} notify={notify} hideEmpty/>}
      {data && (
        <div className="task-filters" aria-label="Filtre sarcini">
          {[
            ["all", "Toate"],
            ["mine", "De rezolvat de mine"],
            ["overdue", "Termen depășit"],
            ["unassigned", "De reatribuit"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{data.filter(t => id === "all" || (id === "mine" && t.can_act) || (id === "overdue" && t.overdue) || (id === "unassigned" && t.assignment_state === "needs_reassignment")).length}</span>
            </button>
          ))}
        </div>
      )}
      {error ? (
        <ErrorMessage message={error} retry={() => setRefresh((n) => n + 1)} />
      ) : !items ? (
        <Loading />
      ) : !items.length ? (
        <div className="panel">
          <Empty
            title={
              filter === "all"
                ? "Toate la zi. Bună treabă."
                : "Nicio sarcină în această categorie"
            }
            message={
              filter === "all"
                ? "Când un document are nevoie de tine, îl găsești aici."
                : "Poți vedea toate sarcinile accesibile schimbând filtrul."
            }
          />
        </div>
      ) : (
        <div className="task-list">
          {items.map((t) => (
            <article className="task-card assigned-task" key={t.id}>
              <button
                className="task-card-main"
                onClick={() => onOpen(t.document_id)}
              >
                <FileIcon category="Contract" large />
                <div className="task-copy">
                  <div className="task-label">
                    <span>{t.department}</span>
                    {t.overdue ? (
                      <span className="priority overdue">Termen depășit</span>
                    ) : (
                      t.priority === "high" && (
                        <span className="priority">Prioritar</span>
                      )
                    )}
                    {t.assignment_state === "needs_reassignment" && (
                      <span className="priority">De reatribuit</span>
                    )}
                  </div>
                  <h2>{t.title}</h2>
                  <p>
                    <UserRound size={13} />
                    <PersonReference name={t.assignee || "Responsabil de stabilit"} userId={t.assigned_to} embedded/>
                    <span className="meta-dot">·</span>
                    {taskLabels[t.type] || t.type || "Verificare document"}
                  </p>
                  {t.assignment_state === "delegated" && (
                    <span className="delegated-task">
                      <ArrowRightLeft size={12} />
                      Delegare activă
                      {t.delegated_from
                        ? <> · în locul lui <PersonReference name={t.delegated_from} embedded/></>
                        : ""}
                    </span>
                  )}
                </div>
              </button>
              <div className="task-right">
                <div className={`task-deadline ${t.overdue ? "overdue" : ""}`}>
                  <small>
                    <CalendarClock size={12} />
                    Termen
                  </small>
                  <strong>{date(t.due_date)}</strong>
                </div>
                <div className="task-card-actions">
                  <button
                    className="task-action"
                    onClick={() => onOpen(t.document_id)}
                  >
                    {t.can_act ? "Deschide sarcina" : "Vezi documentul"}
                    <ArrowRight size={17} />
                  </button>
                  {t.can_reassign && (
                    <button
                      className="reassign-button"
                      aria-label={`Reatribuie sarcina: ${t.title}`}
                      onClick={() => {
                        setSelected(t);
                        setFormError("");
                      }}
                    >
                      <UserRoundPen size={14} />
                      Reatribuie
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <Modal
          title="Reatribuie sarcina"
          subtitle={selected.title}
          onClose={() => setSelected(undefined)}
        >
          <form className="modal-body" onSubmit={assign}>
            <div className="task-assignment-summary">
              <span>{taskLabels[selected.type] || selected.type}</span>
              <strong>Versiunea {selected.document_version || 1}</strong>
            </div>
            <label className="field">
              Responsabil
              <select
                name="assigned_to"
                required
                defaultValue={selected.assigned_to || ""}
              >
                <option value="" disabled>
                  Alege o persoană autorizată
                </option>
                {selected.eligible_assignees?.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name} · {person.department}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Termen
              <input
                name="due_date"
                type="date"
                defaultValue={selected.due_date?.slice(0, 10)}
                required
              />
            </label>
            <label className="field">
              Motivul reatribuirii
              <textarea
                name="comment"
                rows={3}
                required
                minLength={3}
                placeholder="Ex. Preluare pe durata absenței sau redistribuirea responsabilităților…"
              />
            </label>
            <p className="quiet-note">
              Schimbarea se păstrează în istoric și nu aprobă documentul.
            </p>
            {selected.history && selected.history.length > 0 && (
              <details className="assignment-history">
                <summary>Istoricul sarcinii</summary>
                {selected.history.map((event, i) => (
                  <div key={i}>
                    <strong><PersonReference name={event.actor}/></strong>
                    <p>{event.comment || event.action}</p>
                    <small>{time(event.created_at)}</small>
                  </div>
                ))}
              </details>
            )}
            {formError && <ErrorMessage message={formError} />}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(undefined)}
              >
                Renunță
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <UserRoundPen size={16} />
                )}
                Salvează atribuirea
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
