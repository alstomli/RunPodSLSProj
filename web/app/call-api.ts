export type ErrorBody = { error?: string; fields?: Record<string, string> };

export type ApiResult<T> = { ok: true; body: T } | { ok: false; error: string; body: ErrorBody | null };

export const OFFLINE = "Can't reach the server. Check your connection and try again.";

export async function callApi<T>(
  path: string,
  {
    method = "GET",
    json,
    error,
    offlineError = OFFLINE,
  }: {
    method?: "GET" | "POST";
    json?: unknown;
    error: string;
    offlineError?: string;
  },
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      ...(json === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }),
    });
  } catch {
    return { ok: false, error: offlineError, body: null };
  }
  const body = await response.json().catch(() => null);
  if (response.ok) return { ok: true, body: body as T };
  return { ok: false, error: (body as ErrorBody | null)?.error ?? error, body: body as ErrorBody | null };
}
