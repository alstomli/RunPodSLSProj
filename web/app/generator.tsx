"use client";

import { useEffect, useState } from "react";
import { isFinished, type ImageView } from "@/lib/image-view";
import { callApi } from "./call-api";
import { CurrentJob } from "./current-job";
import { notifyGalleryChanged } from "./gallery";
import { GenerateForm } from "./generate-form";

const POLL_MS = 2000;

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
      if (!stopped) setJob(result.ok ? result.body : { ...job });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job]);

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
