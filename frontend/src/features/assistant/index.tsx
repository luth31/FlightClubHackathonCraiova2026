import { useState } from "react";
import { Sparkles, ArrowUp, ArrowUpRight, LoaderCircle } from "lucide-react";
import { api } from "@/services/api-client";
import { ErrorMessage, Modal } from "@/components/ui";
interface Answer {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    number: string;
    page: number;
    excerpt: string;
  }>;
  mode: string;
  reference_date: string;
}
export function AssistantDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [question, setQuestion] = useState(""),
    [asked, setAsked] = useState(""),
    [answer, setAnswer] = useState<Answer>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function ask(q = question) {
    if (!q.trim() || busy) return;
    setAsked(q);
    setQuestion("");
    setBusy(true);
    setError("");
    setAnswer(undefined);
    try {
      setAnswer(
        await api<Answer>("/assistant", {
          method: "POST",
          body: JSON.stringify({ question: q }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Întreabă AeroDesk"
      subtitle="Răspunsuri din documentele la care ai acces."
      onClose={onClose}
    >
      <div className="assistant-body">
        {!asked ? (
          <>
            <div className="assistant-welcome">
              <span>
                <Sparkles size={27} />
              </span>
              <h3>
                Mai puțin căutat.
                <br />
                Mai multă claritate.
              </h3>
              <p>
                Pornește cu o întrebare despre registru, contracte sau termene.
              </p>
            </div>
            <div className="suggestion-list">
              {[
                "Ce contracte expiră în următoarele 60 de zile?",
                "Câte documente sunt în aprobare?",
                "Caută documente despre mentenanță",
              ].map((q) => (
                <button key={q} onClick={() => ask(q)}>
                  {q}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="asked-question">{asked}</div>
            {busy ? (
              <div className="assistant-thinking">
                <LoaderCircle className="spin" size={18} />
                Consult registrul…
              </div>
            ) : (
              answer && (
                <div className="answer">
                  <div className="answer-label">
                    <Sparkles size={15} />
                    AeroDesk
                  </div>
                  <p>{answer.answer}</p>
                  {answer.sources?.length > 0 && (
                    <div className="answer-sources">
                      <h4>Documente sursă</h4>
                      {answer.sources.map((s, i) => (
                        <button
                          key={`${s.id}-${i}`}
                          onClick={() => {
                            onClose();
                            onOpen(s.id);
                          }}
                        >
                          <span className="source-number">{i + 1}</span>
                          <span>
                            <strong>{s.title}</strong>
                            <small>
                              {s.number} · pagina {s.page || 1}
                            </small>
                            {s.excerpt && <p>{s.excerpt}</p>}
                          </span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </>
        )}
        {error && <ErrorMessage message={error} />}
      </div>
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <label className="assistant-input">
          <input
            aria-label="Întrebare pentru AeroDesk"
            placeholder="Ce ai vrea să afli?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            className="send-button"
            disabled={!question.trim() || busy}
            aria-label="Trimite întrebarea"
          >
            <ArrowUp size={18} />
          </button>
        </label>
        <small>
          Căutare și calcule din registrul validat. Verifică întotdeauna sursa.
        </small>
      </form>
    </Modal>
  );
}
