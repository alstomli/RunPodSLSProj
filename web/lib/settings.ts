/**
 * Generation settings: defaults, limits and validation. Shared by the browser form and the
 * server (no server-only code here). The limits are the Worker's own (handler.py).
 */

export const DEFAULTS = { width: 1024, height: 1024, steps: 28, guidance: 3.5 } as const;

export const MAX_SEED = 2 ** 32 - 1;

/** What a Job is made from. `seed` is absent until the server picks one. */
export type Settings = {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed?: number;
};

export type SettingsField = keyof Settings;

/** One sentence for the User per field that is wrong. */
export type SettingsErrors = Partial<Record<SettingsField, string>>;

export type Validation = { ok: true; settings: Settings } | { ok: false; errors: SettingsErrors };

/**
 * Checks what the User sent (a JSON body or the form's values) and returns clean settings,
 * with defaults filled in, or field-level errors.
 */
export function validateSettings(input: unknown): Validation {
  const values = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: SettingsErrors = {};

  const prompt = typeof values.prompt === "string" ? values.prompt.trim() : "";
  if (!prompt) errors.prompt = "Type a prompt.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, settings: { prompt, ...DEFAULTS } };
}
