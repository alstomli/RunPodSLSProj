/**
 * The page's one way of calling the server routes. Every route answers errors as
 * `{ error: "<sentence for the User>" }` (plus `fields` for invalid settings), so this returns
 * either the reply's body or a sentence to show: the route's own, else `error`, or a
 * "can't reach the server" sentence when the request didn't get through at all.
 */

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
    /** Sent as the JSON body. */
    json?: unknown;
    /** Shown when the route fails without saying why. */
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
