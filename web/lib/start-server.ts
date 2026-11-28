import "server-only";
import { config } from "./config";
import { startJobFollower } from "./follower";

export function startServer() {
  failAtBootIfMisconfigured();
  if (config().jobFollowerTimer) startJobFollower();
}

function failAtBootIfMisconfigured() {
  try {
    config();
  } catch (error) {
    console.error(`Can't start: ${(error as Error).message}`);
    process.exit(1);
  }
}
