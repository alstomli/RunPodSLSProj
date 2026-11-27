/**
 * Runs once per `npm test`, in the main Vitest process:
 * 1. Makes sure the local Supabase stack is running (starts it if not; never stops or resets it,
 *    because other worktrees share it) and reads its URL and keys from `supabase status`.
 * 2. Picks a port for the fake Runpod. Test files that need it start it there with
 *    `FakeRunpod.start(inject("runpodPort"))`; the app server already points RUNPOD_API_BASE at it.
 * 3. Starts one Next.js dev server (dist dir `.next-test`) with that configuration and waits for it.
 * The values reach test files through `inject(...)` and, via test/setup-env.ts, through process.env.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { TestProject } from "vitest/node";

const web = path.resolve(__dirname, "..");
const supabaseCli = path.join(web, "node_modules", "supabase", "dist", "supabase.js");
const nextCli = path.join(web, "node_modules", "next", "dist", "bin", "next");
const distDir = ".next-test";

export const TEST_RUNPOD = { apiKey: "test-runpod-key", endpointId: "test-endpoint" };

function supabase(...args: string[]) {
  return spawnSync(process.execPath, [supabaseCli, ...args], { cwd: web, encoding: "utf8" });
}

export function readStack(): Record<string, string> | null {
  const result = supabase("status", "-o", "env");
  if (result.status !== 0) return null;
  const values: Record<string, string> = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values[match[1]] = match[2];
  }
  return values.API_URL ? values : null;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

async function waitForServer(url: string, child: ChildProcess, logFile: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${url}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The test app server did not start. See ${logFile}`);
}

export default async function setup(project: TestProject) {
  let stack = readStack();
  if (!stack) {
    console.log("Local Supabase stack is not running; starting it (first time pulls Docker images)...");
    const started = supabase("start");
    if (started.status !== 0) throw new Error(`supabase start failed:\n${started.stdout}\n${started.stderr}`);
    stack = readStack();
    if (!stack) throw new Error("supabase status gave no API_URL after supabase start");
  }

  const runpodPort = await freePort();
  const appPort = await freePort();
  const appUrl = `http://127.0.0.1:${appPort}`;

  const env = {
    SUPABASE_URL: stack.API_URL,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    RUNPOD_API_KEY: TEST_RUNPOD.apiKey,
    RUNPOD_ENDPOINT_ID: TEST_RUNPOD.endpointId,
    RUNPOD_API_BASE: `http://127.0.0.1:${runpodPort}`,
    // Tests step the follower themselves with processPendingJobs({ userId }).
    JOB_FOLLOWER: "off",
  };

  fs.mkdirSync(path.join(web, distDir), { recursive: true });
  const logFile = path.join(web, distDir, "test-server.log");
  const log = fs.openSync(logFile, "w");
  const server = spawn(process.execPath, [nextCli, "dev", "--port", String(appPort), "--hostname", "127.0.0.1"], {
    cwd: web,
    env: { ...process.env, ...env, NEXT_DIST_DIR: distDir, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", log, log],
    detached: process.platform !== "win32",
  });

  try {
    await waitForServer(appUrl, server, logFile);
  } catch (error) {
    stop(server);
    throw error;
  }

  project.provide("appUrl", appUrl);
  project.provide("runpodPort", runpodPort);
  project.provide("env", env);

  return () => {
    stop(server);
    fs.closeSync(log);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    /** Base URL of the Next.js app under test, e.g. http://127.0.0.1:51234 */
    appUrl: string;
    /** Port the app expects the fake Runpod on (RUNPOD_API_BASE = http://127.0.0.1:<port>). */
    runpodPort: number;
    /** The environment variables the app server was started with. */
    env: Record<string, string>;
  }
}
