import { randomInt, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { IMAGES_TABLE, toImageView, type ImageRow } from "@/lib/images";
import { runpodClient } from "@/lib/runpod";
import { notSignedIn, requestSession } from "@/lib/session";
import { MAX_SEED, validateSettings } from "@/lib/settings";

/**
 * POST { prompt, ...settings } → 201 ImageView (status "pending").
 * 400 { error, fields } when the settings are invalid (nothing is sent to Runpod).
 * 502 { error, id } when Runpod refuses the Job; the Image is stored as "failed".
 *
 * The Job is submitted first and the row stored after, with its Runpod Job id, because Users
 * can only insert rows, not update them (only the Job follower updates rows).
 */
export async function POST(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());

  const input = await request.json().catch(() => null);
  const validation = validateSettings(input);
  if (!validation.ok) {
    return session.respond(
      NextResponse.json({ error: "Some settings aren't valid.", fields: validation.errors }, { status: 400 }),
    );
  }
  const settings = { ...validation.settings, seed: validation.settings.seed ?? randomInt(0, MAX_SEED + 1) };

  const id = randomUUID();
  const runpod = runpodClient();
  let runpodJobId: string | null = null;
  let refusal: string | null = null;
  try {
    runpodJobId = await runpod.submit(settings);
  } catch (error) {
    refusal = (error as Error).message;
  }

  const { data, error } = await session.supabase
    .from(IMAGES_TABLE)
    .insert({
      id,
      user_id: session.user.id,
      runpod_job_id: runpodJobId,
      status: refusal ? "failed" : "pending",
      ...settings,
      error: refusal,
      finished_at: refusal ? new Date().toISOString() : null,
    })
    .select()
    .single<ImageRow>();

  if (error || !data) {
    console.error(`Couldn't store Image ${id}: ${error?.message}`);
    // Don't leave a Job running (and costing money) that nothing will ever save.
    if (runpodJobId) await runpod.cancel(runpodJobId).catch(() => undefined);
    return session.respond(NextResponse.json({ error: "Couldn't save the Job. Try again." }, { status: 500 }));
  }

  if (refusal) {
    console.error(`Runpod refused Image ${id}: ${refusal}`);
    return session.respond(
      NextResponse.json({ error: "Runpod didn't accept the Job. Try again later.", id }, { status: 502 }),
    );
  }
  return session.respond(NextResponse.json(toImageView(data), { status: 201 }));
}
