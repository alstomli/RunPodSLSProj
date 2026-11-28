import { NextResponse, type NextRequest } from "next/server";
import { notSignedIn, requestSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { id, email } = session.user;
  return session.respond(NextResponse.json({ user: { id, email } }));
}
