import { NextResponse, type NextRequest } from "next/server";
import { findOwnImage, toImageView } from "@/lib/images";
import { notSignedIn, requestSession } from "@/lib/session";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());

  const row = await findOwnImage(session, (await ctx.params).id);
  if (!row) return session.respond(NextResponse.json({ error: "There's no such Job." }, { status: 404 }));
  return session.respond(NextResponse.json(toImageView(row)));
}
