-- Images: one row per Job/Image, the private Storage bucket that holds the PNGs,
-- and the rules that let each User reach only their own.

create table public.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Null only when Runpod refused the Job, so it never got an id.
  runpod_job_id text unique,
  -- pending: sent to Runpod, not yet seen running. completed, failed and cancelled are final.
  status text not null check (status in ('pending', 'in_queue', 'in_progress', 'completed', 'failed', 'cancelled')),
  prompt text not null check (length(btrim(prompt)) > 0),
  width integer not null,
  height integer not null,
  steps integer not null,
  guidance double precision not null,
  seed bigint not null check (seed between 0 and 4294967295),
  error text,
  -- <user id>/<image id>.png in the images bucket, set when the PNG is stored.
  file_path text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint images_sent_jobs_have_a_runpod_id check (runpod_job_id is not null or status = 'failed'),
  constraint images_completed_have_a_file check (status <> 'completed' or file_path is not null)
);

comment on table public.images is
  'One row per Job/Image. Users insert and read their own rows; only the Job follower (service key) updates them.';

-- The Gallery: one User's Images, newest first.
create index images_user_created_at on public.images (user_id, created_at desc);
-- The Job follower: unfinished Jobs, oldest first.
create index images_unfinished on public.images (created_at)
  where status in ('pending', 'in_queue', 'in_progress');

alter table public.images enable row level security;

create policy "Users read their own Images"
  on public.images for select to authenticated
  using (user_id = (select auth.uid()));

-- A User adds a row when they create a Job: pending once Runpod accepted it, failed if it refused.
create policy "Users add their own Images"
  on public.images for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status in ('pending', 'failed')
    and file_path is null
  );

-- No update or delete policies: Users can't change rows. The follower uses the service key.
revoke all on public.images from anon;
revoke update, delete, truncate on public.images from authenticated;

-- PNGs at <user id>/<image id>.png. Private: only the signed-in owner (or the service key) reads them.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('images', 'images', false, array['image/png'])
on conflict (id) do nothing;

create policy "Users read their own Image files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
