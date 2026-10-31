import { useEffect, useState } from "react";
import { History, ShieldCheck } from "lucide-react";
import { ErrorMessage, Loading, Modal } from "@/components/ui";
import { api } from "@/services/api-client";
import { date } from "@/utils/format";
import type { AmendmentDraft, AmendmentDraftRevision } from "@/types";

interface RevisionHistory {
  items: AmendmentDraftRevision[];
  total: number;
  current_revision: number;
  history_complete: boolean;
}

function savedTime(value: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
}

export function AmendmentHistory({
  contractId,
  contractNumber,
  draft,
  onClose,
}: {
  contractId: string;
  contractNumber: string;
  draft: AmendmentDraft;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ key: string; value: RevisionHistory }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [refresh, setRefresh] = useState(0);
  const [selectedRevision, setSelectedRevision] = useState<number>();
  const endpoint = `/contracts/${contractId}/amendment-drafts/${draft.id}/revisions`;
  const requestKey = `${endpoint}:${draft.revision}:${refresh}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api<RevisionHistory>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (active) setResult({ key: requestKey, value });
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) {
          setFailure({ key: requestKey, message: (error as Error).message });
        }
      });
    return () => {
      // Ignore and cancel requests when another proposal or revision opens.
      active = false;
      controller.abort();
    };
  }, [endpoint, requestKey]);

  const history = result?.key === requestKey ? result.value : undefined;
  const error = failure?.key === requestKey ? failure.message : "";
  const selected = history?.items.find((item) => item.revision === selectedRevision) || history?.items[0];

  return (
    <Modal
      title="Istoricul ciornei"
      subtitle={`${contractNumber} · ${draft.title}`}
      onClose={onClose}
      wide
    >
      <div className="modal-body amendment-history" aria-busy={!history && !error}>
        <div className="note-box">
          <ShieldCheck size={18} />
          <p>
            Consultă textul fiecărei revizii salvate. Versiunile PDF-ului sunt în istoricul documentului generat.
          </p>
        </div>
        {error && <ErrorMessage message={error} retry={() => setRefresh((value) => value + 1)} />}
        {!history && !error && <Loading />}
        {history && history.items.length === 0 && (
          <p className="amendment-empty">Nu există revizii păstrate pentru această ciornă.</p>
        )}
        {history && selected && (
          <>
            {!history.history_complete && (
              <p className="amendment-source-changed">
                Istoricul acestei ciorne începe cu prima revizie păstrată. Reviziile mai vechi nu sunt disponibile.
              </p>
            )}
            <label className="field amendment-history-picker">
              Revizia ciornei
              <select value={selected.revision} onChange={(event) => setSelectedRevision(Number(event.target.value))}>
                {history.items.map((item) => (
                  <option key={item.revision} value={item.revision}>
                    Revizia {item.revision}
                    {item.revision === history.current_revision ? " · curentă" : ""}
                    {item.origin === "migration" ? " · preluată din ciorna existentă" : ""}
                  </option>
                ))}
              </select>
              <small>{history.total} revizii păstrate</small>
            </label>
            <div className="amendment-revision-heading">
              <History size={18} />
              <div>
                <strong>Revizia {selected.revision}</strong>
                <small>Contract de bază: {contractNumber} · versiunea {selected.source_version}</small>
                {selected.origin === "saved" && (
                  <small>
                    Salvată de {selected.saved_by_name || selected.saved_by || "persoană necunoscută"}
                    {selected.saved_at ? ` · ${savedTime(selected.saved_at)}` : " · moment necunoscut"}
                  </small>
                )}
              </div>
            </div>
            {selected.origin === "migration" && (
              <div className="amendment-source-changed">
                <p>
                  Pentru această ciornă veche, a fost păstrată formularea disponibilă la activarea istoricului.
                  Persoana și momentul ultimei salvări nu sunt cunoscute.
                </p>
                <small>Înregistrată în istoric: {savedTime(selected.recorded_at)}</small>
              </div>
            )}
            <dl className="amendment-revision-fields">
              <div>
                <dt>Titlul propunerii</dt>
                <dd>{selected.title}</dd>
              </div>
              <div>
                <dt>Motivul modificării</dt>
                <dd>{selected.reason}</dd>
              </div>
              <div>
                <dt>Clauza sau articolul vizat</dt>
                <dd>{selected.clause_reference}</dd>
              </div>
              <div>
                <dt>Data propusă de intrare în vigoare</dt>
                <dd>{selected.proposed_effective_date ? date(selected.proposed_effective_date) : "Nu a fost completată."}</dd>
              </div>
              <div>
                <dt>Textul actual</dt>
                <dd>{selected.current_wording || "Nu a fost completat."}</dd>
              </div>
              <div>
                <dt>Textul propus</dt>
                <dd>{selected.proposed_wording}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="modal-footer">
          <button className="button secondary" onClick={onClose}>Închide</button>
        </div>
      </div>
    </Modal>
  );
}
