let identity = localStorage.getItem("flyleaf-user") || "admin";
export function setIdentity(id: string) {
  identity = id;
  localStorage.setItem("flyleaf-user", id);
}
export function clearIdentity() {
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
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
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
  const res = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    credentials: "include",
  });
  if (!res.ok)
    throw new Error(
      "Fișierul nu poate fi descărcat. Verifică drepturile de acces.",
    );
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
