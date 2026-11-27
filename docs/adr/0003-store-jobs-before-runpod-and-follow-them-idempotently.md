# A Job is stored before Runpod is asked, and the Job follower is safe to run in several copies

Runpod bills a Job from the moment it accepts it, and the server can stop at any time, so creating a Job stores its row first, then submits it to Runpod, then records the Runpod Job id on the row; submitting first and storing after would let a crash in between leave a billed Job that nothing saves. Several copies of the app may run at once (two pods, or an old one shutting down), so every write the Job follower makes is conditional on the row still being unfinished, which makes running it twice harmless.

## Consequences

- A row with no Runpod Job id after 2 minutes never reached Runpod (a submit gives up well before then); the follower marks it failed. That update and the create request's "record the id" update are both conditional, so exactly one wins. If the id arrives after the follower gave up, the create request cancels the Job on Runpod instead of leaving it running unsaved.
- `/run` is retried only on 429. A 5xx may mean Runpod queued the Job anyway, and a retry could queue and bill it twice. `/status` and `/cancel` are safe to repeat and are retried on 429 and 5xx.
- A finished Job's PNG is uploaded before the row is marked completed, to a path fixed by the Image's id with upsert. Two followers racing may both upload, but there is still one file and one completed row.
- Row-level security lets a User record the Runpod Job id (or Runpod's refusal) on their own new row exactly once, and nothing else; the follower records every other change with the service key.
