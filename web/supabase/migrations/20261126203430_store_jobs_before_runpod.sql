-- Create Job stores the row first and submits to Runpod after (spec #2: "stores the row as
-- pending, submits the Job to Runpod"), so a crash in between can't leave a billed Job with no row.
-- That needs:
--   1. pending rows without a Runpod Job id (the moment between insert and submit);
--   2. the User recording, on their own new row and only once, either the Runpod Job id or that
--      Runpod refused it. Everything else stays the Job follower's (service key, ADR 0001).
-- A row whose server stopped before it reached Runpod is marked failed by the follower.

-- 1. A running Job has a Runpod id; a pending one may not have it yet; a failed one may never get it.
alter table public.images drop constraint images_sent_jobs_have_a_runpod_id;
alter table public.images add constraint images_running_jobs_have_a_runpod_id
  check (runpod_job_id is not null or status in ('pending', 'failed'));

comment on column public.images.runpod_job_id is
  'Null while the Job is being submitted, and for good when Runpod refused it or it never reached Runpod.';

-- A User adds a row only as a new Job: pending, not yet sent, nothing recorded about it.
drop policy "Users add their own Images" on public.images;
create policy "Users add their own Images"
  on public.images for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and runpod_job_id is null
    and error is null
    and file_path is null
    and finished_at is null
  );

-- 2. Once per row, while it is pending with no Runpod id: either Runpod's Job id (still pending),
-- or Runpod's refusal (failed, with the reason and the time). Only these columns can change.
grant update (runpod_job_id, status, error, finished_at) on public.images to authenticated;

create policy "Users record how their new Job was sent"
  on public.images for update to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'pending'
    and runpod_job_id is null
  )
  with check (
    user_id = (select auth.uid())
    and (
      (status = 'pending' and runpod_job_id is not null and error is null and finished_at is null)
      or (status = 'failed' and runpod_job_id is null and error is not null and finished_at is not null)
    )
  );

comment on table public.images is
  'One row per Job/Image. Users insert their own pending rows, record the Runpod Job id (or the refusal) once, '
  'and read their own rows; everything after that is the Job follower''s (service key).';
