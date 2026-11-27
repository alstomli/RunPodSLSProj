"use client";

import { useState, type FormEvent } from "react";
import type { ImageView } from "@/lib/image-view";
import { validateSettings, type SettingsErrors } from "@/lib/settings";

/** The prompt box and Generate. Checks the settings before anything is sent. */
export function GenerateForm({ disabled, onCreated }: { disabled: boolean; onCreated: (job: ImageView) => void }) {
  const [prompt, setPrompt] = useState("");
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validation = validateSettings({ prompt });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.settings),
      });
      const body = await response.json().catch(() => null);
      if (response.ok) onCreated(body as ImageView);
      else {
        setErrors(body?.fields ?? {});
        setError(body?.error ?? "Couldn't start the Job. Try again.");
      }
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    }
    setSending(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
      <label style={{ display: "grid", gap: 4 }}>
        Prompt
        <textarea
          name="prompt"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          aria-invalid={Boolean(errors.prompt)}
          aria-describedby={errors.prompt ? "prompt-error" : undefined}
        />
      </label>
      {errors.prompt && (
        <p id="prompt-error" className="error">
          {errors.prompt}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={disabled || sending}>
          {sending ? "Sending…" : "Generate"}
        </button>
      </div>
    </form>
  );
}
