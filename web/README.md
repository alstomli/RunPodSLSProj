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

On the pod, `RUNPOD_API_KEY` comes from a Runpod Secret (see [Deploying](#deploying-steps-only-the-owner-can-do)).
The container listens on port 3000 (`PORT` and `HOSTNAME` are set in the image; leave them alone).

## Working on it

```sh
npm install
npx supabase start      # local Supabase in Docker, built from supabase/migrations
npm run dev:local       # app on http://localhost:3000 against the local stack; Runpod is never called
npm test                # Vitest: real HTTP routes, local Supabase, fake Runpod
npm run check           # typecheck, lint and npm test: what CI runs on every pull request
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
- `Dockerfile`, `.dockerignore` the container image (published by `../.github/workflows/web.yml`)

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

The GitHub Actions workflow `../.github/workflows/web.yml` has two jobs, both only for changes to `web/`:

- `check`, on every pull request: `npm run check` against a local Supabase stack started in the job.
- `publish`, on every push to `master`: builds this image and publishes it to GitHub Container
  Registry as `ghcr.io/alstomli/runpodslsproj-web`, tagged `latest` and with the commit SHA.

`publish` doesn't re-run the tests: `master` takes changes only through pull requests that passed
`check` and were up to date with `master` (a repository ruleset the owner sets up).

## Deploying (steps only the owner can do)

The app runs on a Runpod CPU pod that keeps no data; everything lives in Supabase. Never put a
real email address, password or key in this repository.

1. **Create the Supabase project** at [supabase.com](https://supabase.com) (the free plan is
   enough; it pauses after about a week without activity and stores about 1 GB of files).
   Note the project URL, the anon key and the service role key (dashboard: *Project Settings →
   API Keys*; the service role key is a secret, keep it out of the repository).
   Under *Authentication → Sign In / Providers*, turn off *Allow new users to sign up*.
2. **Apply the migrations** (schema, row-level security, Storage bucket and policies) from this folder:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   `link` asks for the database password you chose in step 1.
   Run `npx supabase db push` again whenever new files appear in `supabase/migrations/`.
3. **Create the first User** in the Supabase dashboard: *Authentication → Users → Add user →
   Create new user*, with your email and a password, and *Auto Confirm User* ticked.
   Add more Users the same way.
4. **Make sure the Runpod Secret holding the API key exists**: Runpod console → *Secrets*.
   Note its name; the pod reads it as `{{ RUNPOD_SECRET_<name> }}`. The key needs access to the Endpoint.
5. **Make the GHCR package public** after the workflow has run once: GitHub → your profile →
   *Packages* → `runpodslsproj-web` → *Package settings* → *Change visibility* → *Public*.
   (Runpod pulls the image without credentials.)
6. **Create the CPU pod**: Runpod console → *Pods* → *Deploy* → *CPU*, with
   - container image `ghcr.io/alstomli/runpodslsproj-web:latest`
     (or a commit SHA tag to pin a version),
   - *Expose HTTP ports*: `3000`, no volume (the pod keeps nothing),
   - environment variables:

     | Variable | Value |
     |---|---|
     | `SUPABASE_URL` | the project URL from step 1 |
     | `SUPABASE_ANON_KEY` | the anon key from step 1 |
     | `SUPABASE_SERVICE_ROLE_KEY` | the service role key from step 1 |
     | `RUNPOD_ENDPOINT_ID` | the FLUX.1-dev Endpoint's id |
     | `RUNPOD_API_KEY` | `{{ RUNPOD_SECRET_<name> }}`, the Secret from step 4 |

   The app is then at `https://<pod id>-3000.proxy.runpod.net`. Sign in with the User from step 3.
   If the pod's logs say `Missing environment variable(s): ...`, add that variable and restart.

Start and stop the pod by hand. A new image is published on every push to `master`; to run it,
restart or redeploy the pod so it pulls `latest` again, or set the image to the new SHA tag.
