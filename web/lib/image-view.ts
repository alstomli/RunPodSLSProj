/**
 * An Image as the API returns it (Create Job, Job status, and later the Gallery).
 * Shared by the server routes and the page, so no server-only code here.
 */

export const IMAGE_STATUSES = ["pending", "in_queue", "in_progress", "completed", "failed", "cancelled"] as const;

/** pending: sent to Runpod, not yet seen running. completed, failed and cancelled are final. */
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const UNFINISHED_STATUSES = ["pending", "in_queue", "in_progress"] as const satisfies readonly ImageStatus[];

export function isFinished(status: ImageStatus): boolean {
  return !(UNFINISHED_STATUSES as readonly ImageStatus[]).includes(status);
}

/** Where the page gets an Image's PNG; with `download`, as an attachment named after the prompt and seed. */
export function imageFileUrl(imageId: string, { download = false } = {}) {
  return `/api/images/${imageId}/file${download ? "?download=1" : ""}`;
}

/** How the page names each status. */
export const STATUS_LABELS: Record<ImageStatus, string> = {
  pending: "Sent",
  in_queue: "In the queue",
  in_progress: "In progress",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type ImageView = {
  id: string;
  status: ImageStatus;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  /** Why the Job failed or was cancelled, for the User. */
  error: string | null;
  /** ISO timestamps. */
  createdAt: string;
  finishedAt: string | null;
  /** Seconds from created until finished (or until now, while unfinished). */
  elapsedSeconds: number;
};
