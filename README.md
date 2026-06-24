# FatigueIDPro

A research platform that measures **human fatigue through interaction** — how a person's
performance and behaviour change as they tire — and stores it for analysis and machine
learning.

It is three things in one codebase:

1. **The experiment** — a browser app where a participant completes timed tasks (tapping,
   typing, workload rating, a cognitive battery, and a physical or scroll task) across
   three randomized blocks, with consent, safety, and attention-validation built in.
2. **The research console** — an authenticated admin panel to manage participant IDs,
   review every candidate's results, and upload manual measurements (ECG / physical).
3. **The scroll-fatigue app** — a standalone study (web + Android APK) that measures
   fatigue from scrolling over 30–120 minutes.

Everything runs on a single **Supabase** (Postgres) backend with row-level security.

---

## Table of contents

- [What it measures](#what-it-measures)
- [How the participant experience flows](#how-the-participant-experience-flows)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Setup](#setup)
- [Running it](#running-it)
- [Researcher / admin guide](#researcher--admin-guide)
- [Day-of data-collection workflow](#day-of-data-collection-workflow)
- [The scroll-fatigue app + APK](#the-scroll-fatigue-app--apk)
- [Raspberry Pi ECG upload](#raspberry-pi-ecg-upload)
- [Data model](#data-model)
- [Privacy & safety](#privacy--safety)
- [What still needs device testing](#what-still-needs-device-testing)
- [Tech stack](#tech-stack)

---

## What it measures

**Primary tasks** (one is randomly assigned per session):

| Task | What it captures |
|------|------------------|
| **Fitts tapping** | Pointing precision/throughput (index of difficulty, movement time, error rate) over 10 one-minute rounds, on a responsive, measurement-safe arena |
| **Typing** | WPM, error distance, inter-key interval, keystrokes-per-char, backspaces, live highlighting; detects physical vs virtual keyboard |

**Fatigue tasks** (one is randomly assigned per session):

| Task | What it captures |
|------|------------------|
| **Cognitive battery** | Stroop + AX-CPT: reaction time (measured from true stimulus onset), accuracy, timeouts |
| **Physical** | A timed exercise with active/paused tracking and a safety screen |

**Workload:** NASA-TLX (6 dimensions) after each block.

**Engagement / attention validation** (rides along every test):

- **App-switch / time-away** (Page Visibility) — did they leave the app mid-test, and for how long.
- **Camera attention** (opt-in) — on-device MediaPipe face tracking estimates "looking at screen vs away" (`attentive %`, look-aways). Only derived numbers are stored, never any image.
- **4-dot calibration** — when the camera is on, four dots are tapped clockwise to capture screen geometry + a per-corner gaze reference.

**Scroll fatigue** (separate app): how scrolling slows and pauses lengthen across a long session.

---

## How the participant experience flows

```
Consent  →  Camera opt-in  →  (4-dot calibration, if camera)  →  Demographics (claim ID)
        →  Protocol assignment  →  Block 1 [ primary task → NASA-TLX → break → fatigue task ]
        →  Block 2  →  Block 3  →  Completion summary
```

- A persistent **Withdraw** button is available throughout.
- **Session resume:** a refresh or disconnect restores the exact step (long tasks resume by completed minute), with no duplicate data.
- The whole thing is **mobile-friendly** and themed as a dark-glass "research console" over an animated lab backdrop.

---

## Architecture

- **Frontend:** vanilla JS + **Vite** (multi-page: `index.html` experiment, `admin.html` console, `scroll.html` scroll study). No framework; small ES-module helpers for backend, attention, calibration, and scroll metrics.
- **Backend:** **Supabase** — Postgres with row-level security (RLS), researcher roles, atomic RPCs, research export views, and one Edge Function for device ingestion.
- **Data flow:** the participant app writes anonymously (insert-only, RLS-guarded); the console reads via authenticated researcher accounts; devices (Raspberry Pi) upload through a key-guarded Edge Function.
- **Android:** the scroll app is wrapped to an APK with **Capacitor** — same JS, no special permissions.

---

## Project structure

```
frontend/
  index.html              experiment entry (loads the classic-script test modules)
  admin.html              research console entry
  scroll.html             scroll-fatigue study entry
  main.js                 experiment orchestrator (flow, resume, backend bridge)
  consent.js              informed consent, safety screening, camera opt-in
  demographics.js         participant form + validation
  fitts.js typing.js nasatlx.js cognitive.js   the tests
  engagementMonitor.js    per-test app-switch + attention aggregation
  corpus.txt              typing sentences
  style.css               design system + dark-glass theme
  lab-bg.png              animated backdrop photo
  src/lib/                supabaseClient, experimentApi, recordIdentity,
                          attentionTracker (camera ML), calibration
  src/admin/              admin.js + measurement.js + slots.js
  src/scroll/             scroll.js + scrollMetrics.js
backend/supabase/
  schema.sql              full schema (run once on a fresh project)
  migrations/             incremental SQL for existing databases
  seed.sql                researcher-profile template
  SETUP.md EXPORTS.md     detailed backend docs
  functions/device-ingest/   Raspberry Pi ECG Edge Function (+ pi-example.py)
capacitor.config.json     Android wrapper config
scripts/build-app.mjs     prepares the APK web assets
SCROLL_APP.md             scroll app + APK build guide
```

---

## Setup

**Prerequisites:** Node 18+, a free Supabase project, (for the APK) Android Studio.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the database** — in the Supabase **SQL Editor**, paste and run
   `backend/supabase/schema.sql` once. (For an existing database, run the files in
   `backend/supabase/migrations/` instead.) This creates all tables, RLS, RPCs, and
   the researcher export views.

3. **Add your environment file** — create `.env` in the project root:

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

   `.env` is gitignored. Never put the `service_role` or secret keys here.

> Without a `.env`, the app still runs in **CSV / local mode** (data downloads as CSV, nothing uploads) — handy for trying it out.

---

## Running it

```bash
npm run dev
```

| URL | What it is |
|-----|------------|
| `http://127.0.0.1:5173/` | **Home — one link to share.** Choose *Participant* (start the study) or *Researcher / Admin* (the console). |
| `http://127.0.0.1:5173/admin.html` | The research console (also reachable from Home) |
| `http://127.0.0.1:5173/scroll.html` | The scroll-fatigue study |

Other commands:

| Command | Purpose |
|---------|---------|
| `npm run build` | Production build → `dist/` |
| `npm run build:app` | Build + prepare the scroll app's APK assets (`dist-app/`) |
| `npm run preview` | Serve the production build |
| `npm test` | Run unit tests |

---

## Researcher / admin guide

The console (`admin.html`) is read-only over the research data, except for uploading
manual measurements. Access requires a **researcher account**.

### Create the first admin

1. Supabase **Authentication → Users → Add user** (email + password, tick *Auto Confirm*).
2. Grant the admin role in the SQL Editor (looks up the UUID by email):

   ```sql
   insert into public.researcher_profiles (user_id, full_name, role)
   select id, 'Lead Researcher', 'admin'
   from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = excluded.role;
   ```

3. Open `admin.html` and **Sign in**.

> The console also has **Sign up**, but a new account has **no access** until an admin
> grants it (step 2). This prevents open signup from reading study data.

### What the console does

- **Participant IDs** — generate a pool (e.g. prefix `P`, start `1`, count `50` → `P001…P050`), see each code's status (available / assigned / completed / revoked), **Revoke** a withdrawn candidate, **Release** a code back for reuse.
- **Add a measurement** — upload an ECG (heart rate / HRV) or a manual physical result for a candidate.
- **Sessions** — every session with status, protocol, NASA-TLX average. Click one to see its **per-test engagement & attention** (attentive %, look-aways, app-switches) and all **uploaded measurements**.

---

## Day-of data-collection workflow

1. **Before:** in the console, **generate a batch of IDs** and print/hand them out.
2. **Per participant:** give them an ID → they open the app → consent → (optional camera + calibration) → enter the ID (it's claimed; unknown/used IDs are rejected) → complete the 3 blocks.
3. **Manual data:** in the console, upload the participant's **ECG / physical** results (or let a Raspberry Pi auto-upload the ECG).
4. **If someone withdraws:** **Revoke** their ID; **Release** it to reuse the printed code for the next walk-in.
5. **Review:** open each session to check engagement/attention quality and the full results.

---

## The scroll-fatigue app + APK

A standalone, safe (no special permissions) study where the participant scrolls an
in-app feed for **30 / 60 / 120 minutes**. It records how scrolling **changes over time**
(speed-drop %, pause-rise %) plus a before/after tiredness rating.

- **Web:** `npm run dev` → `http://127.0.0.1:5173/scroll.html`
- **Android APK:** see **[SCROLL_APP.md](SCROLL_APP.md)** — in short:

  ```bash
  npm run build:app
  npx cap add android       # first time
  npx cap sync android
  npx cap open android      # then Build > Build APK(s) in Android Studio
  ```

---

## Raspberry Pi ECG upload

A Pi can push an ECG straight to a candidate via the `device-ingest` Edge Function,
authenticated by a device key, inserted server-side with the service role. See
**[backend/supabase/SETUP.md](backend/supabase/SETUP.md)** §12 and
`backend/supabase/functions/device-ingest/` (with `pi-example.py`).

---

## Data model

| Table | Holds |
|-------|-------|
| `studies`, `participants`, `sessions`, `experiment_blocks` | study + session metadata |
| `fitts_trials`, `typing_trials`, `nasa_tlx_responses`, `cognitive_trials`, `physical_fatigue_logs` | per-trial task results |
| `session_events` | protocol deviations (pause, skip, override, withdraw, app-switch, consent, calibration) |
| `engagement_summary` | per-test app-switch + camera-attention validation |
| `manual_measurements` | ECG / manual physical / Raspberry-Pi uploads |
| `participant_slots` | the provided-ID pool (status + revoke/reuse) |
| `scroll_sessions`, `scroll_intervals` | scroll-fatigue study |

Researchers read flat data from the `research_*_export` views. Every result carries a
`record_label` (`candidate_session_block_dataset_seq`) for easy identification.

---

## Privacy & safety

- **Consent first** — nothing starts before informed consent; participants can withdraw at any time.
- **Camera is opt-in** and processed **entirely on-device** — no image or video is ever stored or uploaded, only a looking/not-looking signal.
- **Anonymous IDs** — no names or contact details; data is keyed by a participant code you control.
- **Least privilege** — the public app is insert-only behind RLS; only authenticated researchers read; devices upload through a key-guarded function; secrets never reach the browser.
- **Safety screening** (PAR-Q) gates the physical task, with a cognitive alternative.

---

## What still needs device testing

Built and unit-tested in logic, but they need real hardware/browser to verify and tune:

- **Camera attention + 4-dot calibration** — MediaPipe runs on a real device; the head-pose thresholds and the calibration's gaze mapping need on-device tuning.
- **The Android APK** — builds via Capacitor in Android Studio (not buildable in CI here).
- **Raspberry Pi ingestion** — needs deployment + the device to test end to end.
- **Long scroll sessions** — v1 uploads at the end; very long unattended runs would benefit from live per-minute uploads (a planned enhancement).

---

## Tech stack

Vanilla JS · Vite (multi-page) · Supabase (Postgres + RLS + RPC + Edge Functions) ·
MediaPipe Tasks Vision (on-device face landmarks) · Capacitor (Android APK) ·
`node:test` for unit tests.
