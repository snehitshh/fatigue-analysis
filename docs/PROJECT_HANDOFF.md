# FatigueIDPro — Project Handoff (for Codex)

You are taking over this project. Read this fully before making changes. It is a real
research platform for **SPARC** (a US research institute; institution = TIET, SPARC).

## What it is
A web platform that measures human **fatigue** from how a person interacts with a PC,
plus physiological signals (ECG via a Raspberry Pi / external machine). Participants do a
standardised task battery in the browser; researchers manage accounts and review/export
data in an admin console. Data lives in Supabase (Postgres + RLS + Storage + Edge Function).

## Repo, remotes, deploy
- Local: `e:\Data-center\fatigue-analysis`. Work branch: **v2-release**.
- Push to remote **`fidpro`** → `github.com/Varunkasana26/FatigueIDPro`, branch **main**
  (`git push fidpro HEAD:main`). (`origin` is a different, older repo — don't use it.)
- **Vercel** auto-deploys on push to main → live at `fatigue-id-pro.vercel.app`.
- **Supabase** project "Fatigue-Analysis", ref `ujbstlizorpyrwfkndqc`,
  url `https://ujbstlizorpyrwfkndqc.supabase.co`. Manage via the Supabase MCP connector.

## Stack
Vanilla JS + **Vite** multi-page build. Three entry pages:
- `frontend/index.html` — participant experiment (classic scripts + `src/lib/*` ES modules).
- `frontend/admin.html` — research console (`src/admin/admin.js`).
- `frontend/scroll.html` — phone-usage study shell (`src/scroll/scroll.js`) — ON HOLD.
Tests: Node `--test` in `tests/` (`npm test`, ~21 passing). Docs: `python-docx` in `scripts/make-*.py`.

## The study protocol (SPARC spec — already implemented in main.js)
Per session, ONE category (2×2): base task {Typing | Pointing(Fitts)} × fatigue task
{Stroop(cognitive) | Physical}. Device: PC. Flow (driver = `startProtocol` in `main.js`):
```
baseline Q → base → Q → fatigue → base → Q → fatigue → base → Q
(3 base rounds, 2 fatigue rounds; no timed break)
```
Each **Q** = NASA-TLX + **Borg CR10**; **KSS** (sleepiness) only at the baseline (start)
and the final (end) Q. Baseline questionnaires are tagged **block 0** (nasa/fatigue block
range relaxed to 0-3, nasa block_id nullable). Participant flow before the protocol:
consent → fullscreen kiosk → optional camera + photo-capture consent → adaptive 4-dot
calibration → **self-registration** (email → auto `FP-` id, de-duplicated by email) →
protocol → a live "Test completion %" bar → completion.

## Admin console (admin.html)
Sidebar sections: Overview, Sessions (+ camera snapshot gallery), Data quality (go/no-go),
Test data browsers (Fitts, Typing, Cognitive, NASA-TLX, Fatigue/KSS, **Borg**, Attention,
Scroll, **Phone usage**), and admin-only: **Registrations** (self-reg contacts),
**Access requests** (approval queue), **Audit log**. Plus Participant IDs (pool),
Measurements (manual ECG/physical upload), Export (CSV per dataset, audited).
Auth: Supabase email/password. New sign-ups are role **pending** (no data access) until an
**admin approves** them (role viewer/researcher/admin). Every approval/denial/export is
written to the append-only `audit_log`.

## Backend / DB
RLS everywhere: anon can INSERT participant data; only **approved** researchers can read
(pending/denied roles are outside the allowed set). Contact PII (`participant_contacts`)
and camera images are admin-only. Migrations in `backend/supabase/migrations/` (apply via
MCP `apply_migration`/`execute_sql` AND commit the .sql file). Key tables: participants,
sessions, experiment_blocks, fitts/typing/cognitive trials, physical_fatigue_logs,
nasa_tlx_responses, fatigue_ratings (KSS), **borg_ratings**, engagement_summary,
manual_measurements, participant_slots, participant_contacts, session_frames, audit_log,
researcher_profiles (role enum incl pending/denied), phone_usage_sessions,
app_usage_intervals, scroll_sessions/intervals (legacy). `research_*_export` views feed the
CSV exports. RPCs: register_participant, claim_participant_code, finalize_session,
finalize_scroll_session, finalize_phone_usage_session, log_audit, request_researcher_access,
admin_list_researchers, approve_researcher, set_researcher_denied.
Private Storage bucket `session-frames` (camera snapshots, admin-read via signed URLs).

## Raspberry Pi ECG (in progress)
Pi 4, headless: `ssh fatigue-analysis@fatigue-analysis.local`. Prepped (venv +
`adafruit-circuitpython-ads1x15`, I2C enabled). Chain: BioAmp EXG Pill → **ADS1115 ADC**
(ordered, not yet wired) → Pi → `device-ingest` Edge Function (deployed, `x-device-key`
header = secret `DEVICE_INGEST_KEY`) → inserts into `manual_measurements` (source
`raspberry_pi`). Pipeline tested end-to-end with dummy data (`{"ok":true}`).
`backend/supabase/functions/device-ingest/pi-example.py` is the uploader template — replace
`read_ecg()`. NOTE: ECG may also come from an external commercial machine with its own
software; align by participant_code + timestamps. Next: wire ADS1115 when it arrives, run
`i2cdetect -y 1`, write real `read_ecg()` (sample ~250Hz, R-peaks, HR/HRV).

## On hold (do not start unless asked)
- **Phone-usage study**: `scroll.html` is the registration+KSS shell; a native Android app
  must implement `window.FatiguePhoneUsage` (UsageStats + AccessibilityService, sideloaded
  APK) to record real app usage. DB + shell ready; native app not built. See
  `FatigueIDPro_Phone_App_Architecture.docx`.
- **DL model**: a teammate builds dataset parsers (per-modality features → unified CSV; see
  `docs/DL_MODEL_ROADMAP.md`, `docs/DL_TEAM_TASK.md`). FatigueSet parser done
  (github.com/Shuchih-Negi/fatigueset_parser_v1). We take over the model after ~3-5 datasets
  are parsed AND our own collection has a first batch. Labels are PER-DATASET (not one common
  label); our data is the multimodal fusion set.

## Standing rules (do not break)
- **Never commit `.docx` files** — they're local working docs; only the `scripts/make-*.py`
  generators are committed.
- **No AI attribution in commits** — no "Co-Authored-By" / "Generated with" trailers.
- **Before every commit**: `npm run build` (clean) + `npm test` (all pass).
- **DB changes**: apply via Supabase MCP AND save a migration `.sql` in
  `backend/supabase/migrations/`. The MCP connector is **intermittently permission-flaky** —
  retry, or ask the user to reconnect it in Claude/Codex connector settings.
- Never commit `.env`/secrets/`node_modules`/`dist`. The Supabase **anon key is safe** to
  expose (RLS protects data).
- Frontend is CRLF on Windows; ignore the "LF will be replaced by CRLF" git warnings.

## Env vars (Vercel + local .env)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required). `VITE_STUDY_INSTITUTION`
(=`TIET,SPARC`) + `VITE_STUDY_CONTACT` are the two REQUIRED study fields (consent screen is
blocked without them). Optional: `VITE_STUDY_PROTOCOL_ID`, `_RETENTION`, `_DATA_USE`,
`_PHYSICAL_PROTOCOL_NAME/_INSTRUCTIONS` (show "To be confirmed" if unset). Camera images
kill-switch: `VITE_COLLECT_CAMERA_FRAMES` (default true → false to stop saving photos).

## Immediate open items
1. Confirm `VITE_STUDY_CONTACT` is set in Vercel; do one real test run and verify the SPARC
   session + questionnaires (NASA/Borg/KSS) + task rows land (query the DB).
2. Real IRB values, camera keep/disable decision, enable Leaked-Password Protection in
   Supabase Auth (all non-blocking).
3. Pi: wire ADS1115 + real ECG script when the part arrives.

## Working style expected
Understand the flow before editing (trace `main.js` end-to-end). Smallest correct diff.
Build + test + commit + push each coherent change with a clear message. Verify DB changes
live via MCP. Keep the participant experiment (index.html) and admin (admin.html) isolated —
they have separate styles.
