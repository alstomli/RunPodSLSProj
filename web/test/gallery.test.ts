import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { processPendingJobs } from "@/lib/follower";
import { Browser, createUser, supabaseAs, type TestUser } from "./app";
import { FakeRunpod, status } from "./fake-runpod";
import { makePng } from "../scripts/demo-runpod.mjs";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

/** Stand-in for the Worker's PNG: the PNG signature followed by some bytes. */
const PNG =Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("gallery image data ÿ\u0000\u0002")]);

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

/** Starts a Job for the User; returns its ImageView. */
async function startJob(browser: Browser, prompt: string, settings: Record<string, unknown> = {}) {
  runpod.script({});
  const response = await browser.post("/api/jobs", { prompt, ...settings });
  expect(response.status).toBe(201);
  return response.json();
}

/** Starts a Job and lets the follower save its Image. */
async function makeImage(user: TestUser, browser: Browser, prompt: string, settings: Record<string, unknown> = {}) {
  const job = await startJob(browser, prompt, settings);
  runpod.script({ statuses: [completed(job.seed)] });
  await processPendingJobs({ userId: user.id });
  return job;
}

describe("the Gallery", () => {
  it("lists the User's Images newest first, unfinished Jobs included with their status", async () => {
    const { user, browser } = await signedIn();
    const oldest = await makeImage(user, browser, "first: a lighthouse", {
      width: 832,
      height: 1216,
      steps: 20,
      guidance: 4.5,
      seed: 777,
    });
    const queued = await startJob(browser, "second: a harbour");
    runpod.script({ statuses: [status("IN_QUEUE")] });
    await processPendingJobs({ userId: user.id });
    const newest = await startJob(browser, "third: a red fox");

    const response = await browser.get("/api/images");

    expect(response.status).toBe(200);
    const { images } = await response.json();
    expect(images.map((i: { id: string; status: string }) => [i.id, i.status])).toEqual([
      [newest.id, "pending"],
      [queued.id, "in_queue"],
      [oldest.id, "completed"],
    ]);
    expect(images[2]).toMatchObject({
      prompt: "first: a lighthouse",
      width: 832,
      height: 1216,
      steps: 20,
      guidance: 4.5,
      seed: 777,
      error: null,
    });
    expect(Date.parse(images[2].createdAt)).not.toBeNaN();
  });

  it("shows on the main page below the form", async () => {
    const { browser } = await signedIn();

    const html = await (await browser.get("/")).text();

    const form = html.indexOf("Generate");
    const gallery = html.indexOf('id="gallery-heading"');
    expect(form).toBeGreaterThan(-1);
    expect(gallery).toBeGreaterThan(form);
  });

  it("is empty for a new User", async () => {
    const { browser } = await signedIn();

    const response = await browser.get("/api/images");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ images: [] });
  });
});

describe("downloading an Image", () => {
  it("gives the original PNG as an attachment named after the prompt and seed", async () => {
    const { user, browser } = await signedIn();
    const image = await makeImage(user, browser, "A red fox, in snow!", { seed: 123456 });

    const response = await browser.get(`/api/images/${image.id}/file?download=1`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="a-red-fox-in-snow_seed123456.png"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("isn't an attachment without the download option", async () => {
    const { user, browser } = await signedIn();
    const image = await makeImage(user, browser, "a lighthouse");

    const response = await browser.get(`/api/images/${image.id}/file`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it("is a 404 while the Job is unfinished", async () => {
    const { browser } = await signedIn();
    const job = await startJob(browser, "still running");

    expect((await browser.get(`/api/images/${job.id}/file?download=1`)).status).toBe(404);
  });
});

describe("two Users, A and B", () => {
  async function aliceWithAnImage() {
    const a = await signedIn();
    const image = await makeImage(a.user, a.browser, "A's private fox");
    expect((await a.browser.get(`/api/images/${image.id}/file`)).status).toBe(200);
    return { ...a, image };
  }

  it("A's Images are missing from B's Gallery", async () => {
    const a = await aliceWithAnImage();
    const aUnfinished = await startJob(a.browser, "A's unfinished Job");
    const b = await signedIn();
    const bImage = await makeImage(b.user, b.browser, "B's own harbour");

    const { images } = await (await b.browser.get("/api/images")).json();

    expect(images.map((i: { id: string }) => i.id)).toEqual([bImage.id]);
    const aIds = (await (await a.browser.get("/api/images")).json()).images.map((i: { id: string }) => i.id);
    expect(aIds).toEqual([aUnfinished.id, a.image.id]);
  });

  it("B gets 404 for A's Job status and A's Image file, with and without download", async () => {
    const a = await aliceWithAnImage();
    const b = await signedIn();

    for (const path of [
      `/api/jobs/${a.image.id}`,
      `/api/images/${a.image.id}/file`,
      `/api/images/${a.image.id}/file?download=1`,
    ]) {
      const response = await b.browser.get(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("content-disposition"), path).toBeNull();
    }
  });

  it("B gets 404 cancelling A's Job, and nothing reaches Runpod", async () => {
    const a = await signedIn();
    const job = await startJob(a.browser, "A's running Job");
    const b = await signedIn();
    runpod.script({});

    const response = await b.browser.post(`/api/jobs/${job.id}/cancel`);

    expect(response.status).toBe(404);
    expect(runpod.requests).toHaveLength(0);
  });

  it("a visitor who isn't signed in can't get A's PNG through Next's image optimizer", async () => {
    const a = await signedIn();
    // A real PNG, so the optimizer could resize it if it ever got hold of it.
    const png = makePng(64, 64, 42);
    const job = await startJob(a.browser, "A's private lake");
    runpod.script({ statuses: [status("COMPLETED", { output: { image_base64: png.toString("base64") } })] });
    await processPendingJobs({ userId: a.user.id });
    const path = `/_next/image?url=${encodeURIComponent(`/api/images/${job.id}/file`)}&w=64&q=75`;
    // A asks first, in case the optimizer keeps what it fetched for later visitors.
    await a.browser.get(path);

    const response = await new Browser().get(path);

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type") ?? "").not.toMatch(/^image\//);
    expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(false);
  });

  it("B can't read A's file straight from Storage with B's own session", async () => {
    const a = await aliceWithAnImage();
    const b = await signedIn();
    const path = `${a.user.id}/${a.image.id}.png`;
    // The same request with A's session works, so B's failure below is the policy, not a wrong path.
    const asA = await (await supabaseAs(a.user)).storage.from("images").download(path);
    expect(Buffer.from(await asA.data!.arrayBuffer())).toEqual(PNG);

    const asB = await supabaseAs(b.user);

    const download = await asB.storage.from("images").download(path);
    expect(download.data).toBeNull();
    expect(download.error).toBeTruthy();
    const signed = await asB.storage.from("images").createSignedUrl(path, 60);
    expect(signed.data).toBeNull();
    const listing = await asB.storage.from("images").list(a.user.id);
    expect(listing.data ?? []).toEqual([]);
  });
});
