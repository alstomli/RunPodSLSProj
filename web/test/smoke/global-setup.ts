/**
 * Global setup for the browser smoke test (`npm run test:smoke`), in Playwright's main process:
 * 1. Makes sure the local Supabase stack is running (never stops or resets it; it is shared).
 * 2. Starts the demo fake Runpod (scripts/demo-runpod.mjs), which plays each Job through to a PNG
 *    on its own clock. Jobs it didn't create get 400 instead of Runpod's 404, so this server's
 *    follower leaves other test runs' unfinished Jobs in the shared database alone.
 * 3. Starts one Next.js dev server (dist dir `.next-smoke`) pointed at both, with the Job
 *    follower's timer ON, so the Job finishes the way it would for real.
 * 4. Creates a fresh User.
 * The test reads the app URL and the User from SMOKE_* environment variables.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { startDemoRunpod } from "../../scripts/demo-runpod.mjs";
import { ensureStack, freePort, stop, waitForServer } from "../global-setup";

const web = path.resolve(__dirname, "..", "..");
const nextCli = path.join(web, "node_modules", "next", "dist", "bin", "next");
const distDir = ".next-smoke";

export default async function globalSetup() {
  const stack = ensureStack();
  const runpod = await startDemoRunpod(0, { unknownJobStatus: 400 });

  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_URL: stack.API_URL,
    SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    RUNPOD_API_KEY: "smoke-test-key",
    RUNPOD_ENDPOINT_ID: "smoke-test-endpoint",
    RUNPOD_API_BASE: runpod.url,
    NEXT_DIST_DIR: distDir,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.JOB_FOLLOWER; // the timer stays on

  fs.mkdirSync(path.join(web, distDir), { recursive: true });
  const logFile = path.join(web, distDir, "smoke-server.log");
  const log = fs.openSync(logFile, "w");
  const server = spawn(process.execPath, [nextCli, "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: web,
    env,
    stdio: ["ignore", log, log],
    detached: process.platform !== "win32",
  });
  const teardown = async () => {
    stop(server);
    fs.closeSync(log);
    await runpod.close();
  };

  try {
    await waitForServer(`http://127.0.0.1:${port}`, server, logFile);
    const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `smoke-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;

    // The browser opens localhost, not 127.0.0.1: Next's dev server refuses its HMR socket to
    // 127.0.0.1, and the page would never hydrate.
    process.env.SMOKE_APP_URL = `http://localhost:${port}`;
    process.env.SMOKE_USER_EMAIL = email;
    process.env.SMOKE_USER_PASSWORD = password;
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
