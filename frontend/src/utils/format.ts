export const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("ro-RO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Bucharest",
      }).format(new Date(value))
    : "Fără termen";
export const time = (value: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
export const money = (value?: number | null, currency = "RON") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
export const statusLabel: Record<string, string> = {
  draft: "Ciornă",
  in_review: "În aprobare",
  approved: "Aprobat",
  signed: "Semnat",
  archived: "Arhivat",
  active: "Activ",
  expired: "Expirat",
  revoked: "Revocat",
  superseded: "Versiune înlocuită",
  pending: "În așteptare",
  completed: "Finalizat",
  rejected: "Returnat",
};
export const roleLabel: Record<string, string> = {
  admin: "Administrator",
  manager: "Director",
  reviewer: "Avizator",
  finance: "Financiar",
  hr: "Resurse umane",
  technician: "Tehnician",
};
export const actionLabel: Record<string, string> = {
  created: "Document înregistrat",
  uploaded: "Document încărcat",
  upload: "Document încărcat",
  validated: "Metadate validate",
  validate: "Metadate validate",
  submitted: "Trimis spre aprobare",
  submit: "Trimis spre aprobare",
  approved: "Document aprobat",
  approve: "Document aprobat",
  rejected: "Returnat pentru corectare",
  reject: "Returnat pentru corectare",
  signed: "Document semnat",
  sign: "Document semnat",
  shared: "Document partajat",
  share: "Document partajat",
  revoked: "Acces revocat",
  archived: "Document arhivat",
  download: "Fișier descărcat",
  view: "Document consultat",
  updated: "Document actualizat",
  version_created: "Versiune nouă",
  share_revoked: "Acces revocat",
  leave_requested: "Cerere de concediu trimisă",
  leave_approved: "Concediu aprobat",
  leave_rejected: "Concediu respins",
  delegation_created: "Delegare înregistrată",
  delegation_revoked: "Delegare revocată",
  account_activated: "Cont activat",
  account_deactivated: "Cont dezactivat",
};
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
