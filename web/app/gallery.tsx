"use client";

import { useCallback, useEffect, useState } from "react";
import { isFinished, STATUS_LABELS, type ImageView } from "@/lib/image-view";
import { DownloadLink } from "./download-link";

/** How often the Gallery reloads while it shows an unfinished Job. */
const POLL_MS = 3000;

/** Fired on `window` when the page started a Job or saw one change, so the Gallery reloads. */
const GALLERY_CHANGED = "gallery-changed";

export function notifyGalleryChanged() {
  window.dispatchEvent(new Event(GALLERY_CHANGED));
}

async function fetchGallery(): Promise<{ images: ImageView[] } | { error: string }> {
  try {
    const response = await fetch("/api/images", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) return body as { images: ImageView[] };
    return { error: body?.error ?? "Couldn't load your Gallery." };
  } catch {
    return { error: "Can't reach the server to load your Gallery." };
  }
}

/** The User's Images newest first, unfinished Jobs included, each with its settings. */
export function Gallery() {
  const [images, setImages] = useState<ImageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchGallery().then((result) => {
      if ("images" in result) {
        setImages(result.images);
        setError(null);
      } else setError(result.error);
    });
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(GALLERY_CHANGED, load);
    return () => window.removeEventListener(GALLERY_CHANGED, load);
  }, [load]);

  const waiting = images?.some((image) => !isFinished(image.status)) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  return (
    <section aria-labelledby="gallery-heading" style={{ display: "grid", gap: 12 }}>
      <h2 id="gallery-heading">Gallery</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {images === null && !error && <p className="muted">Loading…</p>}
      {images?.length === 0 && <p className="muted">No Images yet. They appear here as soon as you press Generate.</p>}
      {images && images.length > 0 && (
        <ul className="gallery">
          {images.map((image) => (
            <GalleryItem key={image.id} image={image} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GalleryItem({ image }: { image: ImageView }) {
  const done = image.status === "completed";
  return (
    <li className="gallery-item" data-image-id={image.id}>
      {done ? (
        // The PNG comes from our own route, which checks the User; next/image would recompress it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/images/${image.id}/file`}
          alt={image.prompt}
          width={image.width}
          height={image.height}
          loading="lazy"
        />
      ) : (
        <div className="gallery-placeholder" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
          <span className={image.status === "failed" ? "error" : undefined}>{STATUS_LABELS[image.status]}</span>
        </div>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        <p className="gallery-prompt">{image.prompt}</p>
        <p className="muted">
          {image.width}×{image.height} · {image.steps} steps · guidance {image.guidance} · seed {image.seed}
        </p>
        <p className="muted">
          <time dateTime={image.createdAt}>{new Date(image.createdAt).toLocaleString()}</time>
          {!done && <> · {STATUS_LABELS[image.status]}</>}
        </p>
        {image.error && <p className="error">{image.error}</p>}
        {done && (
          <div>
            <DownloadLink image={image} />
          </div>
        )}
      </div>
    </li>
  );
}
