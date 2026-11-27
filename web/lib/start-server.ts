import "server-only";
import { config } from "./config";
import { startJobFollower } from "./follower";

export function startServer() {
  // Read all configuration now, so a missing variable stops the server at boot
  // instead of failing the first request.
  try {
    config();
  } catch (error) {
    console.error(`Can't start: ${(error as Error).message}`);
    process.exit(1);
  }
  if (config().jobFollowerTimer) startJobFollower();
}
