import { NextResponse, type NextRequest } from "next/server";
import { isFinished } from "@/lib/image-view";
import { IMAGES_TABLE, isImageId, toImageView, type ImageRow } from "@/lib/images";
import { runpodClient } from "@/lib/runpod";
import { notSignedIn, requestSession } from "@/lib/session";

/**
 * POST → asks Runpod to cancel the Job and answers at once: 202 with the Job's ImageView, still
 * unfinished. The Job follower records "cancelled" when Runpod reports it (Users can't update rows).
 * 404 for an unknown id and for another User's Job (row-level security hides it).
 * 409 when the Job has already finished. 502 when Runpod doesn't take the cancel.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { id } = await ctx.params;

  const row = isImageId(id)
    ? (await session.supabase.from(IMAGES_TABLE).select().eq("id", id).maybeSingle<ImageRow>()).data
    : null;
  if (!row) return session.respond(NextResponse.json({ error: "There's no such Job." }, { status: 404 }));
  if (isFinished(row.status) || !row.runpod_job_id) {
    return session.respond(NextResponse.json({ error: "The Job has already finished." }, { status: 409 }));
  }

  try {
    await runpodClient().cancel(row.runpod_job_id);
  } catch (error) {
    console.error(`Couldn't cancel Image ${row.id} (Runpod Job ${row.runpod_job_id}): ${(error as Error).message}`);
    return session.respond(
      NextResponse.json({ error: "Runpod didn't take the cancel. Try again." }, { status: 502 }),
    );
  }
  return session.respond(NextResponse.json(toImageView(row), { status: 202 }));
}
