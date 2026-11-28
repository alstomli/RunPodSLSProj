import { NextResponse, type NextRequest } from "next/server";
import { requestSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const input = await request.json().catch(() => null);
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const session = await requestSession(request);
  const { data, error } = await session.supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes." }, { status: 429 });
    }
    if (error.status && error.status < 500) {
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }
    return NextResponse.json({ error: "Sign-in isn't available right now. Try again later." }, { status: 503 });
  }
  return session.respond(NextResponse.json({ user: { id: data.user.id, email: data.user.email } }));
}
