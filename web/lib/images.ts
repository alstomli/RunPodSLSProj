import "server-only";
import type { ImageStatus, ImageView } from "./image-view";
import type { RequestSession } from "./session";

export const IMAGES_TABLE = "images";
export const IMAGES_BUCKET = "images";

export type ImageRow = {
  id: string;
  user_id: string;
  runpod_job_id: string | null;
  status: ImageStatus;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  error: string | null;
  file_path: string | null;
  created_at: string;
  finished_at: string | null;
};

/** The Storage policy keys on the first folder, the User's id. */
export function imageFilePath(userId: string, imageId: string) {
  return `${userId}/${imageId}.png`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id must be a plain 404, not a database error. */
export function isImageId(id: string) {
  return UUID.test(id);
}

export async function findOwnImage(session: Pick<RequestSession, "supabase">, id: string): Promise<ImageRow | null> {
  if (!isImageId(id)) return null;
  const { data, error } = await session.supabase.from(IMAGES_TABLE).select().eq("id", id).maybeSingle<ImageRow>();
  if (error) console.error(`Couldn't read Image ${id}: ${error.message}`);
  return data;
}

export function toImageView(row: ImageRow, now = Date.now()): ImageView {
  const created = Date.parse(row.created_at);
  const end = row.finished_at ? Date.parse(row.finished_at) : now;
  return {
    id: row.id,
    status: row.status,
    prompt: row.prompt,
    width: row.width,
    height: row.height,
    steps: row.steps,
    guidance: row.guidance,
    seed: Number(row.seed),
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    elapsedSeconds: Math.max(0, Math.round((end - created) / 1000)),
  };
}
