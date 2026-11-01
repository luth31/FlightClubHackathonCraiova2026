import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { api } from "@/services/api-client";
import { ErrorMessage, Modal } from "@/components/ui";
import { date } from "@/utils/format";
import "./assistant.css";

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

const suggestions = [
  {
    title: "Contracte care expiră",
    detail: "În următoarele 60 de zile",
    question: "Ce contracte expiră în următoarele 60 de zile?",
    icon: CalendarClock,
  },
  {
    title: "Documente în aprobare",
    detail: "Câte așteaptă avizarea?",
    question: "Câte documente sunt în aprobare?",
    icon: ClipboardCheck,
  },
  {
    title: "Mentenanță",
    detail: "Găsește documentele",
    question: "Caută documente despre mentenanță",
    icon: Wrench,
  },
];

function AnswerResult({
  answer,
  onOpen,
}: {
  answer: Answer;
  onOpen: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Keep the full response available, without repeating its document list up front.
  const [summary, ...details] = answer.answer.split(/\n\s*\n/);
  const sources = answer.sources ?? [];

  return (
    <div className="ask-result">
      <div className="ask-answer-heading">
        <span>
          <Sparkles size={16} aria-hidden="true" /> FlyLeaf
        </span>
        <small>Referință: {date(answer.reference_date)}</small>
      </div>
      <p className="ask-summary">{summary}</p>
      {details.length > 0 && (
        <details className="ask-disclosure ask-full-answer">
          <summary>
            Detalii răspuns <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div>
            {details.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </details>
      )}
      {sources.length > 0 && (
        <section className="ask-sources" aria-label="Documente sursă">
          <h3>
            Documente sursă <span>{sources.length}</span>
          </h3>
          <div id="ask-source-list">
            {(showAll ? sources : sources.slice(0, 3)).map((source, index) => (
              <article className="ask-source" key={`${source.id}-${index}`}>
                <FileText
                  size={19}
                  className="ask-source-icon"
                  aria-hidden="true"
                />
                <div>
                  <button
                    className="ask-source-link"
                    onClick={() => onOpen(source.id)}
                  >
                    <strong>{source.title}</strong>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                  <small>
                    {source.number} · pagina {source.page || 1}
                  </small>
                  {source.excerpt && (
                    <details className="ask-disclosure ask-excerpt">
                      <summary>
                        Vezi fragmentul{" "}
                        <ChevronDown size={13} aria-hidden="true" />
                      </summary>
                      <p>{source.excerpt}</p>
                    </details>
                  )}
                </div>
              </article>
            ))}
          </div>
          {sources.length > 3 && (
            <button
              className="ask-show-sources"
              aria-expanded={showAll}
              aria-controls="ask-source-list"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? "Arată mai puține"
                : `Vezi toate cele ${sources.length} surse`}
              <ChevronDown
                size={15}
                className={showAll ? "ask-rotated" : ""}
                aria-hidden="true"
              />
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export function AssistantDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<Answer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(false);

  async function ask(q = question) {
    const trimmed = q.trim();
    if (trimmed.length < 2 || trimmed.length > 1000 || pendingRef.current)
      return;
    pendingRef.current = true;
    setAsked(trimmed);
    setQuestion("");
    setBusy(true);
    setError("");
    setAnswer(undefined);
    contentRef.current?.scrollTo(0, 0);
    inputRef.current?.focus();
    try {
      setAnswer(
        await api<Answer>("/assistant", {
          method: "POST",
          body: JSON.stringify({ question: trimmed }),
        }),
      );
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Nu mă pot conecta la registru. Verifică conexiunea și încearcă din nou."
          : (e as Error).message,
      );
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  function reset() {
    setAsked("");
    setAnswer(undefined);
    setError("");
    setQuestion("");
    contentRef.current?.scrollTo(0, 0);
    inputRef.current?.focus();
  }

  return (
    <Modal
      title="Întreabă FlyLeaf"
      className="ask-dialog"
      initialFocusRef={inputRef}
      onClose={onClose}
    >
      <div className="ask-content" ref={contentRef}>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <label htmlFor="flyleaf-question">Ce vrei să afli?</label>
          <div className="ask-input-wrap">
            <Search size={20} aria-hidden="true" />
            <input
              id="flyleaf-question"
              ref={inputRef}
              placeholder="Scrie o întrebare sau un subiect…"
              value={question}
              minLength={2}
              maxLength={1000}
              autoComplete="off"
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button type="submit" disabled={question.trim().length < 2 || busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
              ) : (
                <ArrowRight size={17} aria-hidden="true" />
              )}
              <span>Întreabă</span>
            </button>
          </div>
        </form>
        {!asked ? (
          <div className="ask-start">
            <p>Întrebări rapide</p>
            <div className="ask-shortcuts">
              {suggestions.map(
                ({ title, detail, question: prompt, icon: Icon }) => (
                  <button key={title} onClick={() => ask(prompt)}>
                    <span className="ask-shortcut-icon">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </span>
                    <ArrowRight
                      size={16}
                      className="ask-shortcut-arrow"
                      aria-hidden="true"
                    />
                  </button>
                ),
              )}
            </div>
          </div>
        ) : (
          <div className="ask-response">
            <div className="ask-question-heading">
              <span>Întrebarea ta</span>
              <button onClick={reset} disabled={busy}>
                <Plus size={15} aria-hidden="true" /> Întrebare nouă
              </button>
            </div>
            <p className="ask-question">{asked}</p>
            {busy && (
              <div className="ask-loading">
                <LoaderCircle className="spin" size={20} aria-hidden="true" />{" "}
                Consult registrul…
              </div>
            )}
            {answer && (
              <AnswerResult
                answer={answer}
                onOpen={(id) => {
                  onClose();
                  onOpen(id);
                }}
              />
            )}
            {error && <ErrorMessage message={error} retry={() => ask(asked)} />}
          </div>
        )}
        <span className="sr-only" role="status">
          {busy
            ? "Consult registrul…"
            : answer
              ? `Răspuns disponibil. ${answer.answer.split(/\n\s*\n/)[0]}`
              : ""}
        </span>
      </div>
      <div className="ask-footer">
        <ShieldCheck size={14} aria-hidden="true" /> Doar documente validate la
        care ai acces.
      </div>
    </Modal>
  );
}
