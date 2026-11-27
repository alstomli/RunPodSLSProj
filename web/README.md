# Web app

The web frontend for the FLUX.1-dev Endpoint: sign in, make Images, keep a Gallery
(spec: GitHub issue #2). Next.js (App Router) running as a long-running Node server.
Users, Image records and PNG files live in Supabase (see `../docs/adr/0001-*.md`).

Needs Node 20 or newer and Docker (for the local Supabase stack).

## Configuration

Read from environment variables when the server starts; the server refuses to start if one is missing.
Nothing is baked in at build time, and the browser never talks to Supabase or Runpod.

| Variable | What it holds |
|---|---|
| `SUPABASE_URL` | The Supabase project's URL |
| `SUPABASE_ANON_KEY` | The Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | The Supabase service key (only the Job follower uses it) |
| `RUNPOD_API_KEY` | The Runpod API key |
| `RUNPOD_ENDPOINT_ID` | The Endpoint to send Jobs to |
| `RUNPOD_API_BASE` | Optional. Overrides `https://api.runpod.ai/v2/<endpoint id>` |

## Working on it

```sh
npm install
npx supabase start      # local Supabase in Docker, built from supabase/migrations
npm run dev:local       # app on http://127.0.0.1:3000 against the local stack; Runpod is never called
npm test                # Vitest: real HTTP routes, local Supabase, fake Runpod
npm run lint && npm run typecheck
```

There is no sign-up page. Create Users in Supabase (locally: Studio at http://127.0.0.1:54323,
or the admin API).

## Layout

- `app/` pages and server routes (`app/api/...`)
- `proxy.ts` turns away visitors who aren't signed in (401 for `/api/*`, redirect to `/sign-in` for pages)
- `lib/session.ts` the visitor's Supabase session; the server acts as that User
- `lib/config.ts` configuration from the environment
- `supabase/` local stack config and migrations (the same migrations go to the hosted project)
- `test/` Vitest tests, the fake Runpod and test helpers
