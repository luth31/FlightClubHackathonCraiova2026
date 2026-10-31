import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ClipboardCheck,
  FileText,
  Landmark,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  LoaderCircle,
  X,
} from "lucide-react";
import { api } from "@/services/api-client";
import { Empty, ErrorMessage, Loading, Modal } from "@/components/ui";
import { date, money, time } from "@/utils/format";
import type { User } from "@/types";
import "./suppliers.css";
interface Supplier {
  id: string;
  name: string;
  document_id: string;
  expected_iban: string;
  verified_contact: string;
  trust_status: string;
  bank_history: Array<{
    iban: string;
    version: number;
    created_at: string;
    verified_by?: string;
    approved_by?: string;
  }>;
}
interface Review {
  id: string;
  document_id?: string;
  source_version?: number;
  supplier_name: string;
  expected_iban: string;
  observed_iban: string;
  sender_email: string;
  verified_contact: string;
  invoice_amount?: number;
  message: string;
  reasons: Array<{ code: string; message: string }>;
  status: string;
  created_by: string;
  created_at: string;
  verified_by?: string;
  verified_at?: string;
  approved_by?: string;
  approved_at?: string;
  verification_note?: string;
  decision_note?: string;
  risk_level: string;
  iban_valid: boolean;
  can_verify: boolean;
  can_approve: boolean;
  duplicate?: boolean;
}
interface Registry {
  items: Review[];
  total: number;
  suppliers: Supplier[];
  counters: {
    needs_review: number;
    verified: number;
    approved: number;
    clear: number;
  };
  notice: string;
}
const labels: Record<string, string> = {
  needs_review: "Necesită verificare",
  verified: "Verificat independent",
  approved: "Aprobat intern",
  clear: "Fără diferențe",
  rejected: "Respins",
};
function ReviewStatus({ status }: { status: string }) {
  return (
    <span className={`supplier-status review-${status}`}>
      <span />
      {labels[status] || status}
    </span>
  );
}
const groupedIban = (iban: string) =>
  iban
    ?.replace(/\s/g, "")
    .match(/.{1,4}/g)
    ?.join(" ") || "Nu există în registru";
export function SuppliersPage({
  revision,
  notify,
  onOpen,
  user,
}: {
  revision: number;
  notify: (s: string) => void;
  onOpen: (id: string) => void;
  user: User;
}) {
  const [data, setData] = useState<Registry>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("reviews"),
    [query, setQuery] = useState(""),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Review>(),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    api<Registry>("/supplier-reviews")
      .then((v) => {
        if (active) {
          setData(v);
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
  const changed = (item: Review, message: string) => {
    setSelected(item);
    setCreate(false);
    setRefresh((n) => n + 1);
    notify(message);
  };
  const cases = data?.items.filter((c) =>
    `${c.supplier_name} ${c.sender_email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const suppliers = data?.suppliers.filter((s) =>
    `${s.name} ${s.verified_contact}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DETALII CONFIRMATE. DECIZII SEPARATE.</div>
          <h1>Furnizori</h1>
          <p>Verifică solicitările primite înainte să modifici registrul.</p>
        </div>
        <button
          className="button primary"
          disabled={!data}
          onClick={() => setCreate(true)}
        >
          <Plus size={17} />
          Verifică o solicitare
        </button>
      </div>
      <div className="supplier-intro">
        <ShieldCheck size={24} />
        <div>
          <strong>Un cont nou merită o a doua verificare.</strong>
          <p>
            Compară detaliile cu registrul, confirmă prin contactul cunoscut și
            cere decizia unui alt coleg.
          </p>
        </div>
        <span>Fără acces la e-mail sau plăți</span>
      </div>
      {error ? (
        <ErrorMessage message={error} retry={() => setRefresh((n) => n + 1)} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="supplier-summary">
            <div>
              <ShieldAlert size={19} />
              <strong>{data.counters.needs_review}</strong>
              <span>de verificat</span>
            </div>
            <div>
              <UserRound size={19} />
              <strong>{data.counters.verified}</strong>
              <span>așteaptă a doua persoană</span>
            </div>
            <div>
              <Building2 size={19} />
              <strong>{data.suppliers.length}</strong>
              <span>furnizori în registru</span>
            </div>
          </div>
          <div className="panel">
            <div className="library-tabs">
              <button
                className={tab === "reviews" ? "active" : ""}
                onClick={() => setTab("reviews")}
              >
                Verificări<span>{data.total}</span>
              </button>
              <button
                className={tab === "registry" ? "active" : ""}
                onClick={() => setTab("registry")}
              >
                Registru furnizori<span>{data.suppliers.length}</span>
              </button>
            </div>
            <div className="filters">
              <label className="search-input">
                <Search size={17} />
                <input
                  aria-label="Caută un furnizor"
                  placeholder="Caută furnizorul sau contactul…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="result-count">
                {tab === "reviews" ? cases?.length : suppliers?.length}{" "}
                rezultate
              </span>
            </div>
            {tab === "reviews" ? (
              cases?.length ? (
                <div className="supplier-reviews-list">
                  {cases.map((c) => (
                    <button
                      className="supplier-review-row"
                      key={c.id}
                      onClick={() => setSelected(c)}
                    >
                      <span
                        className={`review-icon ${c.status === "needs_review" ? "attention" : ""}`}
                      >
                        {c.status === "needs_review" ? (
                          <ShieldAlert size={21} />
                        ) : (
                          <ClipboardCheck size={21} />
                        )}
                      </span>
                      <span className="review-row-copy">
                        <strong>{c.supplier_name}</strong>
                        <small>
                          {c.reasons.length
                            ? c.reasons[0].message
                            : "IBAN-ul și expeditorul coincid cu registrul."}
                        </small>
                      </span>
                      <span className="review-row-date">
                        {date(c.created_at)}
                      </span>
                      <ReviewStatus status={c.status} />
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Încă nu sunt solicitări de verificat"
                  message="Pornește cu un exemplu demonstrativ sau introdu detaliile unei solicitări."
                >
                  <button
                    className="button secondary"
                    onClick={() => setCreate(true)}
                  >
                    Prima verificare
                    <ArrowRight size={16} />
                  </button>
                </Empty>
              )
            ) : suppliers?.length ? (
              <div className="supplier-registry">
                {suppliers.map((s) => (
                  <article className="supplier-registry-card" key={s.id}>
                    <div className="supplier-card-heading">
                      <span className="welcome-symbol">
                        <Building2 size={21} />
                      </span>
                      <div>
                        <h3>{s.name}</h3>
                        <small>
                          {s.trust_status === "demo_verified"
                            ? "Date fictive, verificate în scenariu"
                            : "Modificare aprobată de două persoane"}
                        </small>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>
                          <Landmark size={13} />
                          Cont în registru
                        </dt>
                        <dd className="iban">{groupedIban(s.expected_iban)}</dd>
                      </div>
                      <div>
                        <dt>
                          <Mail size={13} />
                          Contact cunoscut
                        </dt>
                        <dd>{s.verified_contact}</dd>
                      </div>
                    </dl>
                    <div className="supplier-card-footer">
                      <button
                        className="text-button"
                        onClick={() => onOpen(s.document_id)}
                      >
                        Contractul sursă
                        <ArrowUpRight size={14} />
                      </button>
                      <span>
                        {s.bank_history.length}{" "}
                        {s.bank_history.length === 1 ? "versiune" : "versiuni"}{" "}
                        de cont păstrate
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="Niciun furnizor găsit" />
            )}
          </div>
          <p className="supplier-disclaimer">
            Verificări pe date demonstrative. Un rezultat fără diferențe nu
            confirmă legitimitatea mesajului sau proprietarul contului. AeroDesk
            nu execută și nu blochează plăți externe.
          </p>
        </>
      )}
      {create && data && (
        <NewReview
          suppliers={data.suppliers}
          onClose={() => setCreate(false)}
          onOpen={onOpen}
          onCreated={(c) =>
            changed(
              c,
              c.duplicate
                ? "Această solicitare a fost deja verificată."
                : "Verificarea a fost înregistrată.",
            )
          }
        />
      )}
      {selected && (
        <ReviewDetail
          review={selected}
          user={user}
          onClose={() => setSelected(undefined)}
          onOpen={onOpen}
          onChanged={changed}
        />
      )}
    </>
  );
}
function NewReview({
  suppliers,
  onClose,
  onOpen,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreated: (r: Review) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || ""),
    [sender, setSender] = useState(""),
    [iban, setIban] = useState(""),
    [amount, setAmount] = useState(""),
    [serviceDate, setServiceDate] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const supplier = suppliers.find((s) => s.id === supplierId);
  function example(mode: string) {
    if (!supplier) return;
    const other = suppliers.find(
      (s) => s.expected_iban !== supplier.expected_iban,
    );
    setSender(
      mode === "lookalike"
        ? supplier.verified_contact.replace("@", "@a")
        : supplier.verified_contact,
    );
    setIban(
      mode === "matched"
        ? supplier.expected_iban
        : other?.expected_iban || supplier.expected_iban,
    );
    setMessage(
      mode === "matched"
        ? "Vă transmitem datele aferente facturii pentru serviciile prestate."
        : mode === "lookalike"
          ? "Vă rugăm să utilizați noul cont IBAN pentru următoarea plată."
          : "Vă informăm că am actualizat contul bancar. Vă rugăm să confirmați modificarea.",
    );
    setAmount("");
    setServiceDate("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supplier) return;
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api<Review>("/supplier-reviews", {
          method: "POST",
          body: JSON.stringify({
            document_id: supplier.document_id,
            observed_iban: iban,
            sender_email: sender,
            invoice_amount: amount ? Number(amount) : null,
            service_date: serviceDate || null,
            message,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Verifică o solicitare"
      subtitle="Compară informațiile primite cu un contract și cu registrul furnizorului."
      wide
      onClose={onClose}
    >
      <form onSubmit={submit} className="new-review-grid">
        <aside className="supplier-baseline">
          <div className="step-label">
            <span>1</span>Referința din registru
          </div>
          <label className="field">
            Furnizor
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {supplier ? (
            <>
              <div className="baseline-label">
                <ShieldCheck size={15} />
                Datele păstrate în registru
              </div>
              <dl>
                <dt>IBAN de referință</dt>
                <dd className="iban">{groupedIban(supplier.expected_iban)}</dd>
                <dt>Contact cunoscut</dt>
                <dd>{supplier.verified_contact}</dd>
              </dl>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onClose();
                  onOpen(supplier.document_id);
                }}
              >
                <FileText size={14} />
                Deschide contractul sursă
                <ArrowUpRight size={14} />
              </button>
              <div className="note-box">
                <ShieldCheck size={18} />
                <p>
                  {supplier.trust_status === "demo_verified"
                    ? "Registru fictiv verificat pentru demonstrație."
                    : "Date aprobate prin verificare independentă și decizia unui alt coleg."}{" "}
                  Un IBAN valid nu dovedește cine deține contul.
                </p>
              </div>
            </>
          ) : (
            <Empty title="Niciun contract disponibil" />
          )}
        </aside>
        <div className="supplier-request">
          <div className="step-label">
            <span>2</span>Informațiile primite
          </div>
          <label className="field demo-example">
            Completează un exemplu
            <select defaultValue="" onChange={(e) => example(e.target.value)}>
              <option value="" disabled>
                Alege un scenariu demonstrativ
              </option>
              <option value="matched">Aceleași date ca în registru</option>
              <option value="changed">Contact cunoscut, IBAN diferit</option>
              <option value="lookalike">
                Adresă asemănătoare, IBAN diferit
              </option>
            </select>
          </label>
          <label className="field">
            Adresa expeditorului
            <input
              required
              type="email"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="contact@furnizor.example"
            />
          </label>
          <label className="field">
            IBAN comunicat
            <input
              required
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="RO00 DEMO 0000 0000 0000 0000"
              autoComplete="off"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Valoare factură · RON <small>Opțional</small>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Data prestației <small>Opțional</small>
              <input
                type="date"
                value={serviceDate}
                onInput={(e) => setServiceDate(e.currentTarget.value)}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Conținutul solicitării
            <textarea
              rows={3}
              value={message}
              onInput={(e) => setMessage(e.currentTarget.value)}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introdu fragmentul relevant din mesaj sau factură…"
            />
          </label>
          {error && <ErrorMessage message={error} />}
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Renunță
            </button>
            <button className="button primary" disabled={busy || !supplier}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
              Compară detaliile
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
function ReviewDetail({
  review: r,
  user,
  onClose,
  onOpen,
  onChanged,
}: {
  review: Review;
  user: User;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: (r: Review, message: string) => void;
}) {
  const [mode, setMode] = useState<"verify" | "approve" | "reject">(),
    [note, setNote] = useState(""),
    [contact, setContact] = useState(r.verified_contact),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setMode(undefined);
    setNote("");
    setError("");
  }, [r.id, r.status]);
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<Review>(`/supplier-reviews/${r.id}/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "verify"
            ? { contact_used: contact, note }
            : { comment: note },
        ),
      });
      onChanged(
        updated,
        mode === "verify"
          ? "Verificarea independentă a fost înregistrată."
          : mode === "approve"
            ? "Decizia celei de-a doua persoane a fost înregistrată."
            : "Solicitarea a fost respinsă.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={r.supplier_name}
      subtitle={`Verificare înregistrată la ${time(r.created_at)}`}
      wide
      onClose={onClose}
    >
      <div className="review-detail">
        <div className="review-result-heading">
          <ReviewStatus status={r.status} />
          {r.document_id && (
            <button
              className="text-button"
              onClick={() => {
                onClose();
                onOpen(r.document_id!);
              }}
            >
              Contract sursă · v{r.source_version}
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
        {r.reasons.length > 0 ? (
          <div className="review-reasons">
            <ShieldAlert size={21} />
            <div>
              <strong>
                {r.status === "approved"
                  ? "Diferențe analizate și aprobate"
                  : r.status === "rejected"
                    ? "Diferențe consemnate"
                    : r.reasons.length === 1
                      ? "O diferență necesită atenție"
                      : "Diferențe care necesită atenție"}
              </strong>
              {r.reasons.map((reason) => (
                <p key={reason.code}>{reason.message}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="review-positive">
            <CheckCheck size={21} />
            <div>
              <strong>Detaliile coincid cu registrul.</strong>
              <p>
                Rezultatul nu confirmă legitimitatea solicitării. Nicio plată nu
                a fost inițiată.
              </p>
            </div>
          </div>
        )}
        <div className="comparison-grid">
          <div>
            <h3>
              <ShieldCheck size={16} />
              În registru, la verificare
            </h3>
            <dl>
              <dt>IBAN de referință</dt>
              <dd className="iban">{groupedIban(r.expected_iban)}</dd>
              <dt>Contact cunoscut</dt>
              <dd>{r.verified_contact || "Fără contact verificat"}</dd>
            </dl>
          </div>
          <div>
            <h3>
              <Mail size={16} />
              În solicitare
            </h3>
            <dl>
              <dt>IBAN comunicat</dt>
              <dd
                className={`iban ${r.expected_iban !== r.observed_iban ? "mismatch" : ""}`}
              >
                {groupedIban(r.observed_iban)}
              </dd>
              <dt>Expeditor</dt>
              <dd
                className={
                  r.sender_email !== r.verified_contact ? "mismatch" : ""
                }
              >
                {r.sender_email}
              </dd>
              {r.invoice_amount != null && (
                <>
                  <dt>Valoare factură</dt>
                  <dd>{money(r.invoice_amount)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
        {r.message && (
          <blockquote className="request-excerpt">{r.message}</blockquote>
        )}
        {r.verification_note && (
          <div className="recorded-decision">
            <UserRound size={17} />
            <div>
              <strong>Verificare independentă înregistrată</strong>
              <p>{r.verification_note}</p>
              <small>
                {r.verified_by === user.id ? user.name : r.verified_by} ·{" "}
                {r.verified_at ? time(r.verified_at) : ""}
              </small>
            </div>
          </div>
        )}
        {r.decision_note && (
          <div className="recorded-decision">
            <ClipboardCheck size={17} />
            <div>
              <strong>
                {r.status === "rejected"
                  ? "Motivul respingerii"
                  : "Decizia celei de-a doua persoane"}
              </strong>
              <p>{r.decision_note}</p>
              <small>
                {r.approved_by === user.id ? user.name : r.approved_by}
              </small>
            </div>
          </div>
        )}
        {r.status === "verified" && !r.can_approve && (
          <div className="note-box">
            <UserRound size={18} />
            <p>
              {r.verified_by === user.id
                ? "Un alt coleg autorizat trebuie să aprobe această confirmare. Nu îți poți aproba propria verificare."
                : "Există și neconcordanțe de contract sau factură. Verificarea contactului nu le rezolvă."}
            </p>
          </div>
        )}
        {!mode && (
          <div className="review-detail-actions">
            {["needs_review", "verified"].includes(r.status) && (
              <button
                className="button secondary"
                onClick={() => setMode("reject")}
              >
                <X size={16} />
                Respinge solicitarea
              </button>
            )}
            {r.can_verify && (
              <button
                className="button primary"
                onClick={() => setMode("verify")}
              >
                <ShieldCheck size={16} />
                Înregistrează verificarea independentă
              </button>
            )}
            {r.can_approve && (
              <button
                className="button primary"
                onClick={() => setMode("approve")}
              >
                <Check size={16} />
                Aprobă modificarea
              </button>
            )}
          </div>
        )}
        {mode && (
          <form onSubmit={decide} className="review-decision-form">
            <h3>
              {mode === "verify"
                ? "Confirmă printr-un contact cunoscut"
                : mode === "approve"
                  ? "Decizia celei de-a doua persoane"
                  : "Motivul respingerii"}
            </h3>
            {mode === "verify" && (
              <>
                <p>
                  Înregistrează rezultatul verificării realizate separat de
                  solicitarea primită. Această acțiune este o confirmare umană,
                  nu un contact automat.
                </p>
                <label className="field">
                  Contact utilizat
                  <input
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="field">
              {mode === "verify"
                ? "Dovada / rezultatul verificării"
                : "Observații"}
              <textarea
                rows={3}
                required={mode !== "approve"}
                minLength={mode === "verify" ? 10 : mode === "reject" ? 1 : 0}
                value={note}
                onInput={(e) => setNote(e.currentTarget.value)}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === "verify"
                    ? "Ce ai confirmat, prin cine și când…"
                    : "Contextul deciziei pentru colegi…"
                }
              />
            </label>
            {error && <ErrorMessage message={error} />}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setMode(undefined)}
              >
                Renunță
              </button>
              <button
                className={`button ${mode === "reject" ? "danger" : "primary"}`}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Check size={16} />
                )}{" "}
                {mode === "verify"
                  ? "Salvează verificarea"
                  : mode === "approve"
                    ? "Confirmă aprobarea"
                    : "Confirmă respingerea"}
              </button>
            </div>
          </form>
        )}
        <p className="supplier-disclaimer">
          AeroDesk păstrează dovezile și deciziile. Acest flux nu execută și nu
          blochează plăți într-un sistem financiar extern.
        </p>
      </div>
    </Modal>
  );
}
