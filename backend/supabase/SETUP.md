# Supabase Setup Guide

This project now uses Vite so local environment variables can be read safely during frontend development.

## 1. Create the Supabase Tables

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `backend/supabase/schema.sql` from this repository.
4. Paste the full file into Supabase.
5. Run it.

This creates:

- Study metadata
- Researcher profiles
- Participants
- Sessions
- Experiment blocks
- Session events
- Fitts trials
- Typing trials
- NASA-TLX responses
- Cognitive trials
- Physical fatigue logs
- Indexes, grants, and Row Level Security policies

## 2. Add Your Local Environment File

Create a file named `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

Do not commit `.env`. It is ignored by Git.

Do not add any of these to frontend `.env` files:

- `service_role` key
- Supabase secret key
- Database password
- JWT secret

## 3. Install and Run

```powershell
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## 4. Frontend API

The Supabase frontend helper is loaded from:

```text
frontend/src/lib/experimentApi.js
```

It attaches this object to the browser:

```js
window.fatigueExperimentApi
```

Current available methods:

- `getActiveStudy()`
- `createParticipant(payload)`
- `createSession(payload)`
- `createExperimentBlock(payload)`
- `recordSessionEvent(payload)`
- `saveFittsTrial(payload)`
- `saveTypingTrial(payload)`
- `saveNasaTlxResponse(payload)`
- `saveCognitiveTrial(payload)`
- `savePhysicalFatigueLog(payload)`

The experiment screens now save records through these methods when Supabase is configured. Local CSV downloads are suppressed in database mode and remain as a fallback only when Supabase is not configured.

Saved rows include `participant_code`, `session_code`, and `record_label` so each result can be identified by candidate, session, block, dataset, and sequence number.

## 5. Researcher Access

Participant inserts are allowed through the public browser key.

Researcher reads require:

1. A Supabase Auth user.
2. A matching row in `public.researcher_profiles`.

After creating a researcher user in Supabase Auth, copy that user's UUID and use `backend/supabase/seed.sql` as the template for adding the researcher profile.



## 6. Existing Database Migration

If you already ran `backend/supabase/schema.sql` before record labels were added, also run this file once in Supabase SQL Editor:

```text
backend/supabase/migrations/2026-06-16_add_record_labels.sql
```

This adds `participant_code`, `session_code`, and `record_label` columns to result tables so rows are easy to identify by candidate/session/block in Supabase.

## 7. Research Export Views

Fresh setups get export views from `backend/supabase/schema.sql` automatically.

If your database already existed before this step, run this file once in Supabase SQL Editor:

```text
backend/supabase/migrations/2026-06-16_add_research_export_views.sql
```

Use `backend/supabase/EXPORTS.md` for simple query examples. These views are for authenticated researchers only and keep the existing RLS checks active.

## 8. Engagement / Validation Summary

The app records a per-test engagement summary so researchers can judge whether a participant was actually engaged during each test. It captures app-switch / time-away signals (Page Visibility) and, when the participant opts in, camera attention (looking at the screen vs away).

Fresh setups get the `engagement_summary` table and its export view from `backend/supabase/schema.sql` automatically.

If your database already existed, run this file once in Supabase SQL Editor:

```text
backend/supabase/migrations/2026-06-20_add_engagement_summary.sql
```

Researchers can read the flat data from the `research_engagement_export` view.

## 9. Research Console (Admin Panel)

A separate authenticated page, `admin.html`, lets researchers review results in a readable form: a list of sessions and, per session, the per-test engagement and camera-attention validation (attentive %, look-aways, app-switches, time away).

It is built alongside the participant app. After `npm run dev` it is served at:

```text
http://127.0.0.1:5173/admin.html
```

After `npm run build` it is emitted as `dist/admin.html` (deploy it alongside `index.html`).

To sign in you need a researcher account:

1. In Supabase, go to **Authentication > Users** and **Add user** (email + password).
2. Copy that user's UUID.
3. In the SQL Editor, run `backend/supabase/seed.sql` with the UUID pasted in (it inserts a row in `researcher_profiles`). This row is what Row Level Security checks before letting the account read any study data.
4. Open `admin.html`, sign in with that email/password.

The console is read-only over the `research_*` views; it cannot write or delete study data. The participant app stays anonymous and never uses these credentials.