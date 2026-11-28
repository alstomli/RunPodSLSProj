import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { UNFINISHED_STATUSES } from "./image-view";
import { IMAGES_BUCKET, IMAGES_TABLE, imageFilePath, type ImageRow } from "./images";
import { runpodClient, RunpodError, type Runpod, type RunpodJob, type RunpodStatus } from "./runpod";

export type ProcessOptions = {
  userId?: string;
  now?: number;
};

export const RESULT_EXPIRED = "Runpod no longer has this Job (result expired).";

export const NEVER_SENT_AFTER_MS = 2 * 60_000;

export const NEVER_REACHED_RUNPOD = "The Job never reached Runpod (the server stopped before sending it). Try again.";

let cachedServiceClient: SupabaseClient | undefined;

function serviceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = config();
  return (cachedServiceClient ??= createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

export async function processPendingJobs(options: ProcessOptions = {}): Promise<void> {
  const service = serviceClient();
  await failJobsThatNeverReachedRunpod(service, options);

  let query = service
    .from(IMAGES_TABLE)
    .select()
    .in("status", UNFINISHED_STATUSES)
    .not("runpod_job_id", "is", null)
    .order("created_at", { ascending: true });
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data: rows, error } = await query.overrideTypes<ImageRow[], { merge: false }>();
  if (error) throw new Error(`Couldn't list unfinished Jobs: ${error.message}`);

  const runpod = runpodClient();
  for (const row of rows ?? []) {
    try {
      await followJob(service, runpod, row);
    } catch (error) {
      console.error(`Job follower: Image ${row.id} (Runpod Job ${row.runpod_job_id}): ${(error as Error).message}`);
    }
  }
}

async function failJobsThatNeverReachedRunpod(service: SupabaseClient, { userId, now = Date.now() }: ProcessOptions) {
  let update = service
    .from(IMAGES_TABLE)
    .update({ status: "failed", error: NEVER_REACHED_RUNPOD, finished_at: new Date(now).toISOString() })
    .eq("status", "pending")
    .is("runpod_job_id", null)
    .lt("created_at", new Date(now - NEVER_SENT_AFTER_MS).toISOString());
  if (userId) update = update.eq("user_id", userId);
  const { error } = await update;
  if (error) console.error(`Job follower: couldn't fail Jobs that never reached Runpod: ${error.message}`);
}

type Outcome =
  | { status: "in_queue" | "in_progress" }
  | { status: "completed"; png: Buffer }
  | { status: "failed" | "cancelled"; reason: string };

const OUTCOMES: { [S in RunpodStatus]: (job: RunpodJob) => Outcome } = {
  IN_QUEUE: () => ({ status: "in_queue" }),
  IN_PROGRESS: () => ({ status: "in_progress" }),
  COMPLETED: (job) => {
    const workerError = reasonFrom((job.output as { error?: unknown } | null | undefined)?.error);
    if (workerError) return { status: "failed", reason: workerError };
    const png = imageFrom(job.output);
    if (!png) return { status: "failed", reason: "The Worker finished but sent no image." };
    return { status: "completed", png };
  },
  FAILED: (job) => ({ status: "failed", reason: reasonFrom(job.error) ?? "The Job failed on Runpod." }),
  CANCELLED: (job) => ({ status: "cancelled", reason: reasonFrom(job.error) ?? "The Job was cancelled." }),
  TIMED_OUT: (job) => {
    const reason = reasonFrom(job.error);
    return { status: "failed", reason: `The Job timed out on Runpod${reason ? `: ${reason}` : "."}` };
  },
};

async function followJob(service: SupabaseClient, runpod: Runpod, row: ImageRow) {
  let outcome: Outcome;
  try {
    const job = await runpod.status(row.runpod_job_id!);
    outcome = OUTCOMES[job.status](job);
  } catch (error) {
    if (error instanceof RunpodError && error.status === 404) {
      outcome = { status: "failed", reason: RESULT_EXPIRED };
    } else {
      throw error;
    }
  }
  await record(service, row, outcome);
}

async function record(service: SupabaseClient, row: ImageRow, outcome: Outcome) {
  const finishedAt = () => new Date().toISOString();
  switch (outcome.status) {
    case "in_queue":
    case "in_progress":
      if (outcome.status !== row.status) await updateUnfinished(service, row, { status: outcome.status });
      return;
    case "completed": {
      const path = imageFilePath(row.user_id, row.id);
      const upload = await service.storage
        .from(IMAGES_BUCKET)
        .upload(path, outcome.png, { contentType: "image/png", upsert: true });
      if (upload.error) throw new Error(`Couldn't store the PNG: ${upload.error.message}`);
      await updateUnfinished(service, row, { status: "completed", file_path: path, error: null, finished_at: finishedAt() });
      return;
    }
    case "failed":
    case "cancelled":
      await updateUnfinished(service, row, { status: outcome.status, error: outcome.reason, finished_at: finishedAt() });
      return;
  }
}

function reasonFrom(error: unknown): string | null {
  if (error === undefined || error === null || error === "") return null;
  let value: unknown = error;
  if (typeof error === "string") {
    try {
      value = JSON.parse(error);
    } catch {
      return error;
    }
  }
  if (value && typeof value === "object") {
    const { error_message, error: inner } = value as { error_message?: unknown; error?: unknown };
    const message = error_message ?? inner;
    if (typeof message === "string" && message) return message;
    return JSON.stringify(value);
  }
  return typeof error === "string" ? error : JSON.stringify(error);
}

function imageFrom(output: unknown): Buffer | null {
  const base64 = (output as { image_base64?: unknown } | null | undefined)?.image_base64;
  if (typeof base64 !== "string" || !base64) return null;
  return Buffer.from(base64, "base64");
}

async function updateUnfinished(service: SupabaseClient, row: ImageRow, changes: Partial<ImageRow>) {
  const { error } = await service.from(IMAGES_TABLE).update(changes).eq("id", row.id).in("status", UNFINISHED_STATUSES);
  if (error) throw new Error(`Couldn't update the row: ${error.message}`);
}

export const FOLLOW_INTERVAL_MS = 3000;

const TIMER = Symbol.for("runpodslsproj.jobFollowerTimer");

export function startJobFollower(intervalMs = FOLLOW_INTERVAL_MS) {
  const holder = globalThis as { [TIMER]?: NodeJS.Timeout };
  if (holder[TIMER]) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingJobs();
    } catch (error) {
      console.error(`Job follower: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };
  holder[TIMER] = setInterval(tick, intervalMs);
  holder[TIMER].unref();
  void tick();
}
