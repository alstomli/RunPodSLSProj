import "server-only";
import { config, type Config } from "./config";

/**
 * The Runpod Endpoint, as /run, /status and /cancel (the same calls the CLI client makes).
 * The API key stays here, on the server.
 */

/** A Job as Runpod reports it from /status. `status` is IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED, CANCELLED or TIMED_OUT. */
export type RunpodJob = {
  id: string;
  status: string;
  /** The Worker's return value: { image_base64, prompt, width, ... } or { error }. */
  output?: unknown;
  /** Runpod's or the Worker's reason when the Job failed. */
  error?: unknown;
};

/** What the Worker takes as the Job's input (handler.py). */
export type JobInput = {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
};

/** Runpod answered with an error or couldn't be reached. `status` is the HTTP status, if any. */
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

export function runpodClient(settings: Pick<Config, "runpodApiBase" | "runpodApiKey"> = config()) {
  const { runpodApiBase: base, runpodApiKey: key } = settings;

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<RunpodJob> {
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
      return JSON.parse(text) as RunpodJob;
    } catch {
      throw new RunpodError(`Runpod sent a reply that isn't JSON: ${text.slice(0, 300)}`, response.status);
    }
  }

  return {
    /** POST /run. Returns the Runpod Job id. */
    async submit(input: JobInput): Promise<string> {
      const job = await call("POST", "/run", { input });
      if (typeof job.id !== "string" || !job.id) throw new RunpodError("Runpod accepted the Job but sent no Job id");
      return job.id;
    },

    /** GET /status/<id>. */
    status(jobId: string): Promise<RunpodJob> {
      return call("GET", `/status/${encodeURIComponent(jobId)}`);
    },

    /** POST /cancel/<id>. */
    async cancel(jobId: string): Promise<void> {
      await call("POST", `/cancel/${encodeURIComponent(jobId)}`);
    },
  };
}
