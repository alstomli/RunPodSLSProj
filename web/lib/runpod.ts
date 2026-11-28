import "server-only";
import { config as appConfig, type Config } from "./config";
import type { Settings } from "./settings";
import { errorMessage, field, isOneOf } from "./utils/unknown";

export const RUNPOD_STATUSES = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export type RunpodStatus = (typeof RUNPOD_STATUSES)[number];

export type RunpodJob = {
  id: string;
  status: RunpodStatus;
  output?: unknown;
  error?: unknown;
};

export type JobInput = Required<Settings>;

export class RunpodError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RunpodError";
  }
}

export type Runpod = ReturnType<typeof runpodClient>;

export const RETRY_DELAYS_MS = [250, 500, 1000];

function retryable(status: number) {
  return status === 429 || status >= 500;
}

export function runpodClient(
  config: Pick<Config, "runpodApiBase" | "runpodApiKey"> = appConfig(),
  retryDelaysMs: readonly number[] = RETRY_DELAYS_MS,
) {
  const { runpodApiBase: base, runpodApiKey: key } = config;

  async function call(method: "GET" | "POST", path: string, body?: unknown, safeToRepeat = true): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callOnce(method, path, body);
      } catch (error) {
        const status = error instanceof RunpodError ? error.status : undefined;
        const again =
          status !== undefined &&
          (safeToRepeat ? retryable(status) : status === 429) &&
          attempt < retryDelaysMs.length;
        if (!again) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
    }
  }

  async function callOnce(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch (error) {
      throw new RunpodError(`Runpod couldn't be reached: ${errorMessage(error)}`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new RunpodError(`Runpod answered ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`, response.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new RunpodError(`Runpod sent a reply that isn't JSON: ${text.slice(0, 300)}`, response.status);
    }
  }

  return {
    async submit(input: JobInput): Promise<string> {
      const id = field(await call("POST", "/run", { input }, false), "id");
      if (typeof id !== "string" || !id) throw new RunpodError("Runpod accepted the Job but sent no Job id");
      return id;
    },

    async status(jobId: string): Promise<RunpodJob> {
      const reply = await call("GET", `/status/${encodeURIComponent(jobId)}`);
      const status = field(reply, "status");
      if (!isOneOf(RUNPOD_STATUSES, status)) {
        throw new RunpodError(`Runpod sent an unknown Job status: ${JSON.stringify(status)}`);
      }
      const id = field(reply, "id");
      return { id: typeof id === "string" ? id : jobId, status, output: field(reply, "output"), error: field(reply, "error") };
    },

    async cancel(jobId: string): Promise<void> {
      await call("POST", `/cancel/${encodeURIComponent(jobId)}`);
    },
  };
}
