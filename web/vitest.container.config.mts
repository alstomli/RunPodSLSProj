import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = path.dirname(fileURLToPath(import.meta.url));

// `npm run test:container`: the tests for the production container image (test/container/).
// Kept out of `npm test` because building the image takes minutes.
export default defineConfig({
  resolve: { alias: { "@": web } },
  test: {
    include: ["test/container/**/*.test.ts"],
    environment: "node",
    // Builds the image and starts one container against the local Supabase stack.
    globalSetup: ["test/container/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
