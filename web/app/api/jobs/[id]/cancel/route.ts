import { NextResponse, type NextRequest } from "next/server";
import { isFinished } from "@/lib/image-view";
import { findOwnImage, toImageView } from "@/lib/images";
import { runpodClient } from "@/lib/runpod";
import { notSignedIn, requestSession } from "@/lib/session";
import { errorMessage } from "@/lib/utils/unknown";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const row = await findOwnImage(session, (await ctx.params).id);
  if (!row) return session.respond(NextResponse.json({ error: "There's no such Job." }, { status: 404 }));
  if (isFinished(row.status)) {
    return session.respond(NextResponse.json({ error: "The Job has already finished." }, { status: 409 }));
  }
  if (!row.runpod_job_id) {
    return session.respond(
      NextResponse.json({ error: "The Job has not reached Runpod yet. Try again in a moment." }, { status: 409 }),
    );
  }

  try {
    await runpodClient().cancel(row.runpod_job_id);
  } catch (error) {
    console.error(`Couldn't cancel Image ${row.id} (Runpod Job ${row.runpod_job_id}): ${errorMessage(error)}`);
    return session.respond(
      NextResponse.json({ error: "Runpod didn't take the cancel. Try again." }, { status: 502 }),
    );
  }
  return session.respond(NextResponse.json(toImageView(row), { status: 202 }));
}
