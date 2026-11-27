// npm run dev:local [-- --prod] [-- --port 3000] [-- --fake-runpod]
// Runs the app against the local Supabase stack (read from `supabase status`), with Runpod
// pointed at a local address so the real Endpoint is never called (these override any values in
// your shell). --prod runs the production build (`npm run build` first).
// --fake-runpod starts a demo Endpoint (scripts/demo-runpod.mjs) that plays every Job through to
// a generated PNG, so you can make Images by hand. Without it, Runpod points at a dead port.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDemoRunpod } from "./demo-runpod.mjs";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const prod = args.includes("--prod");
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? args[portIndex + 1] : "3000";
const fakeRunpod = args.includes("--fake-runpod");

const status = spawnSync(process.execPath, [path.join(web, "node_modules/supabase/dist/supabase.js"), "status", "-o", "env"], {
  cwd: web,
  encoding: "utf8",
});
const stack = {};
for (const line of status.stdout.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (match) stack[match[1]] = match[2];
}
if (!stack.API_URL) {
  console.error("The local Supabase stack isn't running. Start it with: npx supabase start");
  process.exit(1);
}

const env = {
  ...process.env,
  SUPABASE_URL: stack.API_URL,
  SUPABASE_ANON_KEY: stack.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  RUNPOD_API_KEY: "local-dev",
  RUNPOD_ENDPOINT_ID: "local-dev",
  RUNPOD_API_BASE: fakeRunpod ? (await startDemoRunpod()).url : "http://127.0.0.1:9", // nothing listens on 9
};

const command = prod
  ? [path.join(web, ".next/standalone/server.js")]
  : [path.join(web, "node_modules/next/dist/bin/next"), "dev", "--port", port];
if (prod) {
  // The standalone server serves static files only from its own folder.
  fs.cpSync(path.join(web, ".next/static"), path.join(web, ".next/standalone/.next/static"), { recursive: true });
  env.PORT = port;
  env.HOSTNAME = "127.0.0.1";
}
// In dev, open localhost: Next's dev server refuses its HMR socket to 127.0.0.1, and the page never hydrates.
console.log(`App: http://${prod ? "127.0.0.1" : "localhost"}:${port} (Supabase ${env.SUPABASE_URL}, Runpod ${env.RUNPOD_API_BASE})`);
const child = spawn(process.execPath, command, { cwd: web, env, stdio: "inherit" });
// The demo Endpoint (--fake-runpod) lives in this process, so it stops with the app.
child.on("exit", (code) => process.exit(code ?? 0));
