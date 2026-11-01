import {t,useLanguage} from '@/i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, ChevronDown, FileCheck2, Landmark, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api } from '@/services/api-client';
import { Modal, ErrorMessage, Loading } from '@/components/ui';
import type { DocumentRecord } from '@/types';
import type { Registration, Supplier } from './types';

export function RegistrationDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (item: Registration) => void;
}) {
  useLanguage();
  const [docs, setDocs] = useState<DocumentRecord[]>();
  const [linked, setLinked] = useState<string[]>([]);
  const [contract, setContract] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [tax, setTax] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [iban, setIban] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ items: DocumentRecord[] }>('/documents?limit=500'),
      api<{ items: Supplier[] }>('/suppliers'),
    ]).then(([documents, suppliers]) => {
      if (!active) return;
      setDocs(documents.items.filter(doc => doc.validated && ['approved', 'signed'].includes(doc.status)));
      setLinked(suppliers.items.flatMap(supplier => supplier.contracts.map(item => item.id)));
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const source = docs?.find(doc => doc.id === contract);
    if (!source) return;
    setBusy(true);
    setError('');
    try {
      onCreated(await api<Registration>('/supplier-registrations', {
        method: 'POST',
        body: JSON.stringify({
          name, tax_id: tax, address, category,
          source_contract_id: source.id, source_version: source.version,
          proposed_iban: iban, proposed_contact: contact,
          evidence_refs: evidence.map(id => ({
            document_id: id, version: docs!.find(doc => doc.id === id)!.version,
          })),
        }),
      }));
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }

  const contracts = docs?.filter(doc => doc.category === 'Contract' && !linked.includes(doc.id)) ?? [];

  return (
    <Modal title={t("Înregistrează un furnizor")}
      subtitle={t("Completează datele și pregătește dosarul pentru verificare.")}
      onClose={onClose} className="supplier-registration-modal">
      {!docs ? <div className="modal-body">{error ? <ErrorMessage message={error} /> : <Loading />}</div> : (
        <form className="supplier-registration-form" onSubmit={submit}>
          <div className="modal-body supplier-registration-body">
            {error && <ErrorMessage message={error} />}
            <section className="registration-section" aria-labelledby="registration-source-heading">
              <h3 id="registration-source-heading"><FileCheck2 size={18} aria-hidden="true" />{t("Contract sursă")}</h3>
              <label className="field" htmlFor="registration-contract">
                {t("Contract aprobat")}<select id="registration-contract" required value={contract}
                  aria-describedby="registration-contract-help"
                  onChange={event => {
                    setContract(event.target.value);
                    setName(docs.find(doc => doc.id === event.target.value)?.supplier || '');
                    setEvidence(event.target.value ? [event.target.value] : []);
                  }}>
                  <option value="">{t("Alege un contract aprobat, neasociat")}</option>
                  {contracts.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                </select>
                <small id="registration-contract-help">
                  {contracts.length ? t("Contractul ales este inclus automat în dovezile dosarului.") : t("Niciun contract disponibil. Încarcă și aprobă un contract neasociat în Documente.")}
                </small>
              </label>
            </section>

            <section className="registration-section" aria-labelledby="registration-company-heading">
              <h3 id="registration-company-heading"><Building2 size={18} aria-hidden="true" />{t("Datele furnizorului")}</h3>
              <div className="form-grid">
                <label className="field" htmlFor="registration-name">{t("Denumire legală")}<input id="registration-name" required minLength={2} maxLength={200} autoComplete="organization"
                    value={name} onChange={event => setName(event.target.value)} placeholder={t("Ex. Aero Servicii SRL")} />
                </label>
                <label className="field" htmlFor="registration-tax">{t("CUI")}<input id="registration-tax" required maxLength={20} value={tax}
                    onChange={event => setTax(event.target.value)} placeholder={t("RO12345678")} />
                </label>
                <label className="field" htmlFor="registration-address">{t("Adresă")}<input id="registration-address" required minLength={3} maxLength={500} autoComplete="street-address"
                    value={address} onChange={event => setAddress(event.target.value)} placeholder={t("Stradă, număr, localitate")} />
                </label>
                <label className="field" htmlFor="registration-category">{t("Categorie")}<input id="registration-category" required minLength={2} maxLength={100} value={category}
                    onChange={event => setCategory(event.target.value)} placeholder={t("Ex. Mentenanță echipamente")} />
                </label>
              </div>
            </section>

            <section className="registration-section" aria-labelledby="registration-bank-heading">
              <h3 id="registration-bank-heading"><Landmark size={18} aria-hidden="true" />{t("Cont și contact propuse")}</h3>
              <div className="form-grid">
                <label className="field" htmlFor="registration-iban">{t("IBAN propus")}<input id="registration-iban" className="iban" required maxLength={80} spellCheck={false}
                    value={iban} onChange={event => setIban(event.target.value)} placeholder={t("RO49 AAAA 1B31 0075 9384 0000")} />
                </label>
                <label className="field" htmlFor="registration-contact">{t("E-mail de contact propus")}<input id="registration-contact" type="email" required autoComplete="email" value={contact}
                    onChange={event => setContact(event.target.value)} placeholder={t("contact@furnizor.ro")} />
                </label>
              </div>
              <p className="registration-trust-note"><ShieldCheck size={17} aria-hidden="true" />
                {t("Datele devin de încredere după verificare independentă și decizia unui alt coleg.")}</p>
            </section>

            <details className="registration-evidence-picker">
              <summary>
                <FileCheck2 size={18} aria-hidden="true" />
                <span>{t("Dovezi aprobate")}<small>{t("Adaugă documente care susțin datele propuse.")}</small></span>
                <span className="registration-evidence-count" aria-live="polite">{evidence.length} / 10</span>
                <ChevronDown size={18} className="registration-evidence-chevron" aria-hidden="true" />
              </summary>
              <fieldset className="registration-evidence">
                <legend className="sr-only">{t("Dovezi aprobate · maximum 10")}</legend>
                {docs.map(doc => (
                  <label className={`checkbox-field registration-evidence-option ${evidence.includes(doc.id) ? 'is-selected' : ''}`} key={doc.id}>
                    <input type="checkbox" checked={evidence.includes(doc.id)}
                      disabled={!evidence.includes(doc.id) && evidence.length >= 10}
                      onChange={event => setEvidence(current => event.target.checked ? [...current, doc.id] : current.filter(id => id !== doc.id))} />
                    <span>{doc.title}<small>{doc.category} {t("· v")}{doc.version}{doc.id === contract ? t(" · Contract sursă") : ''}</small></span>
                  </label>
                ))}
              </fieldset>
            </details>
          </div>

          <div className="modal-footer supplier-registration-footer">
            <span>{t("Toate câmpurile sunt obligatorii.")}</span>
            <div>
              <button type="button" className="button secondary" onClick={onClose}>{t("Renunță")}</button>
              <button type="submit" className="button primary" disabled={busy || !contract || !evidence.length}>
                {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
                {busy ? t("Se înregistrează…") : t("Creează dosarul")}
                {!busy && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
