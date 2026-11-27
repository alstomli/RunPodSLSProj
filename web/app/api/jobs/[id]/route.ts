import { NextResponse, type NextRequest } from "next/server";
import { IMAGES_TABLE, isImageId, toImageView, type ImageRow } from "@/lib/images";
import { notSignedIn, requestSession } from "@/lib/session";

/**
 * GET → the Job's ImageView. It reads the row, which the Job follower keeps current; it never
 * calls Runpod. 404 for an unknown id and for another User's Job (row-level security hides it).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { id } = await ctx.params;

  const row = isImageId(id)
    ? (await session.supabase.from(IMAGES_TABLE).select().eq("id", id).maybeSingle<ImageRow>()).data
    : null;
  if (!row) return session.respond(NextResponse.json({ error: "There's no such Job." }, { status: 404 }));
  return session.respond(NextResponse.json(toImageView(row)));
}
