import "server-only";
import { config as appConfig, type Config } from "./config";
import type { Settings } from "./settings";

export const RUNPOD_STATUSES = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export type RunpodStatus = (typeof RUNPOD_STATUSES)[number];

export type RunpodJob = {
  id: string;
  status: RunpodStatus;
  output?: unknown;
  error?: unknown;
};

export type JobInput = Required<Settings>;

type RunpodReply = { id?: unknown; status?: unknown; output?: unknown; error?: unknown };

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

/** Short: the follower polls again within seconds anyway, and the cancel route must answer at once. */
export const RETRY_DELAYS_MS = [250, 500, 1000];

function retryable(status: number) {
  return status === 429 || status >= 500;
}

export function runpodClient(
  config: Pick<Config, "runpodApiBase" | "runpodApiKey"> = appConfig(),
  retryDelaysMs: readonly number[] = RETRY_DELAYS_MS,
) {
  const { runpodApiBase: base, runpodApiKey: key } = config;

  /**
   * One Runpod call, retrying 429 and 5xx replies. `safeToRepeat` is false for /run: a 5xx there
   * may have queued the Job already, so only a 429 (refused outright) is retried.
   */
  async function call(method: "GET" | "POST", path: string, body?: unknown, safeToRepeat = true): Promise<RunpodReply> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callOnce(method, path, body);
      } catch (error) {
        const status = (error as RunpodError).status;
        const again =
          error instanceof RunpodError &&
          status !== undefined &&
          (safeToRepeat ? retryable(status) : status === 429) &&
          attempt < retryDelaysMs.length;
        if (!again) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
    }
  }

  async function callOnce(method: "GET" | "POST", path: string, body?: unknown): Promise<RunpodReply> {
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
      throw new RunpodError(`Runpod couldn't be reached: ${(error as Error).message}`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new RunpodError(`Runpod answered ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`, response.status);
    }
    try {
      return JSON.parse(text) as RunpodReply;
    } catch {
      throw new RunpodError(`Runpod sent a reply that isn't JSON: ${text.slice(0, 300)}`, response.status);
    }
  }

  return {
    async submit(input: JobInput): Promise<string> {
      const job = await call("POST", "/run", { input }, false);
      if (typeof job.id !== "string" || !job.id) throw new RunpodError("Runpod accepted the Job but sent no Job id");
      return job.id;
    },

    async status(jobId: string): Promise<RunpodJob> {
      const job = await call("GET", `/status/${encodeURIComponent(jobId)}`);
      if (!(RUNPOD_STATUSES as readonly unknown[]).includes(job.status)) {
        throw new RunpodError(`Runpod sent an unknown Job status: ${JSON.stringify(job.status)}`);
      }
      return { ...job, id: typeof job.id === "string" ? job.id : jobId, status: job.status as RunpodStatus };
    },

    async cancel(jobId: string): Promise<void> {
      await call("POST", `/cancel/${encodeURIComponent(jobId)}`);
    },
  };
}
