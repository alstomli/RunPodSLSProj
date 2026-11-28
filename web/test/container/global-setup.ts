import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { freePort, readStack } from "../global-setup";

const web = path.resolve(__dirname, "..", "..");
const logDir = path.join(web, ".next-test");
const UNREACHABLE_RUNPOD = "http://host.docker.internal:9";

function envFlagsWithoutValues(env: Record<string, string>) {
  return Object.keys(env).flatMap((name) => ["--env", name]);
}

function docker(args: string[], options: { env?: NodeJS.ProcessEnv; log?: string } = {}) {
  const result = spawnSync("docker", args, { cwd: web, encoding: "utf8", env: options.env, maxBuffer: 64 * 1024 * 1024 });
  if (options.log) fs.writeFileSync(options.log, `${result.stdout}\n${result.stderr}`);
  return result;
}

function fromContainer(url: string) {
  return url.replace(/\/\/(127\.0\.0\.1|localhost)([:/]|$)/, "//host.docker.internal$2");
}

async function waitForContainer(url: string, container: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const running = docker(["inspect", "--format", "{{.State.Running}}", container]).stdout.trim();
    if (running !== "true") break;
    const response = await fetch(`${url}/sign-in`, { redirect: "manual" }).catch(() => null);
    if (response && response.status < 500) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const logs = docker(["logs", container]);
  throw new Error(`The container did not start serving.\n${logs.stdout}\n${logs.stderr}`);
}

export default async function setup(project: TestProject) {
  const stack = readStack();
  if (!stack) throw new Error("The local Supabase stack isn't running. Start it with: npx supabase start");

  fs.mkdirSync(logDir, { recursive: true });
  let image = process.env.TEST_IMAGE;
  if (!image) {
    image = "runpodslsproj-web:test";
    console.log(`Building ${image} from web/Dockerfile (log: .next-test/container-build.log)...`);
    const build = docker(["build", "--tag", image, "."], { log: path.join(logDir, "container-build.log") });
    if (build.status !== 0) throw new Error(`docker build failed:\n${build.stderr.slice(-4000)}`);
  }

  const env = {
    SUPABASE_URL: stack.API_URL,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  };
  const containerEnv: Record<string, string> = {
    ...env,
    SUPABASE_URL: fromContainer(stack.API_URL),
    RUNPOD_API_KEY: "container-test",
    RUNPOD_ENDPOINT_ID: "container-test",
    RUNPOD_API_BASE: UNREACHABLE_RUNPOD,
    JOB_FOLLOWER: "off",
  };

  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const run = docker(
    [
      "run", "--detach",
      "--publish", `127.0.0.1:${port}:3000`,
      "--add-host", "host.docker.internal:host-gateway",
      ...envFlagsWithoutValues(containerEnv),
      image,
    ],
    { env: { ...process.env, ...containerEnv } },
  );
  if (run.status !== 0) throw new Error(`docker run failed:\n${run.stderr}`);
  const container = run.stdout.trim();

  try {
    await waitForContainer(appUrl, container);
  } catch (error) {
    docker(["rm", "--force", container]);
    throw error;
  }

  project.provide("appUrl", appUrl);
  project.provide("env", env);
  project.provide("image", image);

  return () => {
    docker(["logs", container], { log: path.join(logDir, "container.log") });
    docker(["rm", "--force", container]);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    image: string;
  }
}
