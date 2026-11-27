import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": web,
      "server-only": path.join(web, "node_modules", "server-only", "empty.js"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/container/**", "node_modules/**"],
    environment: "node",
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
