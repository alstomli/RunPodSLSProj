"use client";

import { useEffect, useState } from "react";
import { isFinished, type ImageView } from "@/lib/image-view";
import { CurrentJob } from "./current-job";
import { notifyGalleryChanged } from "./gallery";
import { GenerateForm } from "./generate-form";

/** How often the page asks for the current Job's status while it is unfinished. */
const POLL_MS = 2000;

/** The form and the current Job. Polls the Job status route until the Job is finished. */
export function Generator() {
  const [job, setJob] = useState<ImageView | null>(null);
  const running = job !== null && !isFinished(job.status);

  useEffect(() => {
    if (!job || isFinished(job.status)) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!stopped && response.ok) setJob((await response.json()) as ImageView);
        else if (!stopped) setJob({ ...job }); // poll again
      } catch {
        if (!stopped) setJob({ ...job }); // offline for a moment: poll again
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job]);

  // A new Job, or a status change, shows in the Gallery too.
  const jobKey = job && `${job.id}:${job.status}`;
  useEffect(() => {
    if (jobKey) notifyGalleryChanged();
  }, [jobKey]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <GenerateForm disabled={running} onCreated={setJob} />
      {job && <CurrentJob job={job} />}
    </div>
  );
}
