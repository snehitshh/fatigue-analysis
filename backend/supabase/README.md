# Supabase Setup

Use `backend/supabase/schema.sql` in the Supabase SQL Editor to create the database tables, indexes, grants, and Row Level Security policies for the Fatigue Analysis experiment.

Run order:

1. Open your Supabase project.
2. Go to SQL Editor.
3. Paste the full contents of `backend/supabase/schema.sql`.
4. Run it once.
5. Copy `.env.example` to `.env` in the project root.
6. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
7. Restart the Vite dev server.

Do not put `service_role`, secret keys, database passwords, or JWT secrets in `.env` for this browser app.


Research export views:

- Fresh setup: included in `backend/supabase/schema.sql`.
- Existing database: run `backend/supabase/migrations/2026-06-16_add_research_export_views.sql` once.
- Query examples: see `backend/supabase/EXPORTS.md`.