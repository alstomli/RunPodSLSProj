import { NextResponse, type NextRequest } from "next/server";
import { notSignedIn, requestSession } from "@/lib/session";

/**
 * GET → { user: { id, email } } for the signed-in User, as Supabase Auth knows them. The page
 * doesn't use it; it exists for the tests (the container test proves the server acts as the User).
 */
export async function GET(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { id, email } = session.user;
  return session.respond(NextResponse.json({ user: { id, email } }));
}
