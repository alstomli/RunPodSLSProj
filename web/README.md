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

The container listens on port 3000 (`PORT` and `HOSTNAME` are set in the image; leave them alone).

## Working on it

```sh
npm install
npx supabase start      # local Supabase in Docker, built from supabase/migrations
npm run dev:local       # app on http://127.0.0.1:3000 against the local stack; Runpod is never called
npm test                # Vitest: real HTTP routes, local Supabase, fake Runpod
npm run lint && npm run typecheck
npm run test:container  # builds the Docker image and tests a container against the local stack
npm run test:smoke      # Playwright: one browser test from sign-in to download (see below)
```

There is no sign-up page. Create Users in Supabase (locally: Studio at http://127.0.0.1:54323,
or the admin API).

### Browser smoke test

`npm run test:smoke` runs one Playwright test in Chromium: sign in, type a prompt, press Generate,
watch the status change and the Image appear, click Download, and check the file's name
(`<prompt-slug>_seed<seed>.png`) and that it is a PNG. It starts its own dev server against the
local Supabase stack (started if it isn't running) and a fake Runpod (`scripts/demo-runpod.mjs`),
with the Job follower's timer on; the real Endpoint is never called. It takes about 25 s.
Its server log and results go to `.next-smoke/`.

The first time, install the browser: `npx playwright install chromium`.

## Deviations from the spec (on purpose)

These differ from, or go beyond, spec #2. They were reviewed and kept; please don't "fix" them.

- **Sign-in has more answers than 401.** Wrong details give 401 as specified. A missing email or
  password gives 400, Supabase Auth's rate limit gives 429, and Supabase Auth being unavailable
  gives 503, each with a sentence for the User.
- **`/run` is not retried on 5xx.** The spec says Runpod's 429 and 5xx replies are retried. That
  holds for `/status` and `/cancel`. For `/run`, only 429 is retried, because a 5xx may have
  queued the Job already, and a retry could queue it twice.
- **Test seams in the app.** `GET /api/me` exists for the container test (proves the server acts
  as the User). `processPendingJobs({ userId, now })` lets tests step only their own Jobs and move
  the clock. `JOB_FOLLOWER=off` turns the follower's timer off.
- **Uploads come before the saved-once update.** The follower uploads the PNG (`upsert: true`)
  and then marks the row completed only if it is still unfinished. Two copies racing may both
  upload, but to the same path, so there is still one file per Image and one completed row.

Beyond the spec: a Job's row is stored before it is submitted, and the User's own session records
the Runpod Job id (row-level security allows exactly that, once). A Job that still has no Runpod
id after 2 minutes is marked failed ("never reached Runpod"). `GET /api/jobs/current` gives the
page the newest unfinished Job after a reload. Next's image optimizer is off
(`images.unoptimized`), so `/_next/image` can never serve a User's file.

## Layout

- `app/` pages and server routes (`app/api/...`)
- `proxy.ts` turns away visitors who aren't signed in (401 for `/api/*`, redirect to `/sign-in` for pages)
- `lib/session.ts` the visitor's Supabase session; the server acts as that User
- `lib/config.ts` configuration from the environment
- `supabase/` local stack config and migrations (the same migrations go to the hosted project)
- `test/` Vitest tests, the fake Runpod and test helpers; `test/container/` tests the Docker image; `test/smoke/` is the Playwright browser smoke test
- `Dockerfile`, `.dockerignore` the container image

## Container image

`Dockerfile` (in this folder) builds the production server: a multi-stage build of
`next build`'s standalone output, run as `node server.js` on port 3000. The image holds no
secrets and no project-specific values, so one image works for any deployment.

```sh
docker build -t runpodslsproj-web .
docker run --rm -p 3000:3000 \
  -e SUPABASE_URL -e SUPABASE_ANON_KEY -e SUPABASE_SERVICE_ROLE_KEY \
  -e RUNPOD_API_KEY -e RUNPOD_ENDPOINT_ID \
  runpodslsproj-web
```

(`-e NAME` passes the value from your shell.) Against the local Supabase stack, use
`http://host.docker.internal:54321` as `SUPABASE_URL`, since `127.0.0.1` inside the container
is the container itself. Starting the server also starts the Job follower; there is nothing else to run.
