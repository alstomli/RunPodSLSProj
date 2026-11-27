import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { SIZE_PRESETS } from "@/lib/settings";
import { Browser, createUser } from "./app";
import { FakeRunpod } from "./fake-runpod";

let runpod: FakeRunpod;
let browser: Browser;

beforeAll(async () => {
  runpod = await FakeRunpod.start(inject("runpodPort"));
  browser = new Browser();
  await browser.signIn(await createUser());
});

afterAll(async () => {
  await runpod.close();
});

function sentToRunpod() {
  return runpod.requests.filter((r) => r.path === "/run").map((r) => (r.body as { input: unknown }).input);
}

describe("creating a Job with settings", () => {
  it("sends the given width, height, steps, guidance and seed to Runpod unchanged", async () => {
    runpod.script({});
    const settings = { prompt: "a red fox in snow", width: 832, height: 1216, steps: 20, guidance: 5.5, seed: 123456 };

    const response = await browser.post("/api/jobs", settings);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject(settings);
    expect(sentToRunpod()).toEqual([settings]);
  });

  it.each(SIZE_PRESETS.map((preset) => [preset.name, preset] as const))(
    "accepts the %s size preset and sends its size unchanged",
    async (_, preset) => {
      runpod.script({});

      const response = await browser.post("/api/jobs", { prompt: "a lighthouse", width: preset.width, height: preset.height });

      expect(response.status).toBe(201);
      expect(sentToRunpod()).toEqual([expect.objectContaining({ width: preset.width, height: preset.height })]);
    },
  );

  it("accepts the smallest and largest values the Worker allows", async () => {
    runpod.script({});
    const lowest = { prompt: "low", width: 256, height: 256, steps: 1, guidance: 0, seed: 0 };
    const highest = { prompt: "high", width: 1536, height: 1536, steps: 50, guidance: 20, seed: 2 ** 32 - 1 };

    expect((await browser.post("/api/jobs", lowest)).status).toBe(201);
    expect((await browser.post("/api/jobs", highest)).status).toBe(201);

    expect(sentToRunpod()).toEqual([lowest, highest]);
  });

  it("picks a random seed when the seed is left empty, as the form sends it", async () => {
    runpod.script({});

    const response = await browser.post("/api/jobs", {
      prompt: "a lighthouse",
      width: "1216",
      height: "832",
      steps: "28",
      guidance: "3.5",
      seed: "",
    });

    expect(response.status).toBe(201);
    const job = await response.json();
    expect(job.seed).toBeGreaterThanOrEqual(0);
    expect(job.seed).toBeLessThanOrEqual(2 ** 32 - 1);
    expect(sentToRunpod()).toEqual([
      { prompt: "a lighthouse", width: 1216, height: 832, steps: 28, guidance: 3.5, seed: job.seed },
    ]);
  });

  it.each([
    ["a blank prompt", { prompt: "" }, "prompt"],
    ["width 100", { width: 100 }, "width"],
    ["width 1000 (not a multiple of 16)", { width: 1000 }, "width"],
    ["height 1552", { height: 1552 }, "height"],
    ["steps 0", { steps: 0 }, "steps"],
    ["steps 2.5", { steps: 2.5 }, "steps"],
    ["guidance 25", { guidance: 25 }, "guidance"],
    ["guidance -1", { guidance: -1 }, "guidance"],
    ["seed -1", { seed: -1 }, "seed"],
    ["seed 2^32", { seed: 2 ** 32 }, "seed"],
    ["a seed that isn't a number", { seed: "lucky" }, "seed"],
  ])("with %s is refused with a field error and nothing reaches Runpod", async (_, change, field) => {
    runpod.script({});

    const response = await browser.post("/api/jobs", { prompt: "a red fox in snow", ...change });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(Object.keys(body.fields)).toEqual([field]);
    expect(body.fields[field]).toEqual(expect.any(String));
    expect(runpod.requests).toHaveLength(0);
  });
});
