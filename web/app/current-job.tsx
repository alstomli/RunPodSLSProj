"use client";

import { useEffect, useState } from "react";
import { isFinished, STATUS_LABELS, type ImageView } from "@/lib/image-view";
import { DownloadLink } from "./download-link";

/** After this long without a Worker picking the Job up, the page says it's probably a Cold start. */
const COLD_START_HINT_SECONDS = 20;

/**
 * The Job the User just started: its status, elapsed time and Cancel while it runs (with a Cold
 * start hint after a long queue wait), then the Image and its seed, or why it failed.
 * Closing the tab does not cancel the Job; only the Cancel button does.
 */
export function CurrentJob({ job }: { job: ImageView }) {
  const finished = isFinished(job.status);
  const elapsed = useElapsedSeconds(job);
  const waiting = job.status === "pending" || job.status === "in_queue";

  return (
    <section aria-label="Current Job" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <p role="status">
          <strong>{STATUS_LABELS[job.status]}</strong>
          <span className="muted">
            {" · "}
            {finished ? "took" : "elapsed"} <span data-testid="elapsed">{formatElapsed(elapsed)}</span>
          </span>
        </p>
        {!finished && <CancelButton jobId={job.id} />}
      </div>
      {waiting && elapsed >= COLD_START_HINT_SECONDS && (
        <p className="muted" data-testid="cold-start-hint">
          Still waiting in the queue. A long wait here is usually a Cold start: Runpod is starting a
          Worker, which can take a few minutes.
        </p>
      )}
      {job.error && (
        <p className={job.status === "failed" ? "error" : "muted"} data-testid="job-error">
          {job.error}
        </p>
      )}
      {job.status === "completed" && (
        <figure style={{ display: "grid", gap: 4 }}>
          {/* The PNG comes from our own route, which checks the User; next/image would recompress it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${job.id}/file`}
            alt={job.prompt}
            width={job.width}
            height={job.height}
            style={{ maxWidth: "100%", height: "auto", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <figcaption>
            Seed <span data-testid="seed">{job.seed}</span>
          </figcaption>
          <div>
            <DownloadLink image={job} />
          </div>
        </figure>
      )}
    </section>
  );
}

/**
 * Seconds since the Job was created. The server's count (from the created time) is the base, so
 * the browser's clock doesn't matter; while the Job runs it counts up every second between polls.
 */
function useElapsedSeconds(job: ImageView) {
  const [tick, setTick] = useState<{ job: ImageView; seconds: number } | null>(null);

  useEffect(() => {
    if (isFinished(job.status)) return;
    const received = Date.now();
    const timer = setInterval(() => {
      setTick({ job, seconds: Math.floor((Date.now() - received) / 1000) });
    }, 1000);
    return () => clearInterval(timer);
  }, [job]);

  const since = tick?.job === job ? tick.seconds : 0;
  return job.elapsedSeconds + (isFinished(job.status) ? 0 : since);
}

/** 42 → "0:42", 3723 → "1:02:03". */
function formatElapsed(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * Asks the server to cancel the Job on Runpod. The status changes to Cancelled when the follower
 * sees Runpod report it, so until then the button stays as "Cancelling…".
 */
function CancelButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setState("sending");
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (response.ok) {
        setState("sent");
        return;
      }
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't cancel the Job. Try again.");
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    }
    setState("idle");
  }

  return (
    <>
      <button
        type="button"
        onClick={cancel}
        disabled={state !== "idle"}
        style={{ background: "transparent", color: "var(--foreground)", borderColor: "var(--border)" }}
      >
        {state === "idle" ? "Cancel" : "Cancelling…"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
