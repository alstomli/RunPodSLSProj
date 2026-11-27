import "server-only";
import type { ImageStatus, ImageView } from "./image-view";

/** The Images table (supabase/migrations/*_images.sql) and the Storage bucket that holds the PNGs. */

export const IMAGES_TABLE = "images";
export const IMAGES_BUCKET = "images";

/** A row of the Images table. */
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

/** Where an Image's PNG lives in the bucket. The Storage policy keys on the first folder. */
export function imageFilePath(userId: string, imageId: string) {
  return `${userId}/${imageId}.png`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `id` can be an Image id (so a malformed id is a plain 404, not a database error). */
export function isImageId(id: string) {
  return UUID.test(id);
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
