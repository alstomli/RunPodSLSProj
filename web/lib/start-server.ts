import "server-only";
import { config } from "./config";
import { startJobFollower } from "./follower";
import { errorMessage } from "./utils/unknown";

export function startServer() {
  failAtBootIfMisconfigured();
  if (config().jobFollowerTimer) startJobFollower();
}

function failAtBootIfMisconfigured() {
  try {
    config();
  } catch (error) {
    console.error(`Can't start: ${errorMessage(error)}`);
    process.exit(1);
  }
}
