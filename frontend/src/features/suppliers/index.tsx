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
import { api, download } from "@/services/api-client";
import { Empty, ErrorMessage, Modal } from "@/components/ui";
import { date, time } from "@/utils/format";
import type { User } from "@/types";
import "./suppliers.css";
import type { Supplier, Review, Registry, Registration } from './types';
import { ReviewChecks } from './ReviewChecks';
import { SupplierDetail } from './SupplierDetail';
import { RegistrationDialog } from './RegistrationDialog';
import { RegistrationDetail } from './RegistrationDetail';
import { AssignmentForm } from './AssignmentForm';
import { SupplierContent } from './SupplierContent';
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
    [catalog,setCatalog]=useState<Supplier[]>(),[catalogError,setCatalogError]=useState(''),
    [registrations,setRegistrations]=useState<Registration[]>([]),[registrationOpen,setRegistrationOpen]=useState(false),[registrationId,setRegistrationId]=useState<string>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("reviews"),
    [query, setQuery] = useState(""),
    [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Review>(),
    [refresh, setRefresh] = useState(0),
    [registryId,setRegistryId]=useState<string>(),
    [recheck,setRecheck]=useState<Review>(),
    [status,setStatus]=useState(''),[risk,setRisk]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),
    [offset,setOffset]=useState(0),[search,setSearch]=useState(''),[mine,setMine]=useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(query),250);return()=>window.clearTimeout(timer)},[query]);
  const params=new URLSearchParams({q:search,limit:'25',offset:String(offset)});
  if(status)params.set('status',status);if(risk)params.set('risk_level',risk);if(from)params.set('created_from',from);if(to)params.set('created_to',to);
  if(mine)params.set('mine','true');
  const request=params.toString();
  useEffect(() => {
    let active = true;
    api<Registry>(`/supplier-reviews?${request}`)
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
  }, [revision, refresh, request]);
  useEffect(() => {
    let active = true;
    api<{items: Supplier[]}>('/suppliers')
      .then(v => {
        if (active) {
          setCatalog(v.items);
          setCatalogError('');
        }
      })
      .catch(e => { if (active) setCatalogError(e.message); });
    return () => { active = false; };
  }, [revision, refresh]);
  useEffect(()=>{let active=true;api<{items:Registration[]}>('/supplier-registrations').then(v=>{if(active)setRegistrations(v.items)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[revision,refresh]);
  const changed = (item: Review, message: string) => {
    setSelected(item);
    setCreate(false);
    setRefresh((n) => n + 1);
    notify(message);
  };
  const cases = data?.items;
  const suppliers = catalog?.filter((s) =>
    `${s.name} ${s.verified_contact}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading supplier-page-heading">
        <div>
          <div className="eyebrow">DETALII CONFIRMATE. DECIZII SEPARATE.</div>
          <h1>Furnizori</h1>
          <p>Verifică solicitările primite înainte să modifici registrul.</p>
        </div>
        <div className="heading-actions supplier-heading-actions">
          <button className="button secondary" onClick={()=>setRegistrationOpen(true)}>
            <Building2 size={17} />
            Înregistrează furnizor
          </button>
          <button
            className="button primary"
            disabled={!data}
            onClick={() => {setRecheck(undefined);setCreate(true)}}
          >
            <Plus size={17} />
            Verifică o solicitare
          </button>
        </div>
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
      <SupplierContent error={error} loading={!data} retry={() => setRefresh((n) => n + 1)}>
      {data && (
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
              <strong>{catalog?.length ?? '—'}</strong>
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
                Registru furnizori<span>{catalog?.length ?? '—'}</span>
              </button>
            </div>
            <button className="button secondary" onClick={()=>setTab("registrations")}>Înregistrări inițiale · {registrations.length}</button>
            <div className="filters">
              <label className="search-input">
                <Search size={17} />
                <input
                  aria-label="Caută un furnizor"
                  placeholder="Caută furnizorul sau contactul…"
                  value={query}
                  onChange={(e) => {setQuery(e.target.value);setOffset(0)}}
                />
              </label>
              <span className="result-count">
                {tab === "reviews" ? cases?.length : suppliers?.length ?? '—'}{" "}
                rezultate
              </span>
            </div>
            {tab==='reviews'&&<div className="supplier-query-controls">
              <button type="button" className="supplier-mine-toggle" role="switch" aria-checked={mine}
                onClick={() => {setMine(!mine);setOffset(0)}}>
                <span className="supplier-toggle-track" aria-hidden="true"><span /></span>
                <span>Ale mele</span>
              </button>
              <label>Stare<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="">Toate</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
              <label>Risc orientativ<select value={risk} onChange={e=>{setRisk(e.target.value);setOffset(0)}}><option value="">Toate</option><option value="high">Ridicat</option><option value="medium">Mediu</option><option value="low">Scăzut</option></select></label>
              <label>De la<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setOffset(0)}}/></label><label>Până la<input type="date" value={to} onChange={e=>{setTo(e.target.value);setOffset(0)}}/></label>
              <button className="button secondary" onClick={()=>download(`/supplier-reviews/export.csv?${request}`,'verificari-furnizori.csv').catch(e=>notify(e.message))}>Export CSV</button>
            </div>}
            {tab==='registrations' ? <div className="supplier-reviews-list">{registrations.length?registrations.map(r=><button className="supplier-review-row" key={r.id} onClick={()=>setRegistrationId(r.id)}><span className="review-row-copy"><strong>{r.payload.name} · CUI {r.payload.tax_id}</strong><small>{date(r.created_at)}</small></span><ReviewStatus status={r.status}/></button>):<Empty title="Niciun dosar de înregistrare"/>}</div> : tab === "reviews" ? (
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
                  message="Introdu detaliile unei solicitări pentru a începe verificarea."
                >
                  <button
                    className="button secondary"
                    onClick={() => {setRecheck(undefined);setCreate(true)}}
                  >
                    Prima verificare
                    <ArrowRight size={16} />
                  </button>
                </Empty>
              )
            ) : <SupplierContent error={catalogError} loading={!catalog} retry={()=>setRefresh(n=>n+1)}>{suppliers?.length ? (
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
                            ? "Date din registrul furnizorilor"
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
                        <button className="text-button" onClick={()=>setRegistryId(s.id)}>Istoric complet</button> {s.bank_history.length}{" "}
                        {s.bank_history.length === 1 ? "versiune" : "versiuni"}{" "}
                        de cont păstrate
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="Niciun furnizor găsit" />
            )}</SupplierContent>}
          </div>
          {tab==='reviews'&&<div className="supplier-pagination"><button className="button secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-25))}>Anterior</button><span>{data.total?offset+1:0}–{Math.min(offset+25,data.total)} din {data.total}</span><button className="button secondary" disabled={offset+25>=data.total} onClick={()=>setOffset(offset+25)}>Următor</button></div>}
          <p className="supplier-disclaimer">
            Un rezultat fără diferențe nu
            confirmă legitimitatea mesajului sau proprietarul contului. FlyLeaf
            nu execută și nu blochează plăți externe.
          </p>
        </>
      )}
      </SupplierContent>
      {registrationOpen&&<RegistrationDialog onClose={()=>setRegistrationOpen(false)} onCreated={r=>{setRegistrationOpen(false);setRegistrationId(r.id);setRefresh(v=>v+1);notify("Dosarul de furnizor a fost înregistrat.")}}/>}
      {registrationId&&<RegistrationDetail id={registrationId} onClose={()=>setRegistrationId(undefined)} onChanged={()=>{setRefresh(v=>v+1);notify("Decizia a fost înregistrată.")}} onOpen={id=>{setRegistrationId(undefined);onOpen(id)}}/>}
      {create && data && (
        <NewReview
          suppliers={data.suppliers}
          initialReview={recheck}
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
      {registryId&&<SupplierDetail supplierId={registryId} onClose={()=>{setRegistryId(undefined);setRefresh(v=>v+1)}} onOpen={id=>{setRegistryId(undefined);onOpen(id)}} onReview={id=>{api<Review>(`/supplier-reviews/${id}`).then(v=>{setRegistryId(undefined);setSelected(v)}).catch(e=>notify(e.message))}} onRegistration={id=>{setRegistryId(undefined);setRegistrationId(id)}}/>}
      {selected && (
        <ReviewDetail
          review={selected}
          user={user}
          onClose={() => setSelected(undefined)}
          onOpen={onOpen}
          onChanged={changed}
          onRecheck={()=>{setRecheck(selected);setSelected(undefined);setCreate(true)}}
          onReview={id=>{api<Review>(`/supplier-reviews/${id}`).then(setSelected).catch(e=>notify(e.message))}}
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
  initialReview,
}: {
  suppliers: Supplier[];
  initialReview?: Review;
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreated: (r: Review) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers.find(s=>s.id===initialReview?.supplier_id)?.id||suppliers[0]?.id||""),
    [contractId,setContractId]=useState(initialReview?.document_id||suppliers[0]?.document_id||""),
    [currency,setCurrency]=useState(initialReview?.invoice_currency||"RON"),
    [sender, setSender] = useState(initialReview?.sender_email||""),
    [iban, setIban] = useState(initialReview?.observed_iban||""),
    [amount, setAmount] = useState(initialReview?.invoice_amount!=null?String(initialReview.invoice_amount):""),
    [serviceDate, setServiceDate] = useState(initialReview?.service_date||""),
    [message, setMessage] = useState(initialReview?.message||""),
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
    if (!supplier || !contractId) return;
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api<Review>("/supplier-reviews", {
          method: "POST",
          body: JSON.stringify({
            document_id: contractId,
            supplier_id: supplier.id,
            invoice_currency: currency,
            previous_review_id: initialReview?.id,
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
              onChange={(e) => {setSupplierId(e.target.value);setContractId(suppliers.find(s=>s.id===e.target.value)?.document_id||"")}}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.tax_id||"CUI neînregistrat"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">Contract<select required value={contractId} onChange={e=>setContractId(e.target.value)}>{supplier?.contracts.map(c=><option key={c.id} value={c.id} disabled={!c.eligible_for_review}>{c.title}{!c.eligible_for_review?" · Indisponibil":""}</option>)}</select></label>
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
                  onOpen(contractId);
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
                    ? "Date de referință din registrul furnizorilor."
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
                Alege un exemplu
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
              placeholder="Introdu IBAN-ul comunicat"
              autoComplete="off"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Valoare factură <small>Opțional</small>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">Monedă<input value={currency} maxLength={3} minLength={3} pattern="[A-Za-z]{3}" onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
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
export function ReviewDetail({
  review,
  user,
  onClose,
  onOpen,
  onChanged,
  onRecheck,
  onReview,
}: {
  review: Review;
  user: User;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: (r: Review, message: string) => void;
  onRecheck:()=>void;
  onReview:(id:string)=>void;
}) {
  const [loaded,setLoaded]=useState<Review>(),[loadError,setLoadError]=useState('');
  const r=loaded?.id===review.id && loaded.status===review.status && loaded.assignment_revision===review.assignment_revision ? loaded : review;
  useEffect(()=>{
    let active=true;
    api<Review>(`/supplier-reviews/${review.id}`).then(v=>{if(active){setLoaded(v);setLoadError('')}}).catch(e=>{if(active)setLoadError(e.message)});
    return()=>{active=false};
  },[review.id,review.status,review.assignment_revision]);
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
        {loadError&&<ErrorMessage message={loadError}/>}
        {(r.previous_review_id||r.rechecks?.length)&&<section className="review-control" aria-label="Istoric reevaluări">
          <h3>Istoric reevaluări</h3>
          {r.previous_review_id&&<button className="text-button" onClick={()=>onReview(r.previous_review_id!)}>Verificarea precedentă · {r.previous_review_id}</button>}
          {r.rechecks?.map(c=><p key={c.id}><button className="text-button" onClick={()=>onReview(c.id)}>Reevaluare · {c.id} · {labels[c.status]||c.status} · {date(c.created_at)}</button></p>)}
        </section>}
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
              <strong>Fără diferențe în controalele efectuate.</strong>
              <p>
                Rezultatul nu confirmă legitimitatea solicitării. Nicio plată nu
                a fost inițiată.
              </p>
            </div>
          </div>
        )}
        <ReviewChecks review={r}/>
        <AssignmentForm review={r} onChanged={onChanged}/>
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
                  <dd>{new Intl.NumberFormat('ro-RO',{style:'currency',currency:r.invoice_currency||'RON'}).format(r.invoice_amount)}</dd>
                </>
              )}
              <dt>Data prestației</dt>
              <dd>{r.service_date ? date(r.service_date) : 'Neînregistrat'}</dd>
              <dt>Perioada evaluată</dt>
              <dd>{r.contract_snapshot ? `${r.contract_snapshot.effective_date ? date(r.contract_snapshot.effective_date) : 'Început neînregistrat'} — ${r.contract_snapshot.expires_at ? date(r.contract_snapshot.expires_at) : 'Sfârșit neînregistrat'}` : 'Neînregistrat'}</dd>
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
                {r.actors?.verified_by?.name||(r.verified_by === user.id ? user.name : r.verified_by)} ·{" "}
                {r.verified_at ? time(r.verified_at) : ""}
              </small>
            </div>
          </div>
        )}
        {r.approved_at && (
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
                {r.actors?.approved_by?.name||(r.approved_by === user.id ? user.name : r.approved_by)} · {time(r.approved_at!)}
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
            <button className="button secondary" onClick={onRecheck}>Verifică din nou</button>
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
          FlyLeaf păstrează dovezile și deciziile. Acest flux nu execută și nu
          blochează plăți într-un sistem financiar extern.
        </p>
      </div>
    </Modal>
  );
}
