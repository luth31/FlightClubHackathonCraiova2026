import {t,useLanguage} from '@/i18n';
import {PersonReference} from '@/components/people/PersonReference';
import { useEffect, useState, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Download,
  Share2,
  Check,
  Clock3,
  FileCheck2,
  PenLine,
  History,
  Info,
  ShieldCheck,
  Sparkles,
  LoaderCircle,
  ExternalLink,
  Upload,
  ChevronRight,
} from "lucide-react";
import { api, fileUrl, download } from "@/services/api-client";
import {documentHref, pageLabels} from '@/services/navigation';
import {
  Loading,
  ErrorMessage,
  Status,
  FileIcon,
  Modal,
} from "@/components/ui";
import { ExtractedText } from './ExtractedText';
import {DocumentPerson} from './DocumentPerson';
import {DocumentExpiry} from './DocumentExpiry';
import {DocumentFollowUp} from './DocumentFollowUp';
import {ReadOnlyPdf} from '@/components/documents/ReadOnlyPdf';
import { ProcurementDocumentPanel } from '@/features/procurement/ProcurementDocumentPanel';
import {DocumentWorkflowProgress,DocumentActivity} from './DocumentWorkflow';
import {DocumentStateFlow} from './DocumentStateFlow';
import "./documents.css";
import { ShareDialog } from "@/features/sharing";
import { date, time, money, actionLabel } from "@/utils/format";
import type { DocumentRecord, Page, User } from "@/types";
export function DocumentDetail({
  id,
  onClose,
  onOpen,
  origin,
  onChanged,
  notify,
  user,
}: {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  origin: Page;
  onChanged: () => void;
  notify: (s: string) => void;
  user: User;
}) {
  useLanguage();
  const [doc, setDoc] = useState<DocumentRecord>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("details"),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState<string>(),
    [sharing, setSharing] = useState(false),
    [editing, setEditing] = useState(false),
    [fields, setFields] = useState({
      title: "",
      supplier: "",
      expires_at: "",
      value: "",
      summary: "",
    }),
    [verification, setVerification] = useState<{
      integrity: boolean;
      signed: boolean;
      signer?: string;
      trust: string;
      sha256: string;
    }>();
  const versionInput = useRef<HTMLInputElement>(null);
  const load = useCallback(
    () =>
      api<DocumentRecord>(`/documents/${id}`)
        .then((d) => {
          setDoc(d);
          setError("");
          setFields({
            title: d.title,
            supplier: d.supplier || "",
            expires_at: d.expires_at || "",
            value: d.value?.toString() || "",
            summary: d.summary || "",
          });
        })
        .catch((e) => { setDoc(undefined); setError(e.message); }),
    [id],
  );
  useEffect(() => {
    let active = true;
    setDoc(undefined);
    setError("");
    setEditing(false);
    setConfirm(undefined);
    setVerification(undefined);
    api<DocumentRecord>(`/documents/${id}`)
      .then((d) => {
        if (!active) return;
        setDoc(d);
        setFields({title:d.title, supplier:d.supplier || '', expires_at:d.expires_at || '', value:d.value?.toString() || '', summary:d.summary || ''});
      })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id, user.id]);
  const openedId = doc?.id;
  useEffect(() => {
    if (openedId) void api('/workspace/recent/' + encodeURIComponent(openedId), {method:'POST'}).catch(() => {});
  }, [openedId]);
  const extractionStatus = doc?.extraction_status;
  useEffect(() => {
    if (!['queued', 'processing'].includes(extractionStatus || '')) return;
    let active = true;
    const timer = window.setInterval(() => {
      api<DocumentRecord>(`/documents/${id}`).then(d => {
        if (active) {
          setDoc(d);
          if (!editing) setFields({title:d.title, supplier:d.supplier || '', expires_at:d.expires_at || '', value:d.value?.toString() || '', summary:d.summary || ''});
        }
      }).catch(() => {});
    }, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [id, extractionStatus, editing]);
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      const requestedAction=action==='review'?'submit':action;
      if(action==='review'&&!doc?.validated){
        const validated=await api<DocumentRecord>(`/documents/${id}/actions`,{method:'POST',body:JSON.stringify({action:'validate',version:doc?.version})});
        setDoc(validated);
      }
      const d = await api<DocumentRecord>(`/documents/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action:requestedAction,
          comment: reason,
          version: doc?.version,
        }),
      });
      setDoc(d);
      setConfirm(undefined);
      setReason("");
      const assignee = d.workflow?.task?.assignee;
      notify(
        (action === 'review' || action === 'submit') && assignee
          ? `Documentul a fost trimis spre aprobare la ${assignee}. Sarcina apare în Aprobări → De rezolvat de mine.`
          :
        (
          {
            validate: "Metadatele au fost validate.",
            review: "Datele au fost confirmate. Documentul a fost trimis spre aprobare.",
            submit: "Documentul a fost trimis spre aprobare.",
            approve: "Documentul a fost aprobat.",
            reject: "Documentul a fost returnat pentru corectare.",
            sign: "Documentul a fost semnat.",
            archive: "Documentul a fost arhivat.",
          } as Record<string, string>
        )[action] || "Documentul a fost actualizat.",
      );
      onChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
      if(action==='review')void api<DocumentRecord>(`/documents/${id}`).then(setDoc).catch(()=>{});
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...fields,
          value: fields.value ? Number(fields.value) : null,
          expires_at: fields.expires_at || null,
        }),
      });
      setEditing(false);
      notify("Informațiile au fost salvate într-o versiune nouă.");
      onChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function newVersion(file?: File) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    form.append("comment", "Versiune actualizată din registru");
    try {
      await api(`/documents/${id}/versions`, { method: "POST", body: form });
      notify(
        "Versiunea nouă a fost înregistrată. Este necesară o nouă aprobare.",
      );
      onChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canReview =
    doc?.permissions?.can_review ??
    (user.roles || []).some((r) => ["reviewer", "director", "hr"].includes(r));
  const canSign =
    doc?.permissions?.can_sign ?? (user.roles || []).includes("signer");
  const canEdit =
    doc?.permissions?.can_edit ??
    (user.roles || []).some((r) =>
      ["director", "reviewer", "finance", "hr"].includes(r),
    );
  const canValidate = doc?.permissions?.can_validate ?? canEdit;
  const canSubmit = doc?.permissions?.can_submit ?? canEdit;
  const canShare =
    doc?.permissions?.can_share ??
    ((user.roles || []).some((r) => ["director", "reviewer"].includes(r)) &&
      doc?.department !== "Resurse umane");
  return (
    <div className="detail-page">
      <button className="back-button" onClick={onClose}>
        <ArrowLeft size={16} />
        {t("Înapoi la")}{' '}{pageLabels[origin]}
      </button>
      {!doc ? (
        error ? (
          <>
            <ErrorMessage message={error} retry={load} />
            <p className="quiet-note">{t("Aprobările sunt disponibile în contul responsabilului desemnat.")}</p>
            <a className="button secondary" href="#approvals">{t("Vezi aprobările mele")}{' '}<ArrowRight size={16} /></a>
          </>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <DocumentWorkflowProgress doc={doc}/>
          <div className="detail-heading">
            <FileIcon category={doc.category} large />
            <div>
              <div className="detail-kicker">
                {doc.number}
                <span>·</span>
                {doc.category}
                <span>·</span>{t("Versiunea")}{' '}{doc.version}
              </div>
              <h1>{doc.title}</h1>
            </div>
            <Status value={doc.status} />
          </div>
          <div className="detail-toolbar">
            <span>
              <ShieldCheck size={15} />
              {(
                {
                  internal: "Intern",
                  public: "Public",
                  restricted: "Acces restricționat",
                  confidential: "Confidențial",
                } as Record<string, string>
              )[doc.confidentiality || "internal"] || doc.confidentiality}
              <span className="meta-dot">·</span>
              {doc.department}
            </span>
            <div>
              <button className="button secondary small-button" onClick={()=>{location.hash='assistant?document='+encodeURIComponent(doc.id)}}><Sparkles size={15}/>{t("Întreabă despre document")}</button>
              <button
                className="button secondary small-button"
                onClick={async () => {
                  try {
                    await download(
                      `${doc.file_url}?version=${doc.version}`,
                      doc.filename || `${doc.number}.pdf`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Download size={15} />
                {t("Descarcă PDF")}</button>
              {["approved", "signed"].includes(doc.status) && canShare && (
                <button
                  className="button secondary small-button"
                  onClick={() => setSharing(true)}
                >
                  <Share2 size={15} />
                  {t("Partajează")}</button>
              )}
              {["approved", "signed"].includes(doc.status) && canReview && (
                <button
                  className="button secondary small-button"
                  onClick={() => setConfirm("archive")}
                >
                  <Archive size={15} />
                  {t("Arhivează")}</button>
              )}
            </div>
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="detail-layout">
            <div className="pdf-panel">
              <div className="pdf-toolbar">
                <FileIcon category={doc.category} />
                <span>{doc.filename || t("{p0}.pdf", {p0:doc.number})}</span>
                <a
                  className="icon-button"
                  href={fileUrl(`${doc.file_url}?version=${doc.version}`)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("Deschide PDF într-o filă nouă")}
                >
                  <ExternalLink size={16} />
                </a>
              </div>
              <ReadOnlyPdf
                key={`${doc.id}:${doc.version}:${doc.status}`}
                title={doc.title}
                source={`${doc.file_url}?version=${doc.version}`}
              />
            </div>
            <aside className="document-side">
              <DocumentFollowUp doc={doc} canArchive={canEdit && ['approved', 'signed'].includes(doc.status) && doc.metadata?.managed_by !== 'leave_workflow' && user.roles.some(role => ['director', 'reviewer'].includes(role))}
                onArchive={() => setConfirm('archive')} notify={notify} onChanged={() => {onChanged(); void load();}}/>
              {doc.metadata?.managed_by === "leave_workflow" && (
                <div className="panel document-actions">
                  <h2>{doc.metadata.request_status === "approved" ? t("Concediul este aprobat") :
                    doc.metadata.request_status === "rejected" ? t("Concediul a fost respins") : t("Cerere în așteptarea deciziei")}</h2>
                  <p>{t("Actualizat automat din Concedii.")}</p>
                  <a className="button secondary full-width" href="#people?tab=leave">
                    {t("Vezi cererile de concediu")}{' '}<ArrowRight size={15}/>
                  </a>
                </div>
              )}
              {doc.metadata?.managed_by !== "leave_workflow" && !["archived", "signed"].includes(doc.status) && (
                <div className="panel document-actions">
                  {doc.workflow?.task?.status === "pending" && (
                    <div className="document-task-owner">
                      <span>
                        {t("Responsabil:")}{" "}
                        {doc.workflow.task.effective_assignee
                          ? <DocumentPerson name={doc.workflow.task.assignee} userId={doc.workflow.task.effective_assignee}/>
                          : <strong>{doc.workflow.task.assignee}</strong>}
                      </span>
                      <small>{t("Termen:")}{' '}{date(doc.workflow.task.due_date)}</small>
                      <a href="#approvals">
                        {t("Vezi sarcinile echipei")}{' '}<ArrowRight size={13} />
                      </a>
                    </div>
                  )}
                  {doc.status === "draft" && (
                    <>
                      <h2>
                        {doc.validated
                          ? t("Trimite la aprobare")
                          : t("Verifică informațiile")}
                      </h2>
                      <p>
                        {doc.validated
                          ? t("Informațiile sunt validate.")
                          : t("Compară datele de mai jos cu PDF-ul.")}
                      </p>
                      {!doc.validated ? (
                        <button
                          className="button primary full-width"
                          disabled={busy || !canValidate || editing || ['queued','processing','failed'].includes(doc.extraction_status||'')}
                          onClick={() => act("review")}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <Check size={17} />
                          )}
                          {t("Confirmă și trimite spre aprobare")}</button>
                      ) : (
                        <button
                          className="button primary full-width"
                          disabled={busy || !canSubmit || editing}
                          onClick={() => act("submit")}
                        >
                          <FileCheck2 size={17} />
                          {t("Trimite spre aprobare")}</button>
                      )}
                    </>
                  )}
                  {doc.status === "in_review" && (
                    <>
                      <h2>{t("Decizia ta")}</h2>
                      <p>
                        {t("Verifici versiunea")}{' '}{doc.version}.
                      </p>
                      {canReview ? (
                        <div className="approval-actions">
                          <button
                            className="button primary full-width"
                            disabled={busy}
                            onClick={() => setConfirm("approve")}
                          >
                            <Check size={17} />
                            {t("Aprobă documentul")}</button>
                          <button
                            className="button secondary full-width"
                            disabled={busy}
                            onClick={() => setConfirm("reject")}
                          >
                            {t("Returnează pentru corectare")}</button>
                        </div>
                      ) : (
                        <div className="note-box">
                          {t("În așteptarea responsabilului din Aprobări.")}</div>
                      )}
                    </>
                  )}
                  {doc.status === "approved" && (
                    <>
                      <h2>{t("Document aprobat")}</h2>
                      <p>
                        {canSign
                          ? t("Semnează versiunea aprobată.")
                          : t("Documentul așteaptă semnătura responsabilului desemnat.")}
                      </p>
                      {canSign && (
                        <button
                          className="button primary full-width"
                          disabled={busy}
                          onClick={() => setConfirm("sign")}
                        >
                          <PenLine size={17} />
                          {t("Semnează documentul")}</button>
                      )}
                      <small className="quiet-note">
                        {t("Semnătură criptografică cu certificat local.")}</small>
                    </>
                  )}
                </div>
              )}
              <div className="panel document-info">
                <div className="detail-tabs">
                  {[
                    ["details", "Date extrase", Info],
                    ["workflow", "Aprobări", FileCheck2],
                    ["history", "Istoric", History],
                    ...(["Contract", "Referat de necesitate", "Caiet de sarcini", "Comandă", "Act adițional", "Proces-verbal", "Raport de mentenanță", "Factură"].includes(doc.category)
                      ? [["procurement", "Avansat", FileCheck2]] : []),
                  ].map(([key, label, Icon]) => (
                    <button
                      key={key as string}
                      className={tab === key ? "active" : ""}
                      aria-pressed={tab === key}
                      onClick={() => setTab(key as string)}
                    >
                      {typeof Icon !== "string" && <Icon size={15} />}{" "}
                      {label as string}
                    </button>
                  ))}
                </div>
                <div className="detail-tab-content">
                  {tab === "details" && (
                    <>
                      {doc.validated ? (
                        <div className="verified-line">
                          <Check size={14} />
                          {doc.metadata?.managed_by === "leave_workflow" ? t("Date din cererea de concediu") : t("Informații validate")}
                        </div>
                      ) : (
                        <div className="unverified-line">
                          <Clock3 size={14} />
                          {t("Informații de verificat")}</div>
                      )}
                      <ExtractedText doc={doc} canReadText={!user.roles.includes('technician')} onRetry={load} />
                      {doc.metadata?.procurement ? <ProcurementDocumentPanel reviewOnly documentId={id} documentVersion={doc.version} extractionStatus={doc.extraction_status} notify={notify} onDirtyChange={setEditing} onChanged={()=>{setBusy(true);onChanged();void load().finally(()=>{setEditing(false);setBusy(false)})}}/> : <>
                      {editing ? (
                        <div className="edit-fields">
                          <label className="field">
                            {t("Titlu")}<input
                              value={fields.title}
                              onChange={(e) =>
                                setFields({ ...fields, title: e.target.value })
                              }
                            />
                          </label>
                          <label className="field">
                            {t("Furnizor")}<input
                              value={fields.supplier}
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  supplier: e.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="form-grid">
                            <label className="field">
                              {t("Valoare (")}{doc.currency || t("RON")})
                              <input
                                type="number"
                                min="0"
                                value={fields.value}
                                onChange={(e) =>
                                  setFields({
                                    ...fields,
                                    value: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              {t("Valabil până la")}<input
                                type="date"
                                value={fields.expires_at}
                                onInput={(e) => {
                                  const value = e.currentTarget.value;
                                  setFields((current) => ({
                                    ...current,
                                    expires_at: value,
                                  }));
                                }}
                                onChange={(e) =>
                                  setFields({
                                    ...fields,
                                    expires_at: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label className="field">
                            {t("Rezumat")}<textarea
                              rows={4}
                              value={fields.summary}
                              onInput={(e) =>
                                setFields({
                                  ...fields,
                                  summary: e.currentTarget.value,
                                })
                              }
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  summary: e.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="inline-actions">
                            <button
                              className="button secondary"
                              onClick={() => setEditing(false)}
                            >
                              {t("Renunță")}</button>
                            <button
                              className="button primary"
                              onClick={save}
                              disabled={busy || !fields.title.trim()}
                            >
                              {t("Salvează")}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <dl className="metadata-list">
                            <div>
                              <dt>{t("Număr")}</dt>
                              <dd>{doc.number}</dd>
                            </div>
                            <div>
                              <dt>{t("Departament")}</dt>
                              <dd>{doc.department}</dd>
                            </div>
                            <div>
                              <dt>{t("Responsabil")}</dt>
                              <dd>{doc.owner ? <DocumentPerson name={doc.owner} userId={doc.owner_id}/> : "Echipa " + doc.department}</dd>
                            </div>
                            {doc.supplier && (
                              <div>
                                <dt>{t("Furnizor")}</dt>
                                <dd>{doc.supplier}</dd>
                              </div>
                            )}
                            <div>
                              <dt>{t("Înregistrat")}</dt>
                              <dd>{date(doc.created_at)}</dd>
                            </div>
                            <div>
                              <dt>{t("Valabil până la")}</dt>
                              <dd><DocumentExpiry muted={doc.follow_up?.alerts_suppressed} expiresAt={doc.expires_at} daysRemaining={doc.days_remaining} validated={doc.validated} status={doc.status}/></dd>
                            </div>
                            {doc.value != null && (
                              <div>
                                <dt>{t("Valoare")}</dt>
                                <dd>{money(doc.value, doc.currency)}</dd>
                              </div>
                            )}
                          </dl>
                          {doc.summary && (
                            <details className="doc-summary">
                              <summary>{t("Rezumat")}</summary>
                              <p>
                                {doc.summary.startsWith(
                                  "Document încărcat. Verifică informațiile",
                                )
                                  ? t("Document introdus în registru.")
                                  : doc.summary}
                              </p>
                            </details>
                          )}
                          {doc.tags?.length > 0 && (
                            <div className="tags">
                              {doc.tags.map((t) => (
                                <span key={t}>{t}</span>
                              ))}
                            </div>
                          )}
                          {canEdit &&
                            !["signed", "archived"].includes(doc.status) && (
                              <button
                                className="text-button edit-metadata"
                                onClick={() => setEditing(true)}
                              >
                                <PenLine size={14} />
                                {t("Corectează informațiile")}</button>
                            )}
                          {doc.extraction_evidence?.length ? (
                            <details className="evidence-details">
                              <summary>
                                {t("Fragmente sursă")}{" "}
                                <span>{doc.extraction_evidence.length}</span>
                              </summary>
                              {doc.extraction_evidence.map((e, i) => (
                                <div className="evidence-item" key={i}>
                                  <strong>
                                    {(
                                      {
                                        supplier: "Furnizor",
                                        expires_at: "Data expirării",
                                        value: "Valoare",
                                        iban: "IBAN",
                                      } as Record<string, string>
                                    )[e.field] || e.field}{" "}
                                    {t("· pagina")}{' '}{e.page}
                                  </strong>
                                  <p>„{e.excerpt}”</p>
                                </div>
                              ))}
                            </details>
                          ) : null}
                        </>
                      )}
                      </>}
                    </>
                  )}
                  {tab === "procurement" && <ProcurementDocumentPanel documentId={id} documentVersion={doc.version} extractionStatus={doc.extraction_status}
                    notify={notify} onChanged={() => {onChanged(); void load()}} />}
                  {tab === "workflow" && (
                    <>
                      <h2 className="tab-title">{t("Traseu · versiunea")}{' '}{doc.version}</h2>
                      {doc.workflow?.diagram ? <DocumentStateFlow key={doc.id+doc.version} diagram={doc.workflow.diagram}/> : <div className="workflow-steps">
                        {(
                          doc.workflow?.steps || [
                            { label: "Înregistrat", status: "completed" },
                            {
                              label: "Verificare metadate",
                              status: doc.validated ? "completed" : "pending",
                            },
                            {
                              label: "Aprobare",
                              status: ["approved", "signed"].includes(
                                doc.status,
                              )
                                ? "completed"
                                : "pending",
                            },
                            {
                              label: "Semnare",
                              status:
                                doc.status === "signed"
                                  ? "completed"
                                  : "pending",
                            },
                          ]
                        ).map((step, i) => (
                          <div
                            className={`workflow-step ${step.status}`}
                            key={i}
                          >
                            <span>
                              {["completed", "done", "approved"].includes(
                                step.status,
                              ) ? (
                                <Check size={14} />
                              ) : (
                                i + 1
                              )}
                            </span>
                            <div>
                              <strong>{t(step.label)}</strong>
                              {step.actor && (
                                <small>
                                  <DocumentPerson name={step.actor} userId={step.actor_id}/>
                                  {step.at ? t(" · {p0}", {p0:date(step.at)}) : ""}
                                </small>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      }
                      <div className="note-box">
                        <ShieldCheck size={18} />
                        <p>
                          {t("O versiune nouă necesită o nouă aprobare.")}</p>
                      </div>
                      {doc.status === "signed" && (
                        <button
                          className="button secondary full-width"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              setVerification(
                                await api(`/documents/${id}/verify`),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <ShieldCheck size={17} />
                          {t("Verifică semnătura")}</button>
                      )}
                      {verification && (
                        <div
                          className={`verification-result ${verification.integrity ? "ok" : "failed"}`}
                        >
                          <strong>
                            {verification.integrity
                              ? t("Integritatea este confirmată")
                              : t("Verificarea nu a trecut")}
                          </strong>
                          <p>
                            <PersonReference userId={verification.signer} name={verification.signer === user.id ? user.name : verification.signer || 'Semnatar neidentificat'}/>
                          </p>
                          <small>
                            {t("Certificat local, fără statut de semnătură calificată.")}</small>
                        </div>
                      )}
                    </>
                  )}
                  {tab === "history" && (
                    <>
                      <h2 className="tab-title">{t("Versiuni păstrate")}</h2>
                      <div className="version-list">
                        {(
                          doc.versions || [
                            {
                              version: doc.version,
                              created_at: doc.created_at,
                            },
                          ]
                        ).map((v) => (
                          <a
                            className="version-item"
                            key={v.version}
                            href={fileUrl(
                              v.file_url ||
                                `/api/documents/${doc.id}/file?version=${v.version}`,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            title={t("Deschide versiunea {p0}", {p0:v.version})}
                          >
                            <span>{t("V")}{v.version}</span>
                            <div>
                              <strong>
                                {v.version === doc.version
                                  ? t("Versiunea curentă")
                                  : t("Versiune anterioară")}
                              </strong>
                              <small>{time(v.created_at)}</small>
                            </div>
                            {v.version === doc.version ? (
                              <Check size={16} />
                            ) : (
                              <ExternalLink size={14} />
                            )}
                          </a>
                        ))}
                      </div>
                      {canEdit &&
                        !["signed", "archived"].includes(doc.status) && (
                          <>
                            <input
                              ref={versionInput}
                              className="sr-only"
                              type="file"
                              accept=".pdf"
                              aria-label={t("Încarcă o versiune nouă")}
                              onChange={(e) => newVersion(e.target.files?.[0])}
                            />
                            <button
                              className="button secondary full-width"
                              disabled={busy}
                              onClick={() => versionInput.current?.click()}
                            >
                              <Upload size={15} />
                              {t("Încarcă o versiune nouă")}</button>
                          </>
                        )}
                      <h2 className="tab-title history-title">{t("Activitate")}</h2>
                      <div className="detail-history">
                        {doc.audit?.map((a) => (
                          <div key={a.id}>
                            <span className="history-dot" />
                            <div>
                              <strong>
                                {actionLabel[a.action] || a.action}
                              </strong>
                              <small>
                                <DocumentPerson name={a.actor} userId={a.actor_id}/> · {time(a.created_at)}
                              </small>
                              {typeof a.detail === "string" && a.detail && (
                                <p>{a.detail}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <DocumentActivity doc={doc}/>
              {doc.related_documents && doc.related_documents.length > 0 && (
                <div className="panel related-panel">
                  <h2>{t("În același dosar")}{' '}<span className="count-badge">{doc.related_documents.length}</span></h2>
                  <div className="related-documents">
                    {doc.related_documents.map((rel) => (
                      <a
                        key={rel.id}
                        href={documentHref(rel.id, origin)}
                        onClick={event => {
                          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          onOpen(rel.id);
                        }}
                      >
                        <FileIcon category={rel.category} />
                        <span>
                          <strong>{rel.title}</strong>
                          <small>{rel.number}</small>
                        </span>
                        <ChevronRight size={14} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
          {sharing && (
            <ShareDialog
              document={doc}
              onClose={() => setSharing(false)}
              onShared={() => {
                setSharing(false);
                notify("Copia revizuită a fost partajată.");
                onChanged();
                load();
              }}
            />
          )}
          {confirm && (
            <Modal
              title={
                confirm === "reject"
                  ? t("Ce trebuie corectat?")
                  : confirm === "sign"
                    ? t("Semnezi această versiune?")
                    : confirm === "archive"
                      ? t("Arhivezi acest document?")
                      : t("Aprobi acest document?")
              }
              subtitle={t("{p0} · Versiunea {p1}", {p0:doc.number,p1:doc.version})}
              onClose={() => setConfirm(undefined)}
            >
              <div className="modal-body">
                <p className="dialog-copy">
                  {confirm === "archive"
                    ? t("Documentul și istoricul său vor rămâne în registru, în secțiunea Arhivă. Nu se șterge niciun fișier.")
                    : confirm === "sign"
                      ? t("Semnătura se aplică exact PDF-ului afișat. Versiunea semnată va fi păstrată fără modificări. Certificatul este local, fără statut de semnătură calificată.")
                      : confirm === "reject"
                        ? t("Lasă un motiv clar pentru colegul care va actualiza documentul.")
                        : t("Confirmă că ai verificat conținutul și informațiile acestei versiuni.")}
                </p>
                <label className="field">
                  {confirm === "reject"
                    ? t("Motivul returnării")
                    : t("Observații (opțional)")}
                  <textarea
                    rows={3}
                    value={reason}
                    onInput={(e) => setReason(e.currentTarget.value)}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("Adaugă context pentru echipă…")}
                  />
                </label>
                {error && <ErrorMessage message={error} />}
                <div className="modal-footer">
                  <button
                    className="button secondary"
                    onClick={() => setConfirm(undefined)}
                  >
                    {t("Renunță")}</button>
                  <button
                    className={`button ${confirm === "reject" ? "danger" : "primary"}`}
                    disabled={busy || (confirm === "reject" && !reason.trim())}
                    onClick={() => act(confirm)}
                  >
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Check size={17} />
                    )}{" "}
                    {confirm === "reject"
                      ? t("Returnează")
                      : confirm === "sign"
                        ? t("Semnează versiunea")
                        : confirm === "archive"
                          ? t("Arhivează documentul")
                          : t("Confirmă aprobarea")}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
