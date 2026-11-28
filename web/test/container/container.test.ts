import { spawnSync } from "node:child_process";
import { describe, expect, inject, it } from "vitest";
import { appUrl, Browser, createUser } from "../app";

const image = inject("image");

function docker(...args: string[]) {
  return spawnSync("docker", args, { encoding: "utf8", timeout: 60_000 });
}

describe("the container", () => {
  it("serves the sign-in page with its scripts", async () => {
    const response = await new Browser().get("/sign-in");

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Sign in");
    const script = html.match(/src="(\/_next\/static\/[^"]+\.js)"/)?.[1];
    expect(script, "a script from /_next/static").toBeTruthy();
    expect((await fetch(`${appUrl}${script}`)).status).toBe(200);
  });

  it("sends a visitor who isn't signed in from the main page to sign-in", async () => {
    const response = await new Browser().get("/");

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!, appUrl).pathname).toBe("/sign-in");
  });

  it("signs a User in against Supabase", async () => {
    const user = await createUser();
    const browser = new Browser();

    await browser.signIn(user);

    const me = await browser.get("/api/me");
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe(user.email);
  });
});

describe("the image", () => {
  it("holds no configuration: without environment variables the server refuses to start", () => {
    const run = docker("run", "--rm", image);

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("Missing environment variable(s): SUPABASE_URL");
  });

  it("sets no Supabase or Runpod variables and contains no .env files", () => {
    const inspect = docker("image", "inspect", "--format", "{{json .Config.Env}}", image);
    expect(inspect.status).toBe(0);
    const env: string[] = JSON.parse(inspect.stdout);
    expect(env.filter((line) => /^(SUPABASE|RUNPOD)_/.test(line))).toEqual([]);

    const find = docker("run", "--rm", "--entrypoint", "find", image, "/app", "-name", ".env*");
    expect(find.status).toBe(0);
    expect(find.stdout.trim()).toBe("");
  });
});
