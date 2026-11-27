"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { ImageView } from "@/lib/image-view";
import {
  DEFAULTS,
  LIMITS,
  SIZE_PRESETS,
  SIZE_STEP,
  validateSettings,
  type SettingsErrors,
  type SettingsField,
} from "@/lib/settings";
import { callApi } from "./call-api";

type Values = Record<SettingsField, string>;

const INITIAL: Values = {
  prompt: "",
  width: String(DEFAULTS.width),
  height: String(DEFAULTS.height),
  steps: String(DEFAULTS.steps),
  guidance: String(DEFAULTS.guidance),
  seed: "",
};

const ADVANCED_FIELDS: SettingsField[] = ["width", "height", "steps", "guidance", "seed"];

export function GenerateForm({ disabled, onCreated }: { disabled: boolean; onCreated: (job: ImageView) => void }) {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const set = (changes: Partial<Values>) => setValues((current) => ({ ...current, ...changes }));

  function showErrors(fieldErrors: SettingsErrors) {
    setErrors(fieldErrors);
    // An error inside a collapsed section would be invisible.
    if (ADVANCED_FIELDS.some((field) => fieldErrors[field])) setAdvancedOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validation = validateSettings(values);
    if (!validation.ok) {
      showErrors(validation.errors);
      return;
    }
    setErrors({});
    setSending(true);
    const result = await callApi<ImageView>("/api/jobs", {
      method: "POST",
      json: validation.settings,
      error: "Couldn't start the Job. Try again.",
    });
    if (result.ok) onCreated(result.body);
    else {
      showErrors(result.body?.fields ?? {});
      setError(result.error);
    }
    setSending(false);
  }

  const field = (name: SettingsField) => ({
    name,
    value: values[name],
    onChange: (event: { target: { value: string } }) => set({ [name]: event.target.value }),
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }} noValidate>
      <Field name="prompt" label="Prompt" error={errors.prompt}>
        <textarea rows={3} {...field("prompt")} />
      </Field>

      <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
        <summary style={{ cursor: "pointer" }}>Advanced</summary>
        <div style={{ display: "grid", gap: 12, paddingTop: 12 }}>
          <div role="group" aria-label="Size presets" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SIZE_PRESETS.map((preset) => {
              const active = values.width === String(preset.width) && values.height === String(preset.height);
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={active ? undefined : "secondary"}
                  aria-pressed={active}
                  onClick={() => set({ width: String(preset.width), height: String(preset.height) })}
                >
                  {preset.name} {preset.width}×{preset.height}
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Field name="width" label="Width" error={errors.width}>
              <input type="number" inputMode="numeric" min={LIMITS.size.min} max={LIMITS.size.max} step={SIZE_STEP} {...field("width")} />
            </Field>
            <Field name="height" label="Height" error={errors.height}>
              <input type="number" inputMode="numeric" min={LIMITS.size.min} max={LIMITS.size.max} step={SIZE_STEP} {...field("height")} />
            </Field>
            <Field name="steps" label="Steps" error={errors.steps}>
              <input type="number" inputMode="numeric" min={LIMITS.steps.min} max={LIMITS.steps.max} step={1} {...field("steps")} />
            </Field>
            <Field name="guidance" label="Guidance" error={errors.guidance}>
              <input type="number" inputMode="decimal" min={LIMITS.guidance.min} max={LIMITS.guidance.max} step={0.1} {...field("guidance")} />
            </Field>
            <Field name="seed" label="Seed" error={errors.seed}>
              <input type="number" inputMode="numeric" min={LIMITS.seed.min} max={LIMITS.seed.max} step={1} placeholder="Random" {...field("seed")} />
            </Field>
          </div>
          <p className="hint">
            Width and height: {LIMITS.size.min}–{LIMITS.size.max}, multiples of {SIZE_STEP}. Steps: {LIMITS.steps.min}–
            {LIMITS.steps.max}. Guidance: {LIMITS.guidance.min}–{LIMITS.guidance.max}. Leave the seed empty for a random one.
          </p>
        </div>
      </details>

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

function Field({ name, label, error, children }: { name: SettingsField; label: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
      <label style={{ display: "grid", gap: 4 }}>
        {label}
        {children}
      </label>
      {error && (
        <p id={`${name}-error`} className="error">
          {error}
        </p>
      )}
    </div>
  );
}
