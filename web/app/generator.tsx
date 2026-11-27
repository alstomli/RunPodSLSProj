"use client";

import { useEffect, useState } from "react";
import { isFinished, type ImageView } from "@/lib/image-view";
import { callApi } from "./call-api";
import { CurrentJob } from "./current-job";
import { notifyGalleryChanged } from "./gallery";
import { GenerateForm } from "./generate-form";

/** How often the page asks for the current Job's status while it is unfinished. */
const POLL_MS = 2000;

/**
 * The form and the current Job. Polls the Job status route until the Job is finished.
 * On load it brings back the User's newest unfinished Job (after a reload or in a new tab), and
 * Generate stays disabled until it knows whether there is one.
 */
export function Generator() {
  const [job, setJob] = useState<ImageView | null>(null);
  const [restored, setRestored] = useState(false);
  const running = job !== null && !isFinished(job.status);

  useEffect(() => {
    callApi<{ job: ImageView | null }>("/api/jobs/current", { error: "" }).then((result) => {
      // A Job started meanwhile wins. If the check fails, the form simply opens.
      const restoredJob = result.ok ? result.body.job : null;
      if (restoredJob) setJob((current) => current ?? restoredJob);
      setRestored(true);
    });
  }, []);

  useEffect(() => {
    if (!job || isFinished(job.status)) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      const result = await callApi<ImageView>(`/api/jobs/${job.id}`, { error: "" });
      // On an error (or offline for a moment), poll again.
      if (!stopped) setJob(result.ok ? result.body : { ...job });
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
      <GenerateForm disabled={running || !restored} onCreated={setJob} />
      {job && <CurrentJob key={job.id} job={job} />}
    </div>
  );
}
