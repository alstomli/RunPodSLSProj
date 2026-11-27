-- First migration. Sign-in uses Supabase Auth's own auth.users table, which
-- needs nothing from us. Later migrations add the Images table, its row-level
-- security policies and the Storage bucket.
select 1;
