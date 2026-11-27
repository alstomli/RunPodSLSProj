import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { processPendingJobs } from "@/lib/follower";
import { Browser, createUser } from "./app";
import { FakeRunpod, status, type Reply } from "./fake-runpod";

const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("lifecycle image ÿ\u0000\u0002")]);

function completed(seed: number): Reply {
  return status("COMPLETED", {
    output: { image_base64: PNG.toString("base64"), prompt: "x", width: 1024, height: 1024, steps: 28, guidance: 3.5, seed },
  });
}

let runpod: FakeRunpod;

beforeAll(async () => {
  runpod = await FakeRunpod.start(inject("runpodPort"));
});

afterAll(async () => {
  await runpod.close();
});

async function userWithJob(prompt = "a red fox in snow") {
  const user = await createUser();
  const browser = new Browser();
  await browser.signIn(user);
  runpod.script({});
  const response = await browser.post("/api/jobs", { prompt });
  expect(response.status).toBe(201);
  const job = await response.json();
  const step = () => processPendingJobs({ userId: user.id });
  const view = async () => (await browser.get(`/api/jobs/${job.id}`)).json();
  return { user, browser, job, step, view };
}

async function followerAfterRestart() {
  vi.resetModules();
  return import("@/lib/follower");
}

async function jobStuckBeforeRunpod() {
  const user = await createUser();
  const browser = new Browser();
  await browser.signIn(user);
  runpod.script({ run: { status: 200, body: { status: "IN_QUEUE" }, delayMs: 2000 } });
  const creating = browser.post("/api/jobs", { prompt: "a Job on its way" });
  await expect.poll(() => runpod.requests.length, { timeout: 10_000 }).toBe(1);
  const [stuck] = (await (await browser.get("/api/images")).json()).images;
  expect(stuck.status).toBe("pending");
  return { user, browser, creating, stuck };
}

describe("cancelling a Job", () => {
  it("sends /cancel to Runpod at once; the next follower run records cancelled", async () => {
    const { browser, job: created, step, view } = await userWithJob();
    runpod.script({ statuses: [status("CANCELLED")] });

    const response = await browser.post(`/api/jobs/${created.id}/cancel`);

    expect(response.status).toBe(202);
    const cancels = runpod.requests.filter((r) => r.path.startsWith("/cancel/"));
    expect(cancels).toHaveLength(1);
    expect(cancels[0]).toMatchObject({ method: "POST", authorization: "Bearer test-runpod-key" });
    expect(cancels[0].path).toMatch(/^\/cancel\/job-/);
    expect(runpod.requests.filter((r) => r.path.startsWith("/status/")), "only the follower asks for status").toHaveLength(0);

    await step();

    const job = await view();
    expect(job.status).toBe("cancelled");
    expect(job.finishedAt).toBeTruthy();
  });

  it("asks Runpod about the same Job the follower follows", async () => {
    const { browser, job: created, step } = await userWithJob();
    runpod.script({ statuses: [status("CANCELLED")] });

    await browser.post(`/api/jobs/${created.id}/cancel`);
    await step();

    const [cancel, poll] = runpod.requests;
    expect(cancel.path.replace("/cancel/", "")).toBe(poll.path.replace("/status/", ""));
  });

  it("another User's Job gets 404 and nothing reaches Runpod", async () => {
    const { job: created } = await userWithJob("my secret");
    const other = new Browser();
    await other.signIn(await createUser());
    runpod.script({});

    expect((await other.post(`/api/jobs/${created.id}/cancel`)).status).toBe(404);
    expect((await other.post("/api/jobs/00000000-0000-4000-8000-000000000000/cancel")).status).toBe(404);
    expect((await other.post("/api/jobs/not-an-id/cancel")).status).toBe(404);
    expect(runpod.cancelled).toBe(false);
  });

  it("a finished Job gets 409 and nothing reaches Runpod", async () => {
    const { browser, job: created, step } = await userWithJob();
    runpod.script({ statuses: [completed(created.seed)] });
    await step();
    runpod.script({});

    const response = await browser.post(`/api/jobs/${created.id}/cancel`);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBeTruthy();
    expect(runpod.cancelled).toBe(false);
  });

  it("still on its way to Runpod gets 409 saying so, and nothing reaches Runpod", async () => {
    const { browser, creating, stuck } = await jobStuckBeforeRunpod();

    const response = await browser.post(`/api/jobs/${stuck.id}/cancel`);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/not reached Runpod yet/i);
    expect(runpod.cancelled).toBe(false);
    await creating;
  });

  it("that Runpod refuses gets 502 and the Job carries on", async () => {
    const { browser, job: created, view } = await userWithJob();
    runpod.script({ cancel: { status: 400, body: { error: "no" } } });

    const response = await browser.post(`/api/jobs/${created.id}/cancel`);

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBeTruthy();
    expect((await view()).status).toBe("pending");
  });
});

describe("restarts and repeated runs", () => {
  it("a Job left unfinished before a restart is picked up by the fresh follower and saved", async () => {
    const { user, job: created, view, browser } = await userWithJob();
    runpod.script({ statuses: [status("IN_PROGRESS"), completed(created.seed)] });
    await processPendingJobs({ userId: user.id });
    expect((await view()).status).toBe("in_progress");

    const restarted = await followerAfterRestart();
    await restarted.processPendingJobs({ userId: user.id });

    expect((await view()).status).toBe("completed");
    const file = await browser.get(`/api/images/${created.id}/file`);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
  });

  it("two follower runs over the same completed Job leave one file and one completed row", async () => {
    const { user, job: created, view } = await userWithJob();
    runpod.script({ statuses: [completed(created.seed)] });

    const twoAppsFollowAtOnce = () => Promise.all([processPendingJobs({ userId: user.id }), processPendingJobs({ userId: user.id })]);
    await twoAppsFollowAtOnce();
    const first = await view();
    await processPendingJobs({ userId: user.id });

    const job = await view();
    expect(job.status).toBe("completed");
    expect(job.finishedAt).toBe(first.finishedAt);
    const env = inject("env");
    const own = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await own.auth.signInWithPassword({ email: user.email, password: user.password });
    const rows = await own.from("images").select("id, status");
    expect(rows.data).toEqual([{ id: created.id, status: "completed" }]);
    const files = await own.storage.from("images").list(user.id);
    expect(files.data?.map((f) => f.name)).toEqual([`${created.id}.png`]);
  });
});

describe("Runpod hiccups", () => {
  it("429 and 5xx replies are retried and the Job still completes", async () => {
    const { step, view, job: created } = await userWithJob();
    runpod.script({
      statuses: [
        { status: 429, body: { error: "too many requests" } },
        { status: 503, body: { error: "unavailable" } },
        { status: 500, body: { error: "oops" } },
        completed(created.seed),
      ],
    });

    await step();

    expect((await view()).status).toBe("completed");
    expect(runpod.requests.filter((r) => r.path.startsWith("/status/"))).toHaveLength(4);
  });

  it("a 429 on submit is retried and the Job is created", async () => {
    const user = await createUser();
    const browser = new Browser();
    await browser.signIn(user);
    runpod.script({ run: [{ status: 429, body: { error: "too many requests" } }, status("IN_QUEUE")] });

    const response = await browser.post("/api/jobs", { prompt: "a patient heron" });

    expect(response.status).toBe(201);
    expect(runpod.requests.filter((r) => r.path === "/run")).toHaveLength(2);
  });

  it("a 5xx on submit is not repeated, so the same Job is never queued twice", async () => {
    const user = await createUser();
    const browser = new Browser();
    await browser.signIn(user);
    runpod.script({ run: [{ status: 503, body: { error: "unavailable" } }, status("IN_QUEUE")] });

    const response = await browser.post("/api/jobs", { prompt: "a patient heron" });

    expect(response.status).toBe(502);
    expect(runpod.requests.filter((r) => r.path === "/run")).toHaveLength(1);
  });
});

describe("a Job that doesn't succeed", () => {
  it("that Runpod reports FAILED is recorded as failed with Runpod's reason", async () => {
    const { step, view } = await userWithJob();
    runpod.script({ statuses: [status("FAILED", { error: "CUDA out of memory" })] });

    await step();

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toContain("CUDA out of memory");
    expect(job.finishedAt).toBeTruthy();
  });

  it("that Runpod reports TIMED_OUT is recorded as failed, saying it timed out", async () => {
    const { step, view } = await userWithJob();
    runpod.script({ statuses: [status("TIMED_OUT")] });

    await step();

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/timed out/i);
  });

  it("that Runpod reports CANCELLED is recorded as cancelled, with a reason", async () => {
    const { step, view } = await userWithJob();
    runpod.script({ statuses: [status("CANCELLED")] });

    await step();

    const job = await view();
    expect(job.status).toBe("cancelled");
    expect(job.error).toMatch(/cancelled/i);
    expect(job.finishedAt).toBeTruthy();
  });

  it("whose Worker returns an error is recorded as failed with the Worker's message", async () => {
    const { step, view, job: created, browser } = await userWithJob();
    runpod.script({ statuses: [status("COMPLETED", { output: { error: "width must be a multiple of 16" } })] });

    await step();

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toBe("width must be a multiple of 16");
    expect((await browser.get(`/api/images/${created.id}/file`)).status).toBe(404);
  });

  it("that Runpod says COMPLETED without an image is recorded as failed", async () => {
    const { step, view } = await userWithJob();
    runpod.script({ statuses: [status("COMPLETED", { output: { prompt: "x" } })] });

    await step();

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/no image/i);
  });

  it("that Runpod doesn't know about any more is recorded as failed with \"result expired\"", async () => {
    const { step, view } = await userWithJob();
    runpod.script({ statuses: [{ status: 404, body: { error: "job not found" } }] });

    await step();

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/result expired/i);
  });

  it("whose server stopped before it reached Runpod is marked failed after about 2 minutes", async () => {
    const { user, browser, creating, stuck } = await jobStuckBeforeRunpod();
    const view = async () => (await browser.get(`/api/jobs/${stuck.id}`)).json();

    await processPendingJobs({ userId: user.id });
    expect((await view()).status).toBe("pending");
    await processPendingJobs({ userId: user.id, now: Date.now() + 3 * 60_000 });

    const job = await view();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/never reached Runpod/i);
    expect(job.finishedAt).toBeTruthy();
    await creating;
  });

  it("that reaches Runpod after the follower gave up on it is cancelled there, so nothing runs unsaved", async () => {
    const { user, browser, creating, stuck } = await jobStuckBeforeRunpod();
    await processPendingJobs({ userId: user.id, now: Date.now() + 3 * 60_000 });

    const response = await creating;

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBeTruthy();
    const [run, cancel] = runpod.requests;
    expect(cancel).toMatchObject({ method: "POST" });
    expect(cancel.path).toMatch(/^\/cancel\/job-/);
    expect(run.path).toBe("/run");
    const job = await (await browser.get(`/api/jobs/${stuck.id}`)).json();
    expect(job.status).toBe("failed");
  });

  it("is left unfinished when Runpod can't be reached, and checked again on the next run", async () => {
    const { step, view, job: created } = await userWithJob();
    runpod.script({ statuses: ["drop", completed(created.seed)] });

    await step();
    expect((await view()).status).toBe("pending");
    await step();

    expect((await view()).status).toBe("completed");
  });
});
