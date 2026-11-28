import http from "node:http";
import type { AddressInfo } from "node:net";

export type Reply = { status: number; body?: unknown; delayMs?: number } | "drop";

export type Script = { run?: Reply | Reply[]; cancel?: Reply; statuses?: Reply[] };

export type RecordedRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
};

export function status(name: string, extra: Record<string, unknown> = {}): Reply {
  return { status: 200, body: { status: name, ...extra } };
}

let jobCounter = 0;

function jsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type Current = { run: Reply[]; cancel: Reply; statuses: Reply[] };

function next(replies: Reply[]): Reply {
  return replies.length > 1 ? replies.shift()! : replies[0];
}

export class FakeRunpod {
  readonly requests: RecordedRequest[] = [];
  private current: Current = FakeRunpod.defaults();

  private constructor(
    private readonly server: http.Server,
    readonly url: string,
  ) {}

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

  script(script: Script) {
    const defaults = FakeRunpod.defaults();
    this.current = {
      run: script.run === undefined ? defaults.run : Array.isArray(script.run) ? [...script.run] : [script.run],
      cancel: script.cancel ?? defaults.cancel,
      statuses: [...(script.statuses?.length ? script.statuses : defaults.statuses)],
    };
    this.requests.length = 0;
  }

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
    const body = text === "" ? undefined : jsonOrText(text);
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
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    let replyBody = reply.body;
    if (jobId && reply.status < 300 && replyBody && typeof replyBody === "object" && !("id" in replyBody)) {
      replyBody = { id: jobId, ...replyBody };
    }
    res.writeHead(reply.status, { "Content-Type": "application/json" });
    res.end(replyBody === undefined ? "" : JSON.stringify(replyBody));
  }
}
