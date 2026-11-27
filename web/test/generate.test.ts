import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { processPendingJobs } from "@/lib/follower";
import { Browser, createUser } from "./app";
import { FakeRunpod, status } from "./fake-runpod";

/** Stand-in for the Worker's PNG: the PNG signature followed by some bytes. */
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("fake image data ÿ\u0000\u0001")]);

function completed(seed: number): ReturnType<typeof status> {
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

async function signedIn() {
  const user = await createUser();
  const browser = new Browser();
  await browser.signIn(user);
  return { user, browser };
}

describe("creating a Job", () => {
  it("sends the prompt with the default settings and a seed to Runpod", async () => {
    const { browser } = await signedIn();
    runpod.script({});

    const response = await browser.post("/api/jobs", { prompt: "a red fox in snow" });

    expect(response.status).toBe(201);
    const job = await response.json();
    expect(job.status).toBe("pending");
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isInteger(job.seed)).toBe(true);
    expect(job.seed).toBeGreaterThanOrEqual(0);
    expect(job.seed).toBeLessThanOrEqual(2 ** 32 - 1);

    const runs = runpod.requests.filter((r) => r.path === "/run");
    expect(runs).toHaveLength(1);
    expect(runs[0].method).toBe("POST");
    expect(runs[0].authorization).toBe("Bearer test-runpod-key");
    expect(runs[0].body).toEqual({
      input: { prompt: "a red fox in snow", width: 1024, height: 1024, steps: 28, guidance: 3.5, seed: job.seed },
    });
  });

  it("with a blank prompt is refused and nothing reaches Runpod", async () => {
    const { browser } = await signedIn();
    runpod.script({});

    const response = await browser.post("/api/jobs", { prompt: "   " });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(body.fields.prompt).toBeTruthy();
    expect(runpod.requests).toHaveLength(0);
  });

  it("that Runpod refuses is stored as failed and the caller gets an error", async () => {
    const { browser } = await signedIn();
    runpod.script({ run: { status: 400, body: { error: "bad request" } } });

    const response = await browser.post("/api/jobs", { prompt: "a lighthouse" });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    const status = await browser.get(`/api/jobs/${body.id}`);
    expect(status.status).toBe(200);
    const job = await status.json();
    expect(job.status).toBe("failed");
    expect(job.prompt).toBe("a lighthouse");
    expect(job.error).toBeTruthy();
  });
});

describe("following a Job", () => {
  it("reports each stage, then serves the finished PNG", async () => {
    const { user, browser } = await signedIn();
    runpod.script({});
    const created = await (await browser.post("/api/jobs", { prompt: "a red fox in snow" })).json();
    runpod.script({ statuses: [status("IN_QUEUE"), status("IN_PROGRESS"), completed(created.seed)] });

    const stage = async () => (await (await browser.get(`/api/jobs/${created.id}`)).json()).status;
    expect(await stage()).toBe("pending");
    expect((await browser.get(`/api/images/${created.id}/file`)).status).toBe(404);

    await processPendingJobs({ userId: user.id });
    expect(await stage()).toBe("in_queue");
    await processPendingJobs({ userId: user.id });
    expect(await stage()).toBe("in_progress");
    await processPendingJobs({ userId: user.id });

    const job = await (await browser.get(`/api/jobs/${created.id}`)).json();
    expect(job).toMatchObject({ status: "completed", seed: created.seed, error: null });
    expect(job.finishedAt).toBeTruthy();
    const file = await browser.get(`/api/images/${created.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
    // The follower asked about this one Job, once per step; the routes never called Runpod.
    const paths = runpod.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toHaveLength(3);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toMatch(/^GET \/status\/job-/);
  });

  it("saves the Image when only the follower runs and no page is polling (tab closed)", async () => {
    const { user, browser } = await signedIn();
    runpod.script({});
    const created = await (await browser.post("/api/jobs", { prompt: "a quiet harbour" })).json();
    runpod.script({ statuses: [completed(created.seed)] });

    await processPendingJobs({ userId: user.id });

    // The User comes back later.
    const again = new Browser();
    await again.signIn(user);
    expect((await (await again.get(`/api/jobs/${created.id}`)).json()).status).toBe("completed");
    const file = await again.get(`/api/images/${created.id}/file`);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
  });
});

describe("another User", () => {
  it("gets 404 for the Job's status and the Image file", async () => {
    const owner = await signedIn();
    runpod.script({});
    const created = await (await owner.browser.post("/api/jobs", { prompt: "my secret" })).json();
    runpod.script({ statuses: [completed(created.seed)] });
    await processPendingJobs({ userId: owner.user.id });
    expect((await owner.browser.get(`/api/images/${created.id}/file`)).status).toBe(200);

    const { browser: other } = await signedIn();

    expect((await other.get(`/api/jobs/${created.id}`)).status).toBe(404);
    expect((await other.get(`/api/images/${created.id}/file`)).status).toBe(404);
  });

  it("gets 404 for an id that isn't an Image id", async () => {
    const { browser } = await signedIn();

    expect((await browser.get("/api/jobs/not-an-id")).status).toBe(404);
    expect((await browser.get("/api/images/not-an-id/file")).status).toBe(404);
  });
});
