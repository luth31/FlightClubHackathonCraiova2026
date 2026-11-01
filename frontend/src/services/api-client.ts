let identity = localStorage.getItem("flyleaf-user") || "admin";
let sessionExpired = false;
let sessionGeneration = 0;
const expiryListeners = new Set<() => void>();
export const isSessionExpired = () => sessionExpired;
export function onSessionExpired(listener: () => void) {
  expiryListeners.add(listener);
  return () => { expiryListeners.delete(listener); };
}
export class SessionExpiredError extends Error {
  constructor() { super("Conectează-te pentru a continua."); this.name = "SessionExpiredError"; }
}
function checkSession(response: Response, generation: number) {
  if (response.status !== 401) return;
  if (!sessionExpired && generation === sessionGeneration) {
    sessionExpired = true;
    clearIdentity();
    expiryListeners.forEach(listener => listener());
  }
  throw new SessionExpiredError();
}
export function setIdentity(id: string) {
  sessionExpired = false;
  sessionGeneration++;
  identity = id;
  localStorage.setItem("flyleaf-user", id);
}
export function clearIdentity() {
  sessionGeneration++;
  identity = "";
  localStorage.removeItem("flyleaf-user");
}
export function getIdentity() {
  return identity;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const publicRequest = path === '/session' || path.startsWith('/auth/');
  if (sessionExpired && !publicRequest) throw new SessionExpiredError();
  const generation = sessionGeneration;
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!publicRequest) checkSession(res, generation);
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ detail: "Serviciul nu este disponibil momentan." }));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Verifică informațiile introduse.",
    );
  }
  return res.json();
}
export async function download(path: string, filename: string) {
  if (sessionExpired) throw new SessionExpiredError();
  const generation = sessionGeneration;
  const res = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    credentials: "include",
  });
  checkSession(res, generation);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === 'string' ? body.detail : "Fișierul nu poate fi descărcat. Verifică drepturile de acces.",
    );
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function fileUrl(path: string) {
  const url = new URL(path, location.origin);
  return url.pathname + url.search;
}
