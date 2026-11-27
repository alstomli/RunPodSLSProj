import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { makePng } from "../../scripts/demo-runpod.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PROMPT = "A red fox, in snow!";
const SLUG = "a-red-fox-in-snow";

function smokeEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run this test with npm run test:smoke`);
  return value;
}

test("sign in, generate an Image, watch it finish and download it", async ({ page }) => {
  const appUrl = smokeEnv("SMOKE_APP_URL");

  await page.goto(appUrl);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(smokeEnv("SMOKE_USER_EMAIL"));
  await page.getByLabel("Password").fill(smokeEnv("SMOKE_USER_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();

  await page.getByLabel("Prompt").fill(PROMPT);
  await page.getByRole("button", { name: "Generate" }).click();

  const currentJob = page.getByRole("region", { name: "Current Job" });
  const status = currentJob.getByRole("status");
  await expect(status).toContainText("Sent");

  await page.reload();
  await expect(status).toContainText(/Sent|In the queue|In progress/);
  await expect(currentJob.getByTestId("elapsed")).toHaveText(/^\d+:\d\d$/);
  await expect(currentJob.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();

  await expect(status).toContainText(/In the queue|In progress/, { timeout: 15_000 });
  await expect(status).toContainText("Done", { timeout: 30_000 });

  const image = currentJob.getByRole("img", { name: PROMPT });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1024);

  const seedText = await currentJob.getByText(/Seed \d+/).textContent();
  const seed = Number(seedText?.match(/Seed (\d+)/)?.[1]);
  expect(Number.isInteger(seed)).toBe(true);

  const downloading = page.waitForEvent("download");
  await currentJob.getByRole("link", { name: "Download" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe(`${SLUG}_seed${seed}.png`);
  const saved = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  const bytes = fs.readFileSync(saved);
  expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true);
  // The exact image the fake Endpoint made for this seed: the Job went to the fake, not the real Endpoint.
  expect(bytes.equals(makePng(1024, 1024, seed))).toBe(true);
});
