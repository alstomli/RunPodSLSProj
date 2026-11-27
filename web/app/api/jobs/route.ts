import { randomInt, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { IMAGES_TABLE, toImageView, type ImageRow } from "@/lib/images";
import { runpodClient } from "@/lib/runpod";
import { notSignedIn, requestSession } from "@/lib/session";
import { MAX_SEED, validateSettings } from "@/lib/settings";

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
  const couldNotSave = () =>
    session.respond(NextResponse.json({ error: "Couldn't save the Job. Try again." }, { status: 500 }));

  const stored = await session.supabase
    .from(IMAGES_TABLE)
    .insert({ id, user_id: session.user.id, status: "pending", ...settings });
  if (stored.error) {
    console.error(`Couldn't store Image ${id}: ${stored.error.message}`);
    return couldNotSave();
  }

  const record = (changes: Partial<ImageRow>) =>
    session.supabase
      .from(IMAGES_TABLE)
      .update(changes)
      .eq("id", id)
      .eq("status", "pending")
      .is("runpod_job_id", null)
      .select()
      .maybeSingle<ImageRow>();

  const runpod = runpodClient();
  let runpodJobId: string;
  try {
    runpodJobId = await runpod.submit(settings);
  } catch (error) {
    const refusal = (error as Error).message;
    console.error(`Runpod refused Image ${id}: ${refusal}`);
    const failed = await record({ status: "failed", error: refusal, finished_at: new Date().toISOString() });
    if (failed.error) console.error(`Couldn't mark Image ${id} failed: ${failed.error.message}`);
    return session.respond(
      NextResponse.json({ error: "Runpod didn't accept the Job. Try again later.", id }, { status: 502 }),
    );
  }

  const { data, error } = await record({ runpod_job_id: runpodJobId });
  if (error || !data) {
    console.error(`Couldn't record Runpod Job ${runpodJobId} on Image ${id}: ${error?.message ?? "row not pending"}`);
    await runpod.cancel(runpodJobId).catch(() => undefined);
    return couldNotSave();
  }
  return session.respond(NextResponse.json(toImageView(data), { status: 201 }));
}
