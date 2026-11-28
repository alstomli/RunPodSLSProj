"use client";

import { useCallback, useEffect, useState } from "react";
import { isFinished, STATUS_LABELS, type ImageView } from "@/lib/image-view";
import { callApi } from "./call-api";
import { DownloadLink } from "./download-link";
import { ImageFile } from "./image-file";

const POLL_MS = 3000;

const GALLERY_CHANGED = "gallery-changed";

export function notifyGalleryChanged() {
  window.dispatchEvent(new Event(GALLERY_CHANGED));
}

export function Gallery() {
  const [images, setImages] = useState<ImageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    callApi<{ images: ImageView[] }>("/api/images", {
      error: "Couldn't load your Gallery.",
      offlineError: "Can't reach the server to load your Gallery.",
    }).then((result) => {
      if (result.ok) {
        setImages(result.body.images);
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
        <ImageFile image={image} loading="lazy" />
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
