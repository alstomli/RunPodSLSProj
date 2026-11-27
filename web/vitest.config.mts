import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": web,
      // Tests import server modules directly (e.g. the Job follower); `server-only` would throw outside Next.
      "server-only": path.join(web, "node_modules", "server-only", "empty.js"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // The container image tests have their own run: npm run test:container.
    exclude: ["test/container/**", "node_modules/**"],
    environment: "node",
    // Starts (or reuses) the local Supabase stack and one Next.js dev server for the whole run.
    globalSetup: ["test/global-setup.ts"],
    // Copies the stack's URL and keys into process.env so app code reads them as in the server.
    setupFiles: ["test/setup-env.ts"],
    // All files share one app server and one fake Runpod port, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
