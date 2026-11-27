/**
 * A fake Runpod Endpoint: a small local HTTP server, copied from the FakeRunpod in
 * test_generate.py. Point RUNPOD_API_BASE at `url`.
 *
 * - POST /run           answers the `run` reply (default: a new Job id, IN_QUEUE); a list plays in order, the last one repeats
 * - GET  /status/<job>  plays the `statuses` replies in order; the last one repeats
 * - POST /cancel/<job>  answers the `cancel` reply (default: CANCELLED)
 * - anything else       404
 *
 * A reply is `{ status, body }` (HTTP status and JSON body) or "drop" (the connection is
 * closed without an answer). Every request is recorded in `requests`.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type Reply = { status: number; body?: unknown } | "drop";

export type Script = { run?: Reply | Reply[]; cancel?: Reply; statuses?: Reply[] };

export type RecordedRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
};

/** A 200 /status reply with the given Runpod Job status, e.g. status("COMPLETED", { output }). */
export function status(name: string, extra: Record<string, unknown> = {}): Reply {
  return { status: 200, body: { status: name, ...extra } };
}

let jobCounter = 0;

type Current = { run: Reply[]; cancel: Reply; statuses: Reply[] };

/** The next reply of a list: plays in order, the last one repeats. */
function next(replies: Reply[]): Reply {
  return replies.length > 1 ? replies.shift()! : replies[0];
}

export class FakeRunpod {
  readonly requests: RecordedRequest[] = [];
  private current: Current = FakeRunpod.defaults();

  private constructor(
    private readonly server: http.Server,
    /** Base URL to use as RUNPOD_API_BASE. */
    readonly url: string,
  ) {}

  /** Starts the fake. In app tests pass `inject("runpodPort")`, the port the app server calls. */
  static async start(port = 0): Promise<FakeRunpod> {
    const holder: { fake?: FakeRunpod } = {};
    const server = http.createServer((req, res) => holder.fake!.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    const { port: actual } = server.address() as AddressInfo;
    holder.fake = new FakeRunpod(server, `http://127.0.0.1:${actual}`);
    return holder.fake;
  }

  private static defaults(): Current {
    return { run: [{ status: 200, body: { status: "IN_QUEUE" } }], cancel: { status: 200, body: { status: "CANCELLED" } }, statuses: [status("IN_QUEUE")] };
  }

  /** Replaces the scripted replies (unset ones get the defaults) and forgets earlier requests. */
  script(script: Script) {
    const defaults = FakeRunpod.defaults();
    this.current = {
      run: script.run === undefined ? defaults.run : Array.isArray(script.run) ? [...script.run] : [script.run],
      cancel: script.cancel ?? defaults.cancel,
      statuses: [...(script.statuses?.length ? script.statuses : defaults.statuses)],
    };
    this.requests.length = 0;
  }

  /** True when any /cancel request arrived since the last script(). */
  get cancelled() {
    return this.requests.some((r) => r.path.startsWith("/cancel/"));
  }

  close(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    let body: unknown = text === "" ? undefined : text;
    try {
      if (text) body = JSON.parse(text);
    } catch {
      // keep the raw text
    }
    const path = new URL(req.url ?? "/", this.url).pathname;
    this.requests.push({ method: req.method ?? "", path, authorization: req.headers.authorization, body });

    let reply: Reply = { status: 404, body: { error: "not found" } };
    let jobId: string | undefined;
    let match: RegExpMatchArray | null;
    if (req.method === "POST" && path === "/run") {
      reply = next(this.current.run);
      jobId = `job-${++jobCounter}-${Math.random().toString(36).slice(2, 8)}`;
    } else if (req.method === "GET" && (match = path.match(/^\/status\/([^/]+)$/))) {
      reply = next(this.current.statuses);
      jobId = decodeURIComponent(match[1]);
    } else if (req.method === "POST" && (match = path.match(/^\/cancel\/([^/]+)$/))) {
      reply = this.current.cancel;
      jobId = decodeURIComponent(match[1]);
    }

    if (reply === "drop") {
      req.socket.destroy();
      return;
    }
    let replyBody = reply.body;
    // Like Runpod, 2xx Job replies carry the Job id.
    if (jobId && reply.status < 300 && replyBody && typeof replyBody === "object" && !("id" in replyBody)) {
      replyBody = { id: jobId, ...replyBody };
    }
    res.writeHead(reply.status, { "Content-Type": "application/json" });
    res.end(replyBody === undefined ? "" : JSON.stringify(replyBody));
  }
}
