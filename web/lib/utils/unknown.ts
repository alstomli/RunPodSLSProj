export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.some((candidate) => candidate === value);
}

export function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

export function trustedJson<T>(value: unknown): T {
  return value as T;
}
