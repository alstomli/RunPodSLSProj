import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";

export const appUrl = inject("appUrl");

export type TestUser = { id: string; email: string; password: string };

export async function createUser(): Promise<TestUser> {
  const env = inject("env");
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `user-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function supabaseAs(user: TestUser) {
  const env = inject("env");
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

export class Browser {
  readonly cookies = new Map<string, string>();

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${appUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) this.storeCookie(line);
    return response;
  }

  get(path: string) {
    return this.request("GET", path);
  }

  post(path: string, body?: unknown) {
    return this.request("POST", path, body);
  }

  async signIn(user: { email: string; password: string }) {
    const response = await this.post("/api/auth/sign-in", { email: user.email, password: user.password });
    if (response.status !== 200) throw new Error(`sign-in failed: ${response.status} ${await response.text()}`);
    return response;
  }

  clone() {
    const copy = new Browser();
    for (const [name, value] of this.cookies) copy.cookies.set(name, value);
    return copy;
  }

  private storeCookie(line: string) {
    const [pair, ...attributes] = line.split(";").map((part) => part.trim());
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expired = attributes.some((a) => {
      const [key, val = ""] = a.split("=");
      if (key.toLowerCase() === "max-age") return Number(val) <= 0;
      if (key.toLowerCase() === "expires") return Date.parse(val) <= Date.now();
      return false;
    });
    if (expired || value === "") this.cookies.delete(name);
    else this.cookies.set(name, value);
  }
}
