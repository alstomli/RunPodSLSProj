import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { connection, NextResponse, type NextRequest } from "next/server";
import { config } from "./config";

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

export async function requestSession(request: NextRequest) {
  await connection();
  const { supabaseUrl, supabaseAnonKey } = config();
  const cookies = new Map<string, CookieToSet>();
  const headers: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, extraHeaders) {
        for (const cookie of list) {
          request.cookies.set(cookie.name, cookie.value);
          cookies.set(cookie.name, cookie);
        }
        Object.assign(headers, extraHeaders);
      },
    },
  });

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

export function notSignedIn() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}
