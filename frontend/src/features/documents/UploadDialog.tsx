import { useEffect, useState, useRef } from "react";
import { UploadCloud, FileText, Check, LoaderCircle } from "lucide-react";
import { Modal, ErrorMessage } from "@/components/ui";
import { api } from "@/services/api-client";
import type { DocumentRecord, User } from "@/types";
export function UploadDialog({
  onClose,
  onCreated,
  user,
}: {
  onClose: () => void;
  onCreated: (d: DocumentRecord) => void;
  user: User;
}) {
  const [file, setFile] = useState<File>(),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState(
      user.roles.includes("hr")
        ? "Resurse umane"
        : user.roles.includes("technician")
          ? "Raport de mentenanță"
          : "Contract",
    ),
    [department, setDepartment] = useState(
      user.roles.includes("hr")
        ? "Resurse umane"
        : user.roles.includes("technician")
          ? "Tehnic"
          : user.department === "Conducere"
            ? "Achiziții"
            : user.business_area || user.department,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const choose = (f?: File) => {
    if (f) {
      if (!f.name.toLowerCase().endsWith(".pdf")) {
        setError("Alege un fișier PDF.");
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError("Fișierul trebuie să fie mai mic de 25 MB.");
        return;
      }
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]/g, " "));
      setError("");
    }
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("category", category);
    form.append("department", department);
    try {
      const d = await api<DocumentRecord>("/documents", {
        method: "POST",
        body: form,
      });
      if (mounted.current) onCreated(d);
    } catch (e) {
      if (!mounted.current) return;
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Adaugă document"
      subtitle="PDF · maximum 25 MB"
      onClose={onClose}
    >
      <form onSubmit={submit} className="modal-body">
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Fișier PDF"
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <button
          type="button"
          className={`dropzone ${drag ? "dragging" : ""} ${file ? "has-file" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            choose(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <>
              <FileText size={30} />
              <strong>{file.name}</strong>
              <span>
                {(file.size / 1024).toFixed(0)} KB · Apasă pentru a schimba
                fișierul
              </span>
              <Check className="file-check" size={19} />
            </>
          ) : (
            <>
              <UploadCloud size={32} />
              <strong>Trage un PDF aici sau alege fișierul</strong>
              <span>Alege fișierul de pe dispozitiv</span>
            </>
          )}
        </button>
        <label className="field">
          Titlu document
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Contract mentenanță echipamente"
          />
        </label>
        <div className="form-grid">
          <label className="field">
            Tip document
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {(user.roles.includes("technician")
                ? [
                    "Raport de mentenanță",
                    "Proces-verbal",
                    "Procedură",
                    "Instruire",
                  ]
                : [
                    "Contract",
                    "Referat de necesitate",
                    "Caiet de sarcini",
                    "Comandă",
                    "Factură",
                    "Proces-verbal",
                    "Raport de mentenanță",
                    "Act adițional",
                    "Procedură",
                    "Audit",
                    "Resurse umane",
                    "Instruire",
                  ]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Departament
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {(user.roles.includes("hr")
                ? ["Resurse umane"]
                : user.roles.includes("technician")
                  ? ["Tehnic"]
                  : [
                      "Achiziții",
                      "Tehnic",
                      "Financiar",
                      "Operațiuni",
                      "Resurse umane",
                      "Conformitate",
                    ].filter(d => d !== 'Resurse umane' && (user.roles.includes('director') || d === (user.business_area || user.department)))
              ).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="quiet-note">
          Se salvează ca ciornă. Verifici informațiile înainte de aprobare.
        </p>
        {error && <ErrorMessage message={error} />}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Renunță
          </button>
          <button className="button primary" disabled={!file || busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <UploadCloud size={17} />
            )}{" "}
            {busy ? "Se încarcă…" : "Înregistrează documentul"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
