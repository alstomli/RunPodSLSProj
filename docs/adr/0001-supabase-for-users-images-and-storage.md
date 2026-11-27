# Supabase holds Users, Images and their files; the frontend pod keeps nothing

The web frontend runs on a Runpod CPU pod, which has a disk, yet Users, sign-in, Image records and the PNG files all live in Supabase (Postgres, Auth and Storage), so the pod is stateless and can be deleted, recreated or run as several copies in any data center. We chose this because the plan is to grow from one User to many with self-service sign-up, which a SQLite file on one pod's network volume cannot serve safely and which Supabase Auth gives us without building it by hand.

## Considered Options

- **SQLite plus PNGs on a Runpod network volume**: cheapest (about $0.35/month) and no extra service, but SQLite is single-writer and unsafe in WAL mode on a network disk, it ties the pod to the volume's data center, and sign-up, password reset and social login would all be hand-built.
- **Our own `users` table with username login**: would allow logging in as `admin`, but Supabase Auth only signs in by email or phone, and we preferred one login method for everyone and working password reset.

## Consequences

- Supabase Auth signs Users in by email, not username.
- Each User sees only their own Gallery because of Postgres row-level security and Storage policies, applied while the server acts as the signed-in User. Only the background step that saves finished Images uses the service key.
- On Supabase's free plan a project pauses after about a week without activity and has 1 GB of file storage, which is roughly 500 to 700 Images.
