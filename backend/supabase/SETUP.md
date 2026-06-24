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

The console is read-only over the `research_*` views; it cannot write or delete study data (except manual measurements below). The participant app stays anonymous and never uses these credentials.

**Accounts and access.** The console has Sign in **and Sign up**. Signing up only creates an auth account — it grants **no** data access until an admin adds a row in `researcher_profiles` (so new accounts see an "awaiting approval" screen). Roles: `admin` and `researcher` can upload measurements; `viewer` can only read.

## 10. Manual & Device Measurements (ECG / Physical / Raspberry Pi)

Researchers can upload measurements for a candidate from the console (e.g. an ECG, or a manually-run physical-test result). These go to `public.manual_measurements`, written by authenticated researchers only.

Fresh setups get the table from `schema.sql`. Existing databases run once:

```text
backend/supabase/migrations/2026-06-20_add_manual_measurements.sql
```

Each row has `participant_code`, `measurement_type` (`ecg` / `physical`), structured fields (`heart_rate_bpm`, `hrv_ms`, `value`, `unit`), a `data` jsonb for raw values, `notes`, and `source` (`manual` / `raspberry_pi`). Read them from the `research_manual_measurements_export` view.

**Raspberry Pi auto-upload (planned).** The same table is the target for device uploads. The intended design: the Pi posts `{ participant_code, measurement_type: 'ecg', heart_rate_bpm, hrv_ms, data }` to a small Supabase **Edge Function** that validates a device key and inserts the row with `source = 'raspberry_pi'`. This keeps the powerful service key on the device side only, never in the browser. (Not yet implemented — needs the hardware to build and test.)

## 11. Participant ID Pool (provided IDs + revoke/reuse)

So candidates use IDs you control (no clashes), researchers pre-generate a pool of codes; the participant app then accepts only a valid, unused code.

Run once (existing databases):

```text
backend/supabase/migrations/2026-06-20_add_participant_slots.sql
```

This adds `public.participant_slots` (the pool) and `claim_participant_code()` (an atomic, anon-callable function). It also **drops the unique constraint on `participants.participant_code`** so a revoked code can be released and reused.

In the console, the **Participant IDs** card lets you:

- **Generate** a batch (e.g. prefix `P`, start `1`, count `50` → `P001`…`P050`).
- See each code's status: available / assigned / completed / revoked.
- **Revoke** a withdrawn candidate, and **Release** a code back to the pool for reuse.

In the participant app, when Supabase is configured, the demographics step **claims** the entered code: an unknown or already-used code is rejected with a clear message. Generate the pool **before** a data-collection day. (Without Supabase configured, the app keeps free-text entry for local testing.)

## 12. Raspberry Pi ECG Auto-Upload (Edge Function)

A Raspberry Pi (or any device) can push an ECG straight to a candidate via the `device-ingest` edge function (`backend/supabase/functions/device-ingest/`). It authenticates with a shared device key and inserts using the service role, so no powerful key ever touches the browser or the app.

Deploy (Supabase CLI, from the `backend/` folder where the project is linked):

```bash
supabase functions deploy device-ingest --no-verify-jwt
supabase secrets set DEVICE_INGEST_KEY=<a-long-random-string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. The row lands in `manual_measurements` with `source = 'raspberry_pi'`, so it shows in the console next to the candidate's other data.

Endpoint contract — `POST https://<project-ref>.functions.supabase.co/device-ingest`:

```text
headers: x-device-key: <DEVICE_INGEST_KEY>, content-type: application/json
body:    { "participant_code": "P017", "measurement_type": "ecg",
           "heart_rate_bpm": 72, "hrv_ms": 45.5, "data": { ... } }
reply:   201 { "ok": true }   |   400/401/500 { "error": "…" }
```

Quick test:

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/device-ingest" \
  -H "x-device-key: $DEVICE_INGEST_KEY" -H "content-type: application/json" \
  -d '{"participant_code":"P017","measurement_type":"ecg","heart_rate_bpm":72,"hrv_ms":45.5}'
```

See `backend/supabase/functions/device-ingest/pi-example.py` for a Raspberry Pi uploader (swap in your real sensor read). The workflow: on the day, select a candidate, take the ECG, and the Pi posts it with that candidate's code — it auto-appears in the console.