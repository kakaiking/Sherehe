import { PORTAL_HEADER, readStoredPortal } from "./portal";

export type ApiError = {
  status: number;
  detail: string;
  code?: string;
};

let csrf = "";

/** Parse JSON without throwing on HTML/text 500 bodies from the edge. */
export async function parseJsonBody(res: Response): Promise<unknown> {
  const body = res as { text?: () => Promise<string>; json?: () => Promise<unknown> };
  if (typeof body.text === "function") {
    const text = await body.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof body.json === "function") {
    try {
      return await body.json();
    } catch {
      return null;
    }
  }
  return null;
}

async function readError(res: Response): Promise<ApiError> {
  const body: unknown = await parseJsonBody(res);
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    const code =
      "code" in body && typeof body.code === "string" ? body.code : undefined;
    const err: ApiError = { status: res.status, detail: body.detail };
    if (code) err.code = code;
    return err;
  }
  return { status: res.status, detail: "Request failed." };
}

function withPortalHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has(PORTAL_HEADER)) {
    headers.set(PORTAL_HEADER, readStoredPortal());
  }
  return headers;
}

export async function ensureCsrf(): Promise<string> {
  if (csrf) return csrf;
  const res = await fetch("/v1/auth/csrf", {
    credentials: "include",
    headers: withPortalHeaders(),
  });
  const body: unknown = await parseJsonBody(res);
  if (
    typeof body === "object" &&
    body !== null &&
    "csrfToken" in body &&
    typeof body.csrfToken === "string"
  ) {
    csrf = body.csrfToken;
    return csrf;
  }
  throw new Error("csrf");
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = withPortalHeaders(init);
  if (init.method && init.method !== "GET") {
    headers.set("x-csrf-token", await ensureCsrf());
    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 204) {
    return undefined as T;
  }
  if (!res.ok) {
    throw await readError(res);
  }
  const body = await parseJsonBody(res);
  if (body === null) {
    throw { status: res.status, detail: "Request failed." } satisfies ApiError;
  }
  return body as T;
}

/**
 * Fetch a PDF and trigger a file download without navigating the SPA
 * (or opening the browser's PDF viewer as a page).
 */
export async function downloadPdf(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetch(path, {
    credentials: "include",
    headers: withPortalHeaders(),
  });
  if (!res.ok) {
    throw await readError(res);
  }
  const raw = await res.blob();
  // octet-stream + download= keeps Chromium from swapping the tab for a PDF preview.
  const blob = new Blob([raw], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke after the browser has a chance to start the save dialog.
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function formatKsh(n: number): string {
  return `KSh ${new Intl.NumberFormat("en-KE").format(n)}`;
}
