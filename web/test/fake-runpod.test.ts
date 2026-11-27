import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeRunpod, status } from "./fake-runpod";

describe("fake Runpod", () => {
  let runpod: FakeRunpod;

  beforeEach(async () => {
    runpod = await FakeRunpod.start();
  });
  afterEach(() => runpod.close());

  const call = (path: string, init?: RequestInit) =>
    fetch(`${runpod.url}${path}`, {
      ...init,
      headers: { Authorization: "Bearer test-key", ...init?.headers },
    });

  it("answers /run with a new Job id and records the request", async () => {
    const first = await call("/run", { method: "POST", body: JSON.stringify({ input: { prompt: "a cat" } }) });
    const second = await call("/run", { method: "POST", body: "{}" });

    expect(first.status).toBe(200);
    const { id, status: state } = await first.json();
    expect(state).toBe("IN_QUEUE");
    expect((await second.json()).id).not.toBe(id);
    expect(runpod.requests[0]).toEqual({
      method: "POST",
      path: "/run",
      authorization: "Bearer test-key",
      body: { input: { prompt: "a cat" } },
    });
  });

  it("plays /status replies in order and repeats the last one", async () => {
    runpod.script({ statuses: [status("IN_QUEUE"), status("IN_PROGRESS"), status("COMPLETED", { output: { seed: 7 } })] });

    const seen = [];
    for (let i = 0; i < 4; i++) {
      const reply = await (await call("/status/job-9")).json();
      seen.push(reply.status);
      expect(reply.id).toBe("job-9");
    }

    expect(seen).toEqual(["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "COMPLETED"]);
    expect(runpod.requests.map((r) => r.path)).toEqual(Array(4).fill("/status/job-9"));
  });

  it("answers with scripted error statuses", async () => {
    runpod.script({
      run: { status: 401, body: { error: "unauthorized" } },
      statuses: [{ status: 429 }, { status: 503 }, { status: 404 }],
    });

    expect((await call("/run", { method: "POST", body: "{}" })).status).toBe(401);
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await call("/status/job-1")).status);
    expect(codes).toEqual([429, 503, 404]);
  });

  it("can drop the connection instead of answering", async () => {
    runpod.script({ statuses: ["drop", status("COMPLETED")] });

    await expect(call("/status/job-1")).rejects.toThrow();
    expect((await (await call("/status/job-1")).json()).status).toBe("COMPLETED");
  });

  it("answers /cancel and remembers that it was asked", async () => {
    expect(runpod.cancelled).toBe(false);

    const reply = await call("/cancel/job-3", { method: "POST" });

    expect(await reply.json()).toEqual({ id: "job-3", status: "CANCELLED" });
    expect(runpod.cancelled).toBe(true);
  });

  it("a new script forgets earlier requests", async () => {
    await call("/cancel/job-3", { method: "POST" });
    runpod.script({});
    expect(runpod.requests).toEqual([]);
    expect(runpod.cancelled).toBe(false);
  });

  it("answers 404 to anything else", async () => {
    expect((await call("/purge-queue", { method: "POST" })).status).toBe(404);
  });
});
