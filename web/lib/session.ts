import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { connection, NextResponse, type NextRequest } from "next/server";
import { config } from "./config";

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * The visitor's Supabase session, read from the request cookies.
 *
 * `supabase` acts as the signed-in User (anon key + the User's token), so row-level security
 * applies to everything it does. Anything Supabase changes about the session (a refreshed
 * token, sign-in, sign-out) is collected and written onto the response by `respond`.
 *
 *   const session = await requestSession(request);
 *   if (!session.user) return session.respond(notSignedIn());
 *   return session.respond(NextResponse.json(...));
 */
export async function requestSession(request: NextRequest) {
  // Never at build time: with Cache Components a GET route is prerendered at build unless it
  // waits for a request, and configuration only exists when the server runs.
  await connection();
  const { supabaseUrl, supabaseAnonKey } = config();
  const cookies = new Map<string, CookieToSet>();
  const headers: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, extraHeaders) {
        for (const cookie of list) {
          // Later code in this request (and the route behind the proxy) sees the new value.
          request.cookies.set(cookie.name, cookie.value);
          cookies.set(cookie.name, cookie);
        }
        Object.assign(headers, extraHeaders);
      },
    },
  });

  // getUser asks Supabase Auth, so a signed-out or revoked session is rejected
  // even while its token has not expired yet.
  const { data } = await supabase.auth.getUser();
  const user: User | null = data.user;

  return {
    supabase,
    user,
    respond<T extends NextResponse>(response: T): T {
      for (const { name, value, options } of cookies.values()) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    },
  };
}

export type RequestSession = Awaited<ReturnType<typeof requestSession>>;

/** The 401 every server route except sign-in gives visitors who aren't signed in. */
export function notSignedIn() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}
