# `master` changes only through checked, up-to-date pull requests, so publishing doesn't re-test

Every push to `master` that touches the web app publishes `ghcr.io/alstomli/runpodslsproj-web:latest`, the image the pod runs, without running the tests. That is safe only because a repository ruleset makes pull requests the sole way into `master` (no bypass, not even for the owner), requires the `check` job to pass, and requires each pull request to be up to date with `master` before it merges, so the code `check` tested is exactly the code that lands. Re-running the tests in the publish job would spend about seven minutes repeating that run.

## Consequences

- Relaxing the ruleset (bypass actors, dropping "up to date", or removing `check` from the required checks) lets untested code reach the published image; add the tests to the publish job first.
- Every pull request gets a `check` result so it can be required: when nothing under `web/` or the workflow changed, `check` is skipped, which GitHub counts as passed. Those pull requests can't trigger a publish either. If the list of changed files can't be read, `check` runs rather than being skipped.
