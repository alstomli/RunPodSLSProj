import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { UNFINISHED_STATUSES, type ImageStatus } from "./image-view";
import { IMAGES_BUCKET, IMAGES_TABLE, imageFilePath, type ImageRow } from "./images";
import { runpodClient, RunpodError, type Runpod, type RunpodJob } from "./runpod";

/**
 * The Job follower: saves finished Images on the server, whether or not a browser is watching.
 * This is the only code that uses the Supabase service key.
 */

export type ProcessOptions = {
  /** Only this User's Jobs. Tests use it, because the local database is shared. */
  userId?: string;
};

/** The Runpod Job statuses that map straight onto an unfinished Image status. */
const RUNNING: Record<string, ImageStatus> = { IN_QUEUE: "in_queue", IN_PROGRESS: "in_progress" };

/** The reason recorded when Runpod no longer knows the Job (its result has expired). */
export const RESULT_EXPIRED = "Runpod no longer has this Job (result expired).";

let admin: SupabaseClient | undefined;

function serviceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = config();
  return (admin ??= createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/**
 * Process pending Jobs: works through every unfinished Job, oldest first. For each it asks
 * Runpod for the Job's status and records it; a COMPLETED Job's PNG is stored and the row marked
 * completed. FAILED, TIMED_OUT, a Worker error and an expired result (404) end failed with the
 * reason; CANCELLED ends cancelled. Runs to the end even when one Job can't be checked (that Job
 * is tried next time). The timer's first run at boot picks up Jobs left from before a restart.
 */
export async function processPendingJobs(options: ProcessOptions = {}): Promise<void> {
  const db = serviceClient();
  let query = db
    .from(IMAGES_TABLE)
    .select()
    .in("status", UNFINISHED_STATUSES)
    .not("runpod_job_id", "is", null)
    .order("created_at", { ascending: true });
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data: rows, error } = await query.returns<ImageRow[]>();
  if (error) throw new Error(`Couldn't list unfinished Jobs: ${error.message}`);

  const runpod = runpodClient();
  for (const row of rows ?? []) {
    try {
      await followJob(db, runpod, row);
    } catch (error) {
      console.error(`Job follower: Image ${row.id} (Runpod Job ${row.runpod_job_id}): ${(error as Error).message}`);
    }
  }
}

async function followJob(db: SupabaseClient, runpod: Runpod, row: ImageRow) {
  let job: RunpodJob;
  try {
    job = await runpod.status(row.runpod_job_id!);
  } catch (error) {
    // Runpod keeps a Job's result for about 30 minutes; after that it answers 404.
    if (error instanceof RunpodError && error.status === 404) {
      await finish(db, row, "failed", RESULT_EXPIRED);
      return;
    }
    // Any other RunpodError is not recorded: the Job is checked again on the next run.
    throw error;
  }

  const running = RUNNING[job.status];
  if (running) {
    if (running !== row.status) await updateUnfinished(db, row, { status: running });
    return;
  }
  if (job.status === "COMPLETED") {
    const workerError = reasonFrom((job.output as { error?: unknown } | null | undefined)?.error);
    if (workerError) {
      await finish(db, row, "failed", workerError);
      return;
    }
    const png = imageFrom(job.output);
    if (!png) {
      await finish(db, row, "failed", "The Worker finished but sent no image.");
      return;
    }
    const path = imageFilePath(row.user_id, row.id);
    const upload = await db.storage
      .from(IMAGES_BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (upload.error) throw new Error(`Couldn't store the PNG: ${upload.error.message}`);
    await updateUnfinished(db, row, {
      status: "completed",
      file_path: path,
      error: null,
      finished_at: new Date().toISOString(),
    });
    return;
  }
  if (job.status === "FAILED") {
    await finish(db, row, "failed", reasonFrom(job.error) ?? "The Job failed on Runpod.");
    return;
  }
  if (job.status === "CANCELLED") {
    await finish(db, row, "cancelled", reasonFrom(job.error) ?? "The Job was cancelled.");
    return;
  }
  if (job.status === "TIMED_OUT") {
    const reason = reasonFrom(job.error);
    await finish(db, row, "failed", `The Job timed out on Runpod${reason ? `: ${reason}` : "."}`);
    return;
  }
  // A status this code doesn't know: leave the row and ask again next run.
  throw new Error(`Unknown Runpod status ${job.status}`);
}

/** Records a final status and why, with the finished time. */
function finish(db: SupabaseClient, row: ImageRow, status: "failed" | "cancelled", reason: string | null) {
  return updateUnfinished(db, row, { status, error: reason, finished_at: new Date().toISOString() });
}

/**
 * The reason in Runpod's `error` field, for the User. Runpod sends a plain message, or (when the
 * handler raised) a JSON string with `error_message`; anything else is shown as JSON.
 */
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

/** The PNG bytes from the Worker's output, or null if there are none. */
function imageFrom(output: unknown): Buffer | null {
  const base64 = (output as { image_base64?: unknown } | null | undefined)?.image_base64;
  if (typeof base64 !== "string" || !base64) return null;
  return Buffer.from(base64, "base64");
}

/**
 * Changes a row only while it is still unfinished, so two followers (two copies of the app)
 * never finish the same Job twice.
 */
async function updateUnfinished(db: SupabaseClient, row: ImageRow, changes: Partial<ImageRow>) {
  const { error } = await db.from(IMAGES_TABLE).update(changes).eq("id", row.id).in("status", UNFINISHED_STATUSES);
  if (error) throw new Error(`Couldn't update the row: ${error.message}`);
}

/** How often the timer runs the follower; the CLI client polls at the same rate. */
export const FOLLOW_INTERVAL_MS = 3000;

const TIMER = Symbol.for("runpodslsproj.jobFollowerTimer");

/**
 * Starts the timer that runs processPendingJobs about every 3 seconds, first right away (which
 * picks up Jobs left unfinished before a restart). Runs never overlap. One timer per process.
 */
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
