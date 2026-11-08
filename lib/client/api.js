// Browser helper for this app's route handlers (/api/*): base-path aware, JSON in/out, never throws.

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const GENERIC_ERROR = "Something went wrong. Please try again.";

// App-relative path ("/api/…") -> URL under the deployed base path, for fetches and download links.
export function apiUrl(path) {
  return `${BASE_PATH}${path}`;
}

// Resolves { data, error, status, code }: data is the JSON body on success (else null); error is the server's message or a generic string.
export async function apiRequest(path, { method = "GET", body, signal } = {}) {
  const init = { method, signal, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (body !== undefined) {
    try {
      init.body = JSON.stringify(body);
    } catch {
      return { data: null, error: GENERIC_ERROR, status: 0, code: "invalid_body" };
    }
    init.headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(apiUrl(path), init);
  } catch (e) {
    if (e?.name === "AbortError") return { data: null, error: "Request cancelled.", status: 0, code: "aborted" };
    return { data: null, error: "Network error. Check your connection and try again.", status: 0, code: "network" };
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return { data: json, error: null, status: res.status, code: null };
  const message = typeof json?.message === "string" && json.message ? json.message : GENERIC_ERROR;
  return { data: null, error: message, status: res.status, code: json?.code ?? null };
}
