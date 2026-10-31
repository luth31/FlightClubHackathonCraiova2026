import { useEffect, useState, type FormEvent } from "react";
import { FilePenLine, LoaderCircle, PenLine, Plus, ShieldCheck } from "lucide-react";
import { ErrorMessage, Loading, Modal, Status } from "@/components/ui";
import { api } from "@/services/api-client";
import { date, time } from "@/utils/format";
import type { AmendmentDraft, DocumentRecord } from "@/types";
import "./amendments.css";

interface DraftFields {
  title: string;
  reason: string;
  clause_reference: string;
  current_wording: string;
  proposed_wording: string;
  proposed_effective_date: string;
}

export function AmendmentDrafts({
  contract,
  notify,
  onSaved,
}: {
  contract: DocumentRecord;
  notify: (message: string) => void;
  onSaved?: () => void;
}) {
  const [items, setItems] = useState<AmendmentDraft[]>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<AmendmentDraft | null>();
  const [fields, setFields] = useState<DraftFields>();
  const [sourceVersion, setSourceVersion] = useState(contract.version);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const endpoint = `/contracts/${contract.id}/amendment-drafts`;

  useEffect(() => {
    let active = true;
    api<{ items: AmendmentDraft[] }>(endpoint)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setError("");
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint, contract.version, contract.status, refresh]);

  function openDraft(draft?: AmendmentDraft) {
    setSelection(draft || null);
    setSourceVersion(draft?.source_version || contract.version);
    setFields({
      title: draft?.title || `Act adițional propus – ${contract.number}`,
      reason: draft?.reason || "",
      clause_reference: draft?.clause_reference || "",
      current_wording: draft?.current_wording || "",
      proposed_wording: draft?.proposed_wording || "",
      proposed_effective_date: draft?.proposed_effective_date || "",
    });
    setFormError("");
  }

  function closeDraft() {
    if (!busy) {
      setSelection(undefined);
      setFields(undefined);
    }
  }

  function reloadAfterFailure() {
    if (busy) return;
    closeDraft();
    // Reopen from the latest saved draft instead of overwriting a newer revision.
    setItems(undefined);
    setError("");
    setRefresh((value) => value + 1);
  }

  const sourceChanged = selection !== undefined &&
    (!!selection?.source_changed || sourceVersion !== contract.version);
  const canEdit =
    selection === null
      ? contract.permissions?.can_propose_amendment === true && !sourceChanged
      : selection?.can_edit === true && !sourceChanged &&
        contract.permissions?.can_propose_amendment === true;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields || !canEdit || busy) return;
    setBusy(true);
    setFormError("");
    try {
      // Bind a new proposal to its source, and edits to the saved draft revision.
      const saved = await api<AmendmentDraft>(
        selection ? `${endpoint}/${selection.id}` : endpoint,
        {
          method: selection ? "PATCH" : "POST",
          body: JSON.stringify({
            ...fields,
            title: fields.title.trim(),
            reason: fields.reason.trim(),
            clause_reference: fields.clause_reference.trim(),
            proposed_wording: fields.proposed_wording.trim(),
            proposed_effective_date: fields.proposed_effective_date || null,
            ...(selection
              ? { revision: selection.revision }
              : { source_version: sourceVersion }),
          }),
        },
      );
      setItems((current) => [saved, ...(current || []).filter((item) => item.id !== saved.id)]);
      setRefresh((value) => value + 1);
      setSelection(undefined);
      setFields(undefined);
      notify("Ciorna actului adițional a fost salvată separat de contract.");
      onSaved?.();
    } catch (failure) {
      setFormError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel amendment-drafts" aria-label="Propuneri de acte adiționale">
      <div className="amendment-drafts-heading">
        <div>
          <h2>Propuneri de acte adiționale</h2>
          <p>Ciorne separate, legate de acest contract. Termenii contractului rămân neschimbați.</p>
        </div>
        {contract.permissions?.can_propose_amendment && (
          <button className="button secondary" onClick={() => openDraft()}>
            <Plus size={17} />
            Propune act adițional
          </button>
        )}
      </div>
      {error && <ErrorMessage message={error} retry={() => setRefresh((value) => value + 1)} />}
      {!items && !error && <Loading />}
      {items?.length === 0 && (
        <p className="amendment-empty">Nu există ciorne de acte adiționale pentru acest contract.</p>
      )}
      {items && items.length > 0 && (
        <div className="amendment-draft-list">
          {items.map((draft) => (
            <article className="amendment-draft-card" key={draft.id}>
              <div className="amendment-draft-title">
                <h3>{draft.title}</h3>
                <Status value={draft.status} />
              </div>
              <p>Clauza: {draft.clause_reference}</p>
              <small>
                {draft.created_by_name} · actualizat {time(draft.updated_at)}
              </small>
              {draft.proposed_effective_date && (
                <small>Data propusă de intrare în vigoare: {date(draft.proposed_effective_date)}</small>
              )}
              {draft.source_changed && (
                <p className="amendment-source-changed">
                  Contractul are o versiune nouă. Această ciornă rămâne disponibilă pentru consultare.
                </p>
              )}
              <button className="text-button" onClick={() => openDraft(draft)}>
                {draft.can_edit ? <PenLine size={15} /> : <FilePenLine size={15} />}
                {draft.can_edit ? "Deschide și editează ciorna" : "Consultă ciorna"}
              </button>
            </article>
          ))}
        </div>
      )}
      {selection !== undefined && fields && (
        <Modal
          title={selection ? "Ciorna actului adițional" : "Propune un act adițional"}
          subtitle={`${contract.number} · ${contract.title}`}
          onClose={closeDraft}
          wide
        >
          <form className="modal-body amendment-draft-form" onSubmit={save}>
            <div className="note-box">
              <ShieldCheck size={18} />
              <p>
                Propunerea se păstrează separat de contractul de bază, versiunea{" "}
                {sourceVersion}. Salvarea ciornei nu modifică PDF-ul,
                valoarea sau expirarea contractului și nu reprezintă aprobare ori semnare.
              </p>
            </div>
            {sourceChanged && (
              <p className="amendment-source-changed">
                Versiunea contractului s-a schimbat. Verifică noua versiune și pregătește o propunere
                nouă după aprobarea ei.
              </p>
            )}
            <fieldset className="amendment-draft-fields" disabled={busy}>
              <label className="field">
                Titlul propunerii
                <input required readOnly={!canEdit} minLength={3} maxLength={300} value={fields.title}
                  onChange={(event) => setFields({ ...fields, title: event.target.value })} />
              </label>
              <label className="field">
                Motivul modificării
                <textarea required readOnly={!canEdit} minLength={10} rows={3} maxLength={5000} value={fields.reason}
                  placeholder="Explică de ce este necesară modificarea."
                  onChange={(event) => setFields({ ...fields, reason: event.target.value })} />
              </label>
              <div className="form-grid">
                <label className="field">
                  Clauza sau articolul vizat
                  <input required readOnly={!canEdit} minLength={3} maxLength={200} value={fields.clause_reference}
                    placeholder="Ex. Art. 3 – Obiectul contractului"
                    onChange={(event) => setFields({ ...fields, clause_reference: event.target.value })} />
                </label>
                <label className="field">
                  Data propusă de intrare în vigoare (opțional)
                  <input type="date" readOnly={!canEdit} value={fields.proposed_effective_date}
                    onChange={(event) => setFields({ ...fields, proposed_effective_date: event.target.value })} />
                </label>
              </div>
              <label className="field">
                Textul actual (opțional)
                <textarea readOnly={!canEdit} rows={4} maxLength={10000} value={fields.current_wording}
                  placeholder="Copiază fragmentul relevant din contract pentru comparație."
                  onChange={(event) => setFields({ ...fields, current_wording: event.target.value })} />
              </label>
              <label className="field">
                Textul propus
                <textarea required readOnly={!canEdit} minLength={10} rows={5} maxLength={10000} value={fields.proposed_wording}
                  placeholder="Scrie noua formulare propusă pentru clauză."
                  onChange={(event) => setFields({ ...fields, proposed_wording: event.target.value })} />
              </label>
            </fieldset>
            {formError && (
              <>
                <ErrorMessage message={formError} />
                <button type="button" className="text-button" disabled={busy} onClick={reloadAfterFailure}>
                  Închide și reîncarcă lista
                </button>
              </>
            )}
            <div className="modal-footer">
              <button type="button" className="button secondary" disabled={busy} onClick={closeDraft}>
                {canEdit ? "Renunță" : "Închide"}
              </button>
              {canEdit && (
                <button className="button primary" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={17} /> : <FilePenLine size={17} />}
                  {busy ? "Se salvează…" : "Salvează ciorna"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
