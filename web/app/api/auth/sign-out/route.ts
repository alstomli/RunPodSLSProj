import { NextResponse, type NextRequest } from "next/server";
import { notSignedIn, requestSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { error } = await session.supabase.auth.signOut({ scope: "local" });
  if (error) {
    return session.respond(NextResponse.json({ error: "Sign-out failed. Try again." }, { status: 502 }));
  }
  return session.respond(NextResponse.json({ signedOut: true }));
}
