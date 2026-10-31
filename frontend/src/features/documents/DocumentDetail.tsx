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
  LoaderCircle,
  ExternalLink,
  Upload,
  ChevronRight,
} from "lucide-react";
import { api, fileUrl, download } from "@/services/api-client";
import {
  Loading,
  ErrorMessage,
  Status,
  FileIcon,
  Modal,
} from "@/components/ui";
import { ShareDialog } from "@/features/sharing";
import { date, time, money, actionLabel } from "@/utils/format";
import type { DocumentRecord, User } from "@/types";
export function DocumentDetail({
  id,
  onClose,
  onChanged,
  notify,
  user,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  notify: (s: string) => void;
  user: User;
}) {
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
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      const d = await api<DocumentRecord>(`/documents/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action,
          comment: reason,
          version: doc?.version,
        }),
      });
      setDoc(d);
      setConfirm(undefined);
      setReason("");
      notify(
        (
          {
            validate: "Metadatele au fost validate.",
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
  // Keep the preserved document visible while changes are recorded separately.
  const isLocked = ["signed", "archived"].includes(doc?.status || "");
  const isContractDocument = ["Contract", "Act adițional"].includes(
    doc?.category || "",
  );
  const lockedNotice = isContractDocument
    ? "PDF-ul și istoricul acestui document sunt păstrate. Pentru schimbarea clauzelor contractuale, înregistrează un act adițional separat."
    : "PDF-ul și istoricul acestui document sunt păstrate. Înregistrează eventualele revizii ca documente separate.";
  const canShare =
    doc?.permissions?.can_share ??
    ((user.roles || []).some((r) => ["director", "reviewer"].includes(r)) &&
      doc?.department !== "Resurse umane");
  return (
    <div className="detail-page">
      <button className="back-button" onClick={onClose}>
        <ArrowLeft size={16} />
        Înapoi la spațiul de lucru
      </button>
      {!doc ? (
        error ? (
          <ErrorMessage message={error} retry={load} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <div className="detail-heading">
            <FileIcon category={doc.category} large />
            <div>
              <div className="detail-kicker">
                {doc.number}
                <span>·</span>
                {doc.category}
                <span>·</span>Versiunea {doc.version}
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
                Descarcă PDF
              </button>
              {["approved", "signed"].includes(doc.status) && canShare && (
                <button
                  className="button secondary small-button"
                  onClick={() => setSharing(true)}
                >
                  <Share2 size={15} />
                  Partajează
                </button>
              )}
              {["approved", "signed"].includes(doc.status) && canReview && (
                <button
                  className="button secondary small-button"
                  onClick={() => setConfirm("archive")}
                >
                  <Archive size={15} />
                  Arhivează
                </button>
              )}
            </div>
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="detail-layout">
            <div className="pdf-panel">
              <div className="pdf-toolbar">
                <FileIcon category={doc.category} />
                <span>{doc.filename || `${doc.number}.pdf`}</span>
                <a
                  className="icon-button"
                  href={fileUrl(`${doc.file_url}?version=${doc.version}`)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Deschide PDF într-o filă nouă"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
              <div className="mobile-pdf-open">
                <FileIcon category={doc.category} large />
                <strong>Document PDF · versiunea {doc.version}</strong>
                <a
                  className="button secondary"
                  href={fileUrl(`${doc.file_url}?version=${doc.version}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                  Vezi documentul
                </a>
              </div>
              <iframe
                key={`${doc.id}:${doc.version}:${doc.status}`}
                title={`PDF: ${doc.title} · versiunea ${doc.version}`}
                src={`${fileUrl(`${doc.file_url}?version=${doc.version}`)}#toolbar=1&navpanes=0&view=FitH`}
              />
            </div>
            <aside className="document-side">
              <div className="panel document-info">
                <div className="detail-tabs">
                  {[
                    ["details", "Informații", Info],
                    ["workflow", "Aprobări", FileCheck2],
                    ["history", "Istoric", History],
                  ].map(([key, label, Icon]) => (
                    <button
                      key={key as string}
                      className={tab === key ? "active" : ""}
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
                          Informații validate de un coleg
                        </div>
                      ) : (
                        <div className="unverified-line">
                          <Clock3 size={14} />
                          Informații de verificat
                        </div>
                      )}
                      {!doc.validated &&
                        doc.extraction_status === "needs-ocr" && (
                          <p className="scan-notice">
                            Acest PDF este scanat. Completează informațiile din
                            document înainte de confirmare.
                          </p>
                        )}
                      {editing ? (
                        <div className="edit-fields">
                          <div className="note-box">
                            <Info size={18} />
                            <p>
                              Corectează informațiile din registru pe baza
                              PDF-ului. Această corecție nu modifică fișierul sau
                              clauzele contractuale. Informațiile corectate vor
                              necesita o nouă validare și aprobare.
                            </p>
                          </div>
                          <label className="field">
                            Titlu
                            <input
                              value={fields.title}
                              onChange={(e) =>
                                setFields({ ...fields, title: e.target.value })
                              }
                            />
                          </label>
                          <label className="field">
                            Furnizor
                            <input
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
                              Valoare ({doc.currency || "RON"})
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
                              Valabil până la
                              <input
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
                            Rezumat
                            <textarea
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
                              Renunță
                            </button>
                            <button
                              className="button primary"
                              onClick={save}
                              disabled={busy || !fields.title.trim()}
                            >
                              Salvează
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <dl className="metadata-list">
                            <div>
                              <dt>Număr de înregistrare</dt>
                              <dd>{doc.number}</dd>
                            </div>
                            <div>
                              <dt>Departament</dt>
                              <dd>{doc.department}</dd>
                            </div>
                            <div>
                              <dt>Responsabil</dt>
                              <dd>{doc.owner || "Echipa " + doc.department}</dd>
                            </div>
                            {doc.supplier && (
                              <div>
                                <dt>Furnizor / partener</dt>
                                <dd>{doc.supplier}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Data înregistrării</dt>
                              <dd>{date(doc.created_at)}</dd>
                            </div>
                            <div>
                              <dt>Valabil până la</dt>
                              <dd
                                className={
                                  doc.days_remaining != null &&
                                  doc.days_remaining <= 60
                                    ? "amber-text"
                                    : ""
                                }
                              >
                                {date(doc.expires_at)}
                              </dd>
                            </div>
                            {doc.value != null && (
                              <div>
                                <dt>Valoare</dt>
                                <dd>{money(doc.value, doc.currency)}</dd>
                              </div>
                            )}
                          </dl>
                          {doc.summary && (
                            <div className="doc-summary">
                              <h2>Pe scurt</h2>
                              <p>
                                {doc.summary.startsWith(
                                  "Document încărcat. Verifică informațiile",
                                )
                                  ? "Document introdus în registru."
                                  : doc.summary}
                              </p>
                            </div>
                          )}
                          {doc.tags?.length > 0 && (
                            <div className="tags">
                              {doc.tags.map((t) => (
                                <span key={t}>{t}</span>
                              ))}
                            </div>
                          )}
                          {isLocked && (
                            <div className="note-box">
                              <ShieldCheck size={18} />
                              <p>
                                <strong>
                                  {doc.status === "signed"
                                    ? "Document semnat. "
                                    : "Document arhivat. "}
                                </strong>
                                {lockedNotice}
                              </p>
                            </div>
                          )}
                          {canEdit && !isLocked && (
                            <button
                              className="text-button edit-metadata"
                              onClick={() => setEditing(true)}
                            >
                              <PenLine size={14} />
                              Corectează informațiile
                            </button>
                          )}
                          {doc.extraction_evidence?.length ? (
                            <details className="evidence-details">
                              <summary>
                                Fragmente sursă{" "}
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
                                    · pagina {e.page}
                                  </strong>
                                  <p>„{e.excerpt}”</p>
                                </div>
                              ))}
                            </details>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                  {tab === "workflow" && (
                    <>
                      <h2 className="tab-title">Traseul documentului</h2>
                      <div className="workflow-steps">
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
                              <strong>{step.label}</strong>
                              {step.actor && (
                                <small>
                                  {step.actor}
                                  {step.at ? ` · ${date(step.at)}` : ""}
                                </small>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="note-box">
                        <ShieldCheck size={18} />
                        <p>
                          {isLocked
                            ? lockedNotice
                            : `Deciziile se aplică versiunii ${doc.version}. O versiune nouă va necesita o nouă aprobare.`}
                        </p>
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
                          Verifică semnătura
                        </button>
                      )}
                      {verification && (
                        <div
                          className={`verification-result ${verification.integrity ? "ok" : "failed"}`}
                        >
                          <strong>
                            {verification.integrity
                              ? "Integritatea este confirmată"
                              : "Verificarea nu a trecut"}
                          </strong>
                          <p>
                            {verification.signer === user.id
                              ? user.name
                              : verification.signer || "Semnatar demo"}
                          </p>
                          <small>
                            Certificat demonstrativ, nu semnătură calificată.
                          </small>
                        </div>
                      )}
                    </>
                  )}
                  {tab === "history" && (
                    <>
                      <h2 className="tab-title">Versiuni păstrate</h2>
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
                            title={`Deschide versiunea ${v.version}`}
                          >
                            <span>V{v.version}</span>
                            <div>
                              <strong>
                                {v.version === doc.version
                                  ? "Versiunea curentă"
                                  : "Versiune anterioară"}
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
                      {isLocked && (
                        <div className="note-box">
                          <ShieldCheck size={18} />
                          <p>{lockedNotice}</p>
                        </div>
                      )}
                      {canEdit && !isLocked && (
                        <>
                          <div className="note-box">
                            <Info size={18} />
                            <p>
                              Încarcă o revizie a PDF-ului înainte de semnare.
                              Versiunile anterioare rămân în istoric, iar
                              revizia necesită o nouă validare și aprobare.
                            </p>
                          </div>
                          <input
                            ref={versionInput}
                            className="sr-only"
                            type="file"
                            accept=".pdf"
                            aria-label="Încarcă o revizie PDF"
                            onChange={(e) => newVersion(e.target.files?.[0])}
                          />
                          <button
                            className="button secondary full-width"
                            disabled={busy}
                            onClick={() => versionInput.current?.click()}
                          >
                            <Upload size={15} />
                            Încarcă o revizie PDF
                          </button>
                        </>
                      )}
                      <h2 className="tab-title history-title">Activitate</h2>
                      <div className="detail-history">
                        {doc.audit?.map((a) => (
                          <div key={a.id}>
                            <span className="history-dot" />
                            <div>
                              <strong>
                                {actionLabel[a.action] || a.action}
                              </strong>
                              <small>
                                {a.actor} · {time(a.created_at)}
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
              {!["archived", "signed"].includes(doc.status) && (
                <div className="panel document-actions">
                  {doc.workflow?.task?.status === "pending" && (
                    <div className="document-task-owner">
                      <span>
                        Responsabil:{" "}
                        <strong>{doc.workflow.task.assignee}</strong>
                      </span>
                      <small>Termen: {date(doc.workflow.task.due_date)}</small>
                      <a href="#approvals">
                        Vezi sarcinile echipei <ArrowRight size={13} />
                      </a>
                    </div>
                  )}
                  {doc.status === "draft" && (
                    <>
                      <h2>
                        {doc.validated
                          ? "Gata pentru următorul pas"
                          : "Verifică informațiile din PDF"}
                      </h2>
                      <p>
                        {doc.validated
                          ? "Trimite documentul persoanelor responsabile de aprobare."
                          : "Compară informațiile cu documentul, apoi confirmă că sunt corecte."}
                      </p>
                      {!doc.validated ? (
                        <button
                          className="button primary full-width"
                          disabled={busy || !canValidate || editing}
                          onClick={() => act("validate")}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <Check size={17} />
                          )}
                          Confirmă informațiile
                        </button>
                      ) : (
                        <button
                          className="button primary full-width"
                          disabled={busy || !canSubmit || editing}
                          onClick={() => act("submit")}
                        >
                          <FileCheck2 size={17} />
                          Trimite spre aprobare
                        </button>
                      )}
                    </>
                  )}
                  {doc.status === "in_review" && (
                    <>
                      <h2>O decizie, înregistrată clar.</h2>
                      <p>
                        Ai în față versiunea {doc.version} trimisă spre
                        aprobare.
                      </p>
                      {canReview ? (
                        <div className="approval-actions">
                          <button
                            className="button primary full-width"
                            disabled={busy}
                            onClick={() => setConfirm("approve")}
                          >
                            <Check size={17} />
                            Aprobă documentul
                          </button>
                          <button
                            className="button secondary full-width"
                            disabled={busy}
                            onClick={() => setConfirm("reject")}
                          >
                            Returnează pentru corectare
                          </button>
                        </div>
                      ) : (
                        <div className="note-box">
                          Documentul așteaptă decizia responsabilului desemnat.
                          Poți urmări atribuirea în Aprobări.
                        </div>
                      )}
                    </>
                  )}
                  {doc.status === "approved" && (
                    <>
                      <h2>Document aprobat</h2>
                      <p>
                        {canSign
                          ? "Aprobarea este înregistrată. Semnează această versiune sau partajează o copie revizuită."
                          : "Documentul așteaptă semnătura responsabilului desemnat."}
                      </p>
                      {canSign && (
                        <button
                          className="button primary full-width"
                          disabled={busy}
                          onClick={() => setConfirm("sign")}
                        >
                          <PenLine size={17} />
                          Semnează documentul
                        </button>
                      )}
                      <small className="quiet-note">
                        Semnătură criptografică cu certificat de demonstrație.
                      </small>
                    </>
                  )}
                </div>
              )}
              {doc.related_documents && doc.related_documents.length > 0 && (
                <div className="panel related-panel">
                  <h2>Documente în același dosar</h2>
                  <p>
                    {doc.related_documents.length} documente conectate în
                    registru
                  </p>
                  <div className="related-documents">
                    {doc.related_documents.map((rel) => (
                      <a
                        key={rel.id}
                        href={`#document/${encodeURIComponent(rel.id)}`}
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
                  ? "Ce trebuie corectat?"
                  : confirm === "sign"
                    ? "Semnezi această versiune?"
                    : confirm === "archive"
                      ? "Arhivezi acest document?"
                      : "Aprobi acest document?"
              }
              subtitle={`${doc.number} · Versiunea ${doc.version}`}
              onClose={() => setConfirm(undefined)}
            >
              <div className="modal-body">
                <p className="dialog-copy">
                  {confirm === "archive"
                    ? "Documentul și istoricul său vor rămâne în registru, în secțiunea Arhivă. Nu se șterge niciun fișier."
                    : confirm === "sign"
                      ? "Semnătura se aplică exact PDF-ului afișat. Versiunea semnată va fi păstrată fără modificări. Certificatul este demonstrativ."
                      : confirm === "reject"
                        ? "Lasă un motiv clar pentru colegul care va actualiza documentul."
                        : "Confirmă că ai verificat conținutul și informațiile acestei versiuni."}
                </p>
                <label className="field">
                  {confirm === "reject"
                    ? "Motivul returnării"
                    : "Observații (opțional)"}
                  <textarea
                    rows={3}
                    value={reason}
                    onInput={(e) => setReason(e.currentTarget.value)}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Adaugă context pentru echipă…"
                  />
                </label>
                {error && <ErrorMessage message={error} />}
                <div className="modal-footer">
                  <button
                    className="button secondary"
                    onClick={() => setConfirm(undefined)}
                  >
                    Renunță
                  </button>
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
                      ? "Returnează"
                      : confirm === "sign"
                        ? "Semnează versiunea"
                        : confirm === "archive"
                          ? "Arhivează documentul"
                          : "Confirmă aprobarea"}
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
