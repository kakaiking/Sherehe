export type ApiError = {
  status: number;
  detail: string;
  code?: string;
};

let csrf = "";

async function readError(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json();
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
  } catch {
    /* ignore */
  }
  return { status: res.status, detail: "Request failed." };
}

export async function ensureCsrf(): Promise<string> {
  if (csrf) return csrf;
  const res = await fetch("/v1/auth/csrf", { credentials: "include" });
  const body: unknown = await res.json();
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
  const headers = new Headers(init.headers);
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
  return (await res.json()) as T;
}

export async function downloadPdf(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) {
    throw await readError(res);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatKsh(n: number): string {
  return `KSh ${new Intl.NumberFormat("en-KE").format(n)}`;
}
