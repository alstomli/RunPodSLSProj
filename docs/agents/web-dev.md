# Working on `web/` locally

Commands, scripts and configuration are in `web/README.md`, `web/package.json` and `web/supabase/config.jsonc`. This page holds only what those don't say.

Next.js here is version 16, newer than your training data. Read `web/AGENTS.md`, then the relevant guide in `web/node_modules/next/dist/docs/`, before writing Next code.

## The local Supabase stack is shared

One stack (project_id `runpodslsproj`, ports 5432x) serves every worktree and agent on this machine, and the human's own dev server.

- Leave it running. Apply new migrations with `npx supabase migration up`.
- `supabase db reset` deletes every User and Image and signs every browser out (they show `Invalid Refresh Token: Refresh Token Not Found` until the person signs in again). Reset only when nothing else uses the stack, and tell the human you did.
- `MigrationMissingLocalError` on `migration up` means another worktree applied a migration your branch lacks. Report it and leave the migration history as it is.
- Tests create their own Users with `example.test` emails, so rows from other runs are expected.

## Runpod and secrets

Tests and `npm run dev:local` always use a fake or dead Runpod address; keep it that way and leave the real Endpoint alone. Leave the repo-root `.env` unread and unprinted.

## Browser checks

- Open the dev server at `http://localhost:<port>`. On `127.0.0.1`, Next's dev server refuses its HMR websocket, the page never hydrates, and forms fall back to native submits.
- Cookies are shared across ports on one host. Give each agent its own hostname, such as `http://<agent-name>.localhost:<port>` (`npm run dev:local -- --port <port>`), so sessions stay apart.
- For a signed-in check, create a User through the admin API the way `createUser()` in `web/test/app.ts` does, with the service key from `npx supabase status -o env` and an `example.test` email.

## Windows processes

- Stopping a background `npm run dev:local` task can leave `next` listening. Find it with `Get-NetTCPConnection -LocalPort <port>` and stop that PID.
- In PowerShell, call `npm.cmd` and `npx.cmd` (execution policy blocks `npm.ps1`). Bash takes plain `npm`.
- `core.autocrlf` is true, so files check out with CRLF. Patch scripts keep each file's existing line endings.

## Worktrees

- Run `npm ci` in each worktree's own `web/`. Turbopack compiles only files inside the project root, so a `node_modules` junction to another checkout breaks it.
- Move a worktree onto another branch with `git merge --ff-only <branch>`.
- Run one git command per call, or use `git -C <path>`; the worktree guard refuses compound `cd … && git …` commands.

## When a run fails

Server logs: `web/.next-test/test-server.log` (Vitest), `web/.next-smoke/` (Playwright), `web/.next-test/container-build.log` (container test build).

## Python worker (repo root)

`test_generate.py` runs anywhere. `test_handler.py` needs `torch`, Pillow and `runpod` installed, so import errors there on a dev machine are expected, not failures.
