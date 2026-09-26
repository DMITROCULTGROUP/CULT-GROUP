# Supabase backend

- `schema.sql` — database tables, RLS policies, history, roles and Realtime.
- `functions/invite-user/index.ts` — optional secure invite function for Admin users.

Never put `SUPABASE_SERVICE_ROLE_KEY` in this GitHub Pages project. It belongs only in Supabase server-side secrets / Edge Functions.
