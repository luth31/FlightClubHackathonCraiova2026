import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  ArrowUpRight,
  Check,
  FileText,
  LoaderCircle,
  SearchX,
  X,
  AlertCircle,
} from "lucide-react";
import { statusLabel } from "@/utils/format";
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value}`}>
      <span />
      {statusLabel[value] || value}
    </span>
  );
}
export function FileIcon({
  category = "",
  large = false,
}: {
  category?: string;
  large?: boolean;
}) {
  return (
    <span
      className={`file-icon ${large ? "large" : ""} ${category.toLowerCase().includes("contract") ? "contract" : category.toLowerCase().includes("factur") ? "invoice" : ""}`}
    >
      <FileText size={large ? 25 : 19} />
    </span>
  );
}
export function Empty({
  title = "Niciun document aici",
  message = "Încearcă alți termeni de căutare sau resetează filtrele.",
  children,
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <SearchX size={30} />
      <h3>{title}</h3>
      <p>{message}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>Se încarcă…</span>
    </div>
  );
}
export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Nu am putut finaliza cererea</strong>
        <p>{message}</p>
        {retry && (
          <button className="text-button" onClick={retry}>
            Încearcă din nou
          </button>
        )}
      </div>
    </div>
  );
}
// Retained workspace views must not retain a modal's global keyboard/scroll effects.
export const ViewActiveContext = createContext(true);

export function Modal({
  title,
  titleContent,
  subtitle,
  onClose,
  children,
  wide = false,
  className = "",
  initialFocusRef,
}: {
  title: string;
  titleContent?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useContext(ViewActiveContext);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) {
      closeRef.current();
      return;
    }
    const prev = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,summary,a[href],[tabindex="0"]',
        ) || []).filter(node => !node.matches(':disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0);
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    (initialFocusRef?.current ?? ref.current?.querySelector<HTMLElement>(".modal-header > .icon-button") ?? ref.current?.querySelector<HTMLElement>("button,input"))?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      if (prev?.isConnected && !prev.closest('[hidden],[inert]')) prev.focus({preventScroll: true});
    };
  }, [active, initialFocusRef]);
  if (!active) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <h2>{titleContent ?? title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Închide"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function SectionHead({
  title,
  children,
  onClick,
  action = "Vezi toate",
}: {
  title: string;
  children?: ReactNode;
  onClick?: () => void;
  action?: string;
}) {
  return (
    <div className="section-head">
      <h2>
        {title}
        {children}
      </h2>
      {onClick && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      <span>
        <Check size={16} />
      </span>
      {message}
    </div>
  );
}
