# Configuration is read only when the server starts, never at build time

The web app reads every setting (Supabase URL and keys, Runpod key and Endpoint) from environment variables when the server starts, and nothing is baked in by `next build`, so one container image published from `master` runs in any deployment and holds no secrets. The usual Next.js route of `NEXT_PUBLIC_*` variables would put values into the browser bundle and force a build per deployment; the browser here never talks to Supabase or Runpod, so it needs none of them.

## Consequences

- Route handlers wait for a request (`connection()`) before reading configuration, because with Cache Components a GET route is otherwise prerendered at build time, when there is no configuration.
- The server reads all configuration at boot and refuses to start if a variable is missing, rather than failing on the first request.
