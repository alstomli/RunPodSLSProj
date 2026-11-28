"use client";

import { useEffect, useState } from "react";
import { isFinished, STATUS_LABELS, type ImageView } from "@/lib/image-view";
import { callApi } from "./call-api";
import { DownloadLink } from "./download-link";
import { ImageFile } from "./image-file";

const COLD_START_HINT_SECONDS = 20;

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
          <ImageFile
            image={job}
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

function formatElapsed(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function CancelButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setState("sending");
    setError(null);
    const result = await callApi(`/api/jobs/${jobId}/cancel`, {
      method: "POST",
      error: "Couldn't cancel the Job. Try again.",
    });
    if (result.ok) {
      setState("sent");
      return;
    }
    setError(result.error);
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
