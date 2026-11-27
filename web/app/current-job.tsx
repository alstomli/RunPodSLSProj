"use client";

import { STATUS_LABELS, type ImageView } from "@/lib/image-view";

/** The Job the User just started: its status while it runs, then the Image and its seed. */
export function CurrentJob({ job }: { job: ImageView }) {
  return (
    <section aria-label="Current Job" style={{ display: "grid", gap: 8 }}>
      <p role="status">
        <strong>{STATUS_LABELS[job.status]}</strong>
        {job.error && <span className="error"> — {job.error}</span>}
      </p>
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
        </figure>
      )}
    </section>
  );
}
