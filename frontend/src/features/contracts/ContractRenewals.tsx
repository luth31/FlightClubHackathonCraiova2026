import {t,useLanguage} from '@/i18n';
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
  useLanguage();
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
    <section className="contract-renewals" aria-label={t("Urmărirea reînnoirilor")}>
      {focusId && <div className="workspace-filter-summary"><span>{t("Reînnoirea selectată din Acasă")}</span><button className="text-button" onClick={() => setFocusId(undefined)}>{t("Vezi toate reînnoirile")}</button></div>}
      <div className="renewal-heading">
        <div>
          <h2>{t("Fiecare termen are un responsabil")}</h2>
          <p>{t("Remindere la 90, 60 și 30 de zile înainte de expirare, cu preluare și progres înregistrate")}</p>
          {data && <small>{t("Dată de referință:")}{' '}{date(data.reference_date)}</small>}
        </div>
        <div className="renewal-heading-actions">
          <button className="text-button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
            <RefreshCw size={15} /> {t("Actualizează lista")}</button>
          {data?.can_sync && (
            <button className="button secondary" disabled={busy} onClick={synchronize}>
              {busy && !busyId && !selection ? <LoaderCircle className="spin" size={16} /> : <BellRing size={16} />}
              {t("Verifică termenele")}</button>
          )}
        </div>
      </div>
      <div className="renewal-counters">
        <div><span>{t("Urmăriri deschise")}</span><strong>{data ? data.counters.open : "…"}</strong></div>
        <div><span>{t("Termen de lucru depășit")}</span><strong>{data ? data.counters.overdue : "…"}</strong></div>
        <div><span>{t("De atribuit sau reatribuit")}</span><strong>{data ? data.counters.needs_reassignment : "…"}</strong></div>
      </div>
      <div className="panel renewal-list-panel">
        <div className="renewal-filters">
          <div className="renewal-status-filters" aria-label={t("Starea urmăririi")}>
            {[["open", "Deschise"], ["closed", "Închise / nereînnoite"], ["all", "Toate"]].map(([value, label]) => (
              <button key={value} className={status === value ? "active" : ""}
                disabled={busy} aria-pressed={status === value} onClick={() => changeStatus(value)}>{t(label)}</button>
            ))}
          </div>
          <label className="search-input">
            <Search size={17} />
            <input aria-label={t("Caută reînnoiri")} placeholder={t("Contract, furnizor sau responsabil")}
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
          <Empty title={t("Nicio urmărire în această listă")}
            message={t("Urmăririle apar pentru contracte validate și aprobate sau semnate care expiră în cel mult 90 de zile")} />
        )}
        {data && items.length > 0 && (
          <div className="renewal-card-list">
            {items.map((item) => (
              <article className="renewal-card" key={item.id}>
                <div className="renewal-card-top">
                  <div className="renewal-contract-copy">
                    <span className={`renewal-status renewal-status-${item.status}`}>{t(statusLabels[item.status])}</span>
                    <h3>{item.title}</h3>
                    <p>{item.number} · {item.supplier || item.department} {t("· versiunea")}{' '}{item.source_version}</p>
                  </div>
                  <button className="text-button" disabled={busy} onClick={() => onOpen(item.contract_id)}>
                    {t("Deschide contractul")}{' '}<ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="renewal-card-details">
                  <div><small><CalendarClock size={14} /> {t("Contractul expiră")}</small><strong>{date(item.expires_at)}</strong>
                    <span className={item.days_remaining <= 30 ? "renewal-attention" : ""}>
                      {item.days_remaining < 0 ? t("Expirat de {p0} zile", {p0:Math.abs(item.days_remaining)}) :
                        item.days_remaining === 0 ? t("Expiră astăzi") : t("În {p0} zile", {p0:item.days_remaining})}
                    </span>
                  </div>
                  <div><small><ClipboardCheck size={14} /> {t("Următorul termen de lucru")}</small>
                    <strong className={item.overdue ? "renewal-attention" : ""}>{date(item.due_date)}</strong>
                    {item.overdue && <span className="renewal-attention">{t("Termen depășit")}</span>}
                  </div>
                  <div><small><UserRound size={14} /> {t("Responsabil")}</small><strong>{item.assignee}</strong>
                    {item.assignment_state === "needs_reassignment" && item.principal_name &&
                      <span>{t("Responsabil anterior:")}{' '}{item.principal_name}</span>}
                  </div>
                </div>
                {item.follow_up?.not_renewing && <p className="renewal-notice">{t("Decizie de nereînnoire:")}{' '}{item.follow_up.decision?.reason} {t("· Responsabil:")}{' '}{item.follow_up.decision?.responsible}{t(". Modifică decizia din contract.")}</p>}
                {item.follow_up?.snoozed && !item.follow_up.not_renewing && <p className="renewal-notice">{t("Alertele tale sunt amânate până la")}{' '}{date(item.follow_up.remind_on!)}{t(". Mementoul se gestionează din contract.")}</p>}
                <div className="renewal-reminders" aria-label={t("Remindere înainte de expirare")}>
                  <span>{t("Remindere")}</span>
                  {item.reminders.map((reminder) => (
                    <div key={reminder.threshold_days} className={reminder.triggered_at ? "triggered" : ""}
                      title={reminder.triggered_at ? t("Înregistrat {p0}", {p0:time(reminder.triggered_at)}) : t("Pragul nu a fost atins")}>
                      <strong>{reminder.threshold_days} {t("de zile")}{' '}{reminder.triggered_at && <Check size={12} />}</strong>
                      <small>{date(reminder.due_date)}</small>
                    </div>
                  ))}
                </div>
                {!item.source_current && (
                  <p className="renewal-notice">{t("Contractul de bază s-a schimbat sau nu mai este aprobat pentru această urmărire")}</p>
                )}
                {item.assignment_state === "needs_reassignment" && item.source_current &&
                  ["pending", "acknowledged", "in_progress"].includes(item.status) && (
                  <p className="renewal-notice">{t("Responsabilul trebuie stabilit sau reatribuit unei persoane active și autorizate")}</p>
                )}
                <div className="renewal-card-actions">
                  {item.can_acknowledge && (
                    <button className="button primary" disabled={busy} onClick={() => acknowledge(item)}>
                      {busyId === item.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                      {t("Preiau reînnoirea")}</button>
                  )}
                  {item.can_progress && (
                    <button className="button secondary" disabled={busy} onClick={() => openAction(item, "progress")}>
                      <MessageSquarePlus size={15} /> {t("Adaugă progres")}</button>
                  )}
                  {item.can_reassign && (
                    <button className="text-button" disabled={busy} onClick={() => openAction(item, "assign")}>
                      <UserRoundPen size={15} /> {t("Reatribuie")}</button>
                  )}
                  {item.can_close && (
                    <button className="text-button" disabled={busy} onClick={() => openAction(item, "close")}>
                      {t("Închide urmărirea")}</button>
                  )}
                  <button className="text-button" disabled={busy} onClick={() => openAction(item, "history")}>
                    <History size={15} /> {t("Istoric")}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {selection && (
        <Modal title={selection.mode === "progress" ? t("Progresul reînnoirii") :
          selection.mode === "assign" ? t("Responsabilul reînnoirii") :
            selection.mode === "close" ? t("Închide urmărirea") : t("Istoricul urmăririi")}
          subtitle={t("{p0} · {p1}", {p0:selection.item.number,p1:selection.item.title})} onClose={closeAction}>
          {selection.mode === "history" ? (
            <div className="modal-body">
              <p className="quiet-note">{t("Contract de bază, versiunea")}{' '}{selection.item.source_version} {t("· expirare")}{' '}{date(selection.item.expires_at)}</p>
              <div className="renewal-history">
                {selection.item.history.map((entry) => (
                  <div key={entry.id}><strong>{entry.action}</strong><small>{entry.actor} · {time(entry.created_at)}</small>
                    {entry.comment && <p>{entry.comment}</p>}</div>
                ))}
                {!selection.item.history.length && <p>{t("Nu există evenimente înregistrate")}</p>}
              </div>
              <div className="modal-footer"><button className="button secondary" onClick={closeAction}>{t("Închide")}</button></div>
            </div>
          ) : (
            <form className="modal-body" onSubmit={save}>
              <div className="note-box"><ShieldCheck size={18} /><p>
                {selection.mode === "close" ? t("Închiderea înregistrează rezultatul urmăririi și oprește reminderele pentru ea. Valabilitatea contractului rămâne aceeași") :
                  selection.mode === "assign" ? t("Noul responsabil va trebui să preia explicit urmărirea. Delegarea pentru aprobări nu transferă automat această sarcină") :
                    t("Păstrează următorul pas și termenul său în istoricul urmăririi. Termenul de lucru nu modifică expirarea contractului")}
              </p></div>
              {selectionChanged && <p className="renewal-notice">{t("Urmărirea s-a schimbat. Închide formularul și actualizează lista înainte de salvare")}</p>}
              <fieldset className="renewal-form-fields" disabled={busy}>
                {selection.mode === "assign" && (
                  <label className="field">{t("Responsabil")}<select required disabled={selectionChanged} value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    <option value="">{t("Alege o persoană autorizată")}</option>
                    {selection.item.eligible_assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}</option>)}
                  </select></label>
                )}
                {selection.mode !== "close" && (
                  <label className="field">{t("Următorul termen de lucru")}<input type="date" required readOnly={selectionChanged} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                )}
                <label className="field">{selection.mode === "assign" ? t("Motivul reatribuirii") : selection.mode === "close" ? t("Rezultatul și motivul închiderii") : t("Progres și următorul pas")}
                  <textarea rows={4} required readOnly={selectionChanged} minLength={selection.mode === "close" ? 10 : 3} maxLength={2000}
                    value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
              </fieldset>
              {formError && <ErrorMessage message={formError} />}
              {(formError || selectionChanged) && <button type="button" className="text-button" disabled={busy} onClick={reloadAfterFailure}>{t("Închide și actualizează lista")}</button>}
              <div className="modal-footer">
                <button type="button" className="button secondary" disabled={busy} onClick={closeAction}>{t("Renunță")}</button>
                <button className="button primary" disabled={busy || selectionChanged}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                  {selection.mode === "close" ? t("Înregistrează închiderea") : t("Salvează")}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}
