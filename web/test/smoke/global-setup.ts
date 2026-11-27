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
  delete env.JOB_FOLLOWER;

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

    process.env.SMOKE_APP_URL = `http://127.0.0.1:${port}`;
    process.env.SMOKE_USER_EMAIL = email;
    process.env.SMOKE_USER_PASSWORD = password;
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
