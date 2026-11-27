import { NextResponse, type NextRequest } from "next/server";
import { UNFINISHED_STATUSES } from "@/lib/image-view";
import { IMAGES_TABLE, toImageView, type ImageRow } from "@/lib/images";
import { notSignedIn, requestSession } from "@/lib/session";

/**
 * GET → `{ job: ImageView | null }`: the User's newest unfinished Job, so the page can show it in
 * the current Job panel again after a reload (status, elapsed time, Cancel, Generate disabled).
 * `null` when every Job has finished. Read as the User, so row-level security applies.
 */
export async function GET(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());

  const { data, error } = await session.supabase
    .from(IMAGES_TABLE)
    .select()
    .in("status", UNFINISHED_STATUSES)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<ImageRow>();
  if (error) {
    console.error(`Couldn't find the current Job: ${error.message}`);
    return session.respond(NextResponse.json({ error: "Couldn't load your current Job." }, { status: 500 }));
  }
  return session.respond(NextResponse.json({ job: data ? toImageView(data) : null }));
}
