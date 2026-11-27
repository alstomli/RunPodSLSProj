
export const IMAGE_STATUSES = ["pending", "in_queue", "in_progress", "completed", "failed", "cancelled"] as const;

export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const UNFINISHED_STATUSES = ["pending", "in_queue", "in_progress"] as const satisfies readonly ImageStatus[];

export function isFinished(status: ImageStatus): boolean {
  return !(UNFINISHED_STATUSES as readonly ImageStatus[]).includes(status);
}

export function imageFileUrl(imageId: string, { download = false } = {}) {
  return `/api/images/${imageId}/file${download ? "?download=1" : ""}`;
}

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
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  elapsedSeconds: number;
};
