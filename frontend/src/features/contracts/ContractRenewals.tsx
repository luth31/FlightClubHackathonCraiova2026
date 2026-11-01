import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  BellRing,
  CalendarClock,
  Check,
  ClipboardCheck,
  History,
  LoaderCircle,
  MessageSquarePlus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UserRoundPen,
} from "lucide-react";
import { Empty, ErrorMessage, Loading, Modal } from "@/components/ui";
import { api } from "@/services/api-client";
import { date, time } from "@/utils/format";
import type { ContractRenewal, ContractRenewalQueue } from "@/types";
import "./renewals.css";

const statusLabels: Record<ContractRenewal["status"], string> = {
  pending: "De preluat",
  acknowledged: "Preluat",
  in_progress: "În lucru",
  completed: "Urmărire închisă",
  cancelled: "Anulat",
  not_renewing: "Nu se reînnoiește",
};

type RenewalMode = "progress" | "close" | "assign" | "history";

export function ContractRenewals({
  onOpen,
  revision,
  notify,
  initialId,
}: {
  onOpen: (id: string) => void;
  revision: number;
  notify: (message: string) => void;
  initialId?: string;
}) {
  const [data, setData] = useState<ContractRenewalQueue>();
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState(initialId);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [selection, setSelection] = useState<{ item: ContractRenewal; mode: RenewalMode }>();
  const [comment, setComment] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [formError, setFormError] = useState("");
  const readRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const endpoint = `/contract-renewals?status=${status}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    readRequest.current = controller;
    api<ContractRenewalQueue>(endpoint, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [endpoint, revision, refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!busy) setRefresh((value) => value + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, [busy]);

  function changeStatus(value: string) {
    if (busy || value === status) return;
    setData(undefined);
    setError("");
    setStatus(value);
  }

  function openAction(item: ContractRenewal, mode: RenewalMode) {
    if (busy) return;
    // Keep the opening revision while a person writes a progress note
    setSelection({ item, mode });
    setComment("");
    setDueDate(item.due_date);
    setAssignee(item.assigned_to || "");
    setFormError("");
  }

  function closeAction() {
    if (!busy) setSelection(undefined);
  }

  function reloadAfterFailure() {
    if (busy) return;
    setSelection(undefined);
    setData(undefined);
    setError("");
    setRefresh((value) => value + 1);
  }

  async function acknowledge(item: ContractRenewal) {
    if (busy || !item.can_acknowledge) return;
    readRequest.current?.abort();
    setBusy(true);
    setBusyId(item.id);
    setActionError("");
    try {
      await api<ContractRenewal>(`/contract-renewals/${item.id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ revision: item.revision }),
      });
      if (mounted.current) {
        notify("Preluarea reînnoirii a fost înregistrată");
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (mounted.current) {
        setActionError((failure as Error).message);
        setRefresh((value) => value + 1);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        setBusyId(undefined);
      }
    }
  }

  async function synchronize() {
    if (busy || !data?.can_sync) return;
    readRequest.current?.abort();
    setBusy(true);
    setActionError("");
    try {
      await api<ContractRenewalQueue>("/contract-renewals/synchronize", { method: "POST" });
      if (mounted.current) {
        notify("Termenele și reminderele au fost verificate");
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (mounted.current) setActionError((failure as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || selection.mode === "history" || busy) return;
    const { item, mode } = selection;
    if ((mode === "progress" && !item.can_progress) ||
      (mode === "close" && !item.can_close) || (mode === "assign" && !item.can_reassign)) return;
    readRequest.current?.abort();
    setBusy(true);
    setFormError("");
    try {
      await api<ContractRenewal>(`/contract-renewals/${item.id}/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          revision: item.revision,
          comment: comment.trim(),
          ...(mode === "assign" ? { assigned_to: assignee, due_date: dueDate || null } : {}),
          ...(mode === "progress" ? { next_due_date: dueDate || null } : {}),
        }),
      });
      if (mounted.current) {
        notify(mode === "assign" ? "Responsabilul reînnoirii a fost actualizat" :
          mode === "close" ? "Închiderea urmăririi a fost înregistrată" : "Progresul reînnoirii a fost salvat");
        setSelection(undefined);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (mounted.current) {
        setFormError((failure as Error).message);
        setRefresh((value) => value + 1);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const items = (data?.items || []).filter(item => !focusId || item.id === focusId).filter((item) =>
    `${item.title} ${item.number} ${item.supplier || ""} ${item.assignee}`
      .toLocaleLowerCase("ro").includes(query.toLocaleLowerCase("ro")),
  );
  const latest = selection && data?.items.find((item) => item.id === selection.item.id);
  const latestPermission = selection?.mode === "assign" ? latest?.can_reassign :
    selection?.mode === "progress" ? latest?.can_progress :
      selection?.mode === "close" ? latest?.can_close : true;
  const selectionChanged = !!selection && selection.mode !== "history" && !!data &&
    (!latest || latest.revision !== selection.item.revision || !latest.source_current || !latestPermission);

  return (
    <section className="contract-renewals" aria-label="Urmărirea reînnoirilor">
      {focusId && <div className="workspace-filter-summary"><span>Reînnoirea selectată din Acasă</span><button className="text-button" onClick={() => setFocusId(undefined)}>Vezi toate reînnoirile</button></div>}
      <div className="renewal-heading">
        <div>
          <h2>Fiecare termen are un responsabil</h2>
          <p>Remindere la 90, 60 și 30 de zile înainte de expirare, cu preluare și progres înregistrate</p>
          {data && <small>Dată de referință: {date(data.reference_date)}</small>}
        </div>
        <div className="renewal-heading-actions">
          <button className="text-button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
            <RefreshCw size={15} /> Actualizează lista
          </button>
          {data?.can_sync && (
            <button className="button secondary" disabled={busy} onClick={synchronize}>
              {busy && !busyId && !selection ? <LoaderCircle className="spin" size={16} /> : <BellRing size={16} />}
              Verifică termenele
            </button>
          )}
        </div>
      </div>
      <div className="renewal-counters">
        <div><span>Urmăriri deschise</span><strong>{data ? data.counters.open : "…"}</strong></div>
        <div><span>Termen de lucru depășit</span><strong>{data ? data.counters.overdue : "…"}</strong></div>
        <div><span>De atribuit sau reatribuit</span><strong>{data ? data.counters.needs_reassignment : "…"}</strong></div>
      </div>
      <div className="panel renewal-list-panel">
        <div className="renewal-filters">
          <div className="renewal-status-filters" aria-label="Starea urmăririi">
            {[["open", "Deschise"], ["closed", "Închise / nereînnoite"], ["all", "Toate"]].map(([value, label]) => (
              <button key={value} className={status === value ? "active" : ""}
                disabled={busy} aria-pressed={status === value} onClick={() => changeStatus(value)}>{label}</button>
            ))}
          </div>
          <label className="search-input">
            <Search size={17} />
            <input aria-label="Caută reînnoiri" placeholder="Contract, furnizor sau responsabil"
              value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {error && <ErrorMessage message={error} retry={() => setRefresh((value) => value + 1)} />}
        {actionError && <ErrorMessage message={actionError} retry={() => {
          setActionError("");
          setRefresh((value) => value + 1);
        }} />}
        {!data && !error && <Loading />}
        {data && !items.length && (
          <Empty title="Nicio urmărire în această listă"
            message="Urmăririle apar pentru contracte validate și aprobate sau semnate care expiră în cel mult 90 de zile" />
        )}
        {data && items.length > 0 && (
          <div className="renewal-card-list">
            {items.map((item) => (
              <article className="renewal-card" key={item.id}>
                <div className="renewal-card-top">
                  <div className="renewal-contract-copy">
                    <span className={`renewal-status renewal-status-${item.status}`}>{statusLabels[item.status]}</span>
                    <h3>{item.title}</h3>
                    <p>{item.number} · {item.supplier || item.department} · versiunea {item.source_version}</p>
                  </div>
                  <button className="text-button" disabled={busy} onClick={() => onOpen(item.contract_id)}>
                    Deschide contractul <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="renewal-card-details">
                  <div><small><CalendarClock size={14} /> Contractul expiră</small><strong>{date(item.expires_at)}</strong>
                    <span className={item.days_remaining <= 30 ? "renewal-attention" : ""}>
                      {item.days_remaining < 0 ? `Expirat de ${Math.abs(item.days_remaining)} zile` :
                        item.days_remaining === 0 ? "Expiră astăzi" : `În ${item.days_remaining} zile`}
                    </span>
                  </div>
                  <div><small><ClipboardCheck size={14} /> Următorul termen de lucru</small>
                    <strong className={item.overdue ? "renewal-attention" : ""}>{date(item.due_date)}</strong>
                    {item.overdue && <span className="renewal-attention">Termen depășit</span>}
                  </div>
                  <div><small><UserRound size={14} /> Responsabil</small><strong>{item.assignee}</strong>
                    {item.assignment_state === "needs_reassignment" && item.principal_name &&
                      <span>Responsabil anterior: {item.principal_name}</span>}
                  </div>
                </div>
                {item.follow_up?.not_renewing && <p className="renewal-notice">Decizie de nereînnoire: {item.follow_up.decision?.reason} · Responsabil: {item.follow_up.decision?.responsible}. Modifică decizia din contract.</p>}
                {item.follow_up?.snoozed && !item.follow_up.not_renewing && <p className="renewal-notice">Alertele tale sunt amânate până la {date(item.follow_up.remind_on!)}. Mementoul se gestionează din contract.</p>}
                <div className="renewal-reminders" aria-label="Remindere înainte de expirare">
                  <span>Remindere</span>
                  {item.reminders.map((reminder) => (
                    <div key={reminder.threshold_days} className={reminder.triggered_at ? "triggered" : ""}
                      title={reminder.triggered_at ? `Înregistrat ${time(reminder.triggered_at)}` : "Pragul nu a fost atins"}>
                      <strong>{reminder.threshold_days} de zile {reminder.triggered_at && <Check size={12} />}</strong>
                      <small>{date(reminder.due_date)}</small>
                    </div>
                  ))}
                </div>
                {!item.source_current && (
                  <p className="renewal-notice">Contractul de bază s-a schimbat sau nu mai este aprobat pentru această urmărire</p>
                )}
                {item.assignment_state === "needs_reassignment" && item.source_current &&
                  ["pending", "acknowledged", "in_progress"].includes(item.status) && (
                  <p className="renewal-notice">Responsabilul trebuie stabilit sau reatribuit unei persoane active și autorizate</p>
                )}
                <div className="renewal-card-actions">
                  {item.can_acknowledge && (
                    <button className="button primary" disabled={busy} onClick={() => acknowledge(item)}>
                      {busyId === item.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                      Preiau reînnoirea
                    </button>
                  )}
                  {item.can_progress && (
                    <button className="button secondary" disabled={busy} onClick={() => openAction(item, "progress")}>
                      <MessageSquarePlus size={15} /> Adaugă progres
                    </button>
                  )}
                  {item.can_reassign && (
                    <button className="text-button" disabled={busy} onClick={() => openAction(item, "assign")}>
                      <UserRoundPen size={15} /> Reatribuie
                    </button>
                  )}
                  {item.can_close && (
                    <button className="text-button" disabled={busy} onClick={() => openAction(item, "close")}>
                      Închide urmărirea
                    </button>
                  )}
                  <button className="text-button" disabled={busy} onClick={() => openAction(item, "history")}>
                    <History size={15} /> Istoric
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {selection && (
        <Modal title={selection.mode === "progress" ? "Progresul reînnoirii" :
          selection.mode === "assign" ? "Responsabilul reînnoirii" :
            selection.mode === "close" ? "Închide urmărirea" : "Istoricul urmăririi"}
          subtitle={`${selection.item.number} · ${selection.item.title}`} onClose={closeAction}>
          {selection.mode === "history" ? (
            <div className="modal-body">
              <p className="quiet-note">Contract de bază, versiunea {selection.item.source_version} · expirare {date(selection.item.expires_at)}</p>
              <div className="renewal-history">
                {selection.item.history.map((entry) => (
                  <div key={entry.id}><strong>{entry.action}</strong><small>{entry.actor} · {time(entry.created_at)}</small>
                    {entry.comment && <p>{entry.comment}</p>}</div>
                ))}
                {!selection.item.history.length && <p>Nu există evenimente înregistrate</p>}
              </div>
              <div className="modal-footer"><button className="button secondary" onClick={closeAction}>Închide</button></div>
            </div>
          ) : (
            <form className="modal-body" onSubmit={save}>
              <div className="note-box"><ShieldCheck size={18} /><p>
                {selection.mode === "close" ? "Închiderea înregistrează rezultatul urmăririi și oprește reminderele pentru ea. Valabilitatea contractului rămâne aceeași" :
                  selection.mode === "assign" ? "Noul responsabil va trebui să preia explicit urmărirea. Delegarea pentru aprobări nu transferă automat această sarcină" :
                    "Păstrează următorul pas și termenul său în istoricul urmăririi. Termenul de lucru nu modifică expirarea contractului"}
              </p></div>
              {selectionChanged && <p className="renewal-notice">Urmărirea s-a schimbat. Închide formularul și actualizează lista înainte de salvare</p>}
              <fieldset className="renewal-form-fields" disabled={busy}>
                {selection.mode === "assign" && (
                  <label className="field">Responsabil<select required disabled={selectionChanged} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">Alege o persoană autorizată</option>
                    {selection.item.eligible_assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}</option>)}
                  </select></label>
                )}
                {selection.mode !== "close" && (
                  <label className="field">Următorul termen de lucru<input type="date" required readOnly={selectionChanged} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                )}
                <label className="field">{selection.mode === "assign" ? "Motivul reatribuirii" : selection.mode === "close" ? "Rezultatul și motivul închiderii" : "Progres și următorul pas"}
                  <textarea rows={4} required readOnly={selectionChanged} minLength={selection.mode === "close" ? 10 : 3} maxLength={2000}
                    value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
              </fieldset>
              {formError && <ErrorMessage message={formError} />}
              {(formError || selectionChanged) && <button type="button" className="text-button" disabled={busy} onClick={reloadAfterFailure}>Închide și actualizează lista</button>}
              <div className="modal-footer">
                <button type="button" className="button secondary" disabled={busy} onClick={closeAction}>Renunță</button>
                <button className="button primary" disabled={busy || selectionChanged}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                  {selection.mode === "close" ? "Înregistrează închiderea" : "Salvează"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
