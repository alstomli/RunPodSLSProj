import "server-only";
import { config } from "./config";

/** Called once at Node server boot (instrumentation.ts). */
export function startServer() {
  // Read all configuration now, so a missing variable stops the server at boot
  // instead of failing the first request.
  try {
    config();
  } catch (error) {
    console.error(`Can't start: ${(error as Error).message}`);
    process.exit(1);
  }
  // Later: start the Job follower timer here.
}
