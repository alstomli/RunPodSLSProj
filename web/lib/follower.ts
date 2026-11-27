import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { UNFINISHED_STATUSES, type ImageStatus } from "./image-view";
import { IMAGES_BUCKET, IMAGES_TABLE, imageFilePath, type ImageRow } from "./images";
import { runpodClient, type Runpod, type RunpodJob } from "./runpod";

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
 * completed. Runs to the end even when one Job can't be checked (that Job is tried next time).
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
  // A RunpodError here is not recorded: the Job is checked again on the next run.
  const job: RunpodJob = await runpod.status(row.runpod_job_id!);

  const running = RUNNING[job.status];
  if (running) {
    if (running !== row.status) await updateUnfinished(db, row, { status: running });
    return;
  }
  if (job.status === "COMPLETED") {
    const png = imageFrom(job.output);
    if (!png) throw new Error("COMPLETED without an image");
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
  throw new Error(`Runpod status ${job.status} isn't handled yet`);
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
