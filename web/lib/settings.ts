import { field } from "./utils/unknown";

export const DEFAULTS = { width: 1024, height: 1024, steps: 28, guidance: 3.5 } as const;

export const MAX_SEED = 2 ** 32 - 1;

export const LIMITS = {
  size: { min: 256, max: 1536 },
  steps: { min: 1, max: 50 },
  guidance: { min: 0, max: 20 },
  seed: { min: 0, max: MAX_SEED },
} as const;

export const SIZE_STEP = 16;

export const SIZE_PRESETS = [
  { name: "Square", width: 1024, height: 1024 },
  { name: "Portrait", width: 832, height: 1216 },
  { name: "Landscape", width: 1216, height: 832 },
] as const;

export type Settings = {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed?: number;
};

export type SettingsField = keyof Settings;

export type SettingsErrors = Partial<Record<SettingsField, string>>;

export type Validation = { ok: true; settings: Settings } | { ok: false; errors: SettingsErrors };

const MISSING = Symbol("missing");

function readNumber(value: unknown): number | typeof MISSING {
  if (value === undefined || value === null) return MISSING;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return MISSING;
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }
  return NaN;
}

const inRange = (value: number, { min, max }: { min: number; max: number }) => value >= min && value <= max;

export function validateSettings(input: unknown): Validation {
  const valueOf = (key: SettingsField) => field(input, key);
  const errors: SettingsErrors = {};

  const promptValue = valueOf("prompt");
  const prompt = typeof promptValue === "string" ? promptValue.trim() : "";
  if (!prompt) errors.prompt = "Type a prompt.";

  const size = (name: "width" | "height", label: string) => {
    const value = readNumber(valueOf(name));
    if (value === MISSING) return DEFAULTS[name];
    const { min, max } = LIMITS.size;
    if (!Number.isInteger(value) || !inRange(value, LIMITS.size)) {
      errors[name] = `${label} must be a whole number from ${min} to ${max}.`;
    } else if (value % SIZE_STEP !== 0) {
      errors[name] = `${label} must be a multiple of ${SIZE_STEP}.`;
    }
    return value;
  };
  const width = size("width", "Width");
  const height = size("height", "Height");

  const steps = readNumber(valueOf("steps"));
  if (steps !== MISSING && (!Number.isInteger(steps) || !inRange(steps, LIMITS.steps))) {
    errors.steps = `Steps must be a whole number from ${LIMITS.steps.min} to ${LIMITS.steps.max}.`;
  }

  const guidance = readNumber(valueOf("guidance"));
  if (guidance !== MISSING && !inRange(guidance, LIMITS.guidance)) {
    errors.guidance = `Guidance must be a number from ${LIMITS.guidance.min} to ${LIMITS.guidance.max}.`;
  }

  const seed = readNumber(valueOf("seed"));
  if (seed !== MISSING && (!Number.isInteger(seed) || !inRange(seed, LIMITS.seed))) {
    errors.seed = `Seed must be a whole number from ${LIMITS.seed.min} to ${LIMITS.seed.max}, or empty for a random one.`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const settings: Settings = {
    prompt,
    width,
    height,
    steps: steps === MISSING ? DEFAULTS.steps : steps,
    guidance: guidance === MISSING ? DEFAULTS.guidance : guidance,
  };
  if (seed !== MISSING) settings.seed = seed;
  return { ok: true, settings };
}
