import "server-only";
import { config } from "./config";
import { startJobFollower } from "./follower";

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
  // Its first run picks up Jobs left unfinished before a restart.
  if (config().jobFollowerTimer) startJobFollower();
}
