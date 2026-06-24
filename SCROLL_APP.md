# Scroll-Fatigue App (web + Android APK)

A standalone study that measures fatigue from scrolling. The participant scrolls an
in-app feed for a chosen duration (30 / 60 / 120 min); we record how their scrolling
**changes over time** (it slows and pauses lengthen as they tire) plus a before/after
tiredness rating. Only derived numbers are stored — never what they look at.

It runs the same JS as a **web page** (good for laptop) and as a **safe Android APK**
(via Capacitor — no special permissions, in-app content only).

## What it measures

Per minute (`scroll_intervals`): scroll distance, scroll events, direction reversals,
mean + max speed, pause count. Per session (`scroll_sessions`): totals, **speed-drop %**
and **pause-rise %** (last third vs first third = the fatigue signal), and the start/end
tiredness ratings. Reuses the participant ID pool (claims the entered code) and uploads
to the same Supabase. Researchers read it from `research_scroll_sessions_export` and
`research_scroll_intervals_export`.

Database: run `backend/supabase/migrations/2026-06-24_add_scroll_fatigue.sql` once
(fresh setups get it from `schema.sql`).

## Run on the web (laptop)

```bash
npm run dev
# open http://127.0.0.1:5173/scroll.html
```

## Build the Android APK

Capacitor wraps the built site. The app entry is the scroll page.

```bash
# 1. Build the web assets with scroll.html as the app's index
npm run build:app

# 2. First time only: add the Android platform
npx cap add android

# 3. Copy assets into the native project
npx cap sync android

# 4. Open in Android Studio and build the APK
npx cap open android
#   Android Studio: Build > Build Bundle(s)/APK(s) > Build APK(s)
```

Notes:

- `npm run build:app` writes `dist-app/` (a copy of `dist/` with `scroll.html` as
  `index.html`); `capacitor.config.json` points `webDir` at it.
- The APK needs **no special permissions** — it only shows its own content. Internet
  access (for Supabase upload) is included by default.
- For the app to save data, the build must have `.env` set (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) at `npm run build:app` time. Without it, the app still runs
  and shows the session summary but does not upload.
- The generated `android/` folder is gitignored; re-create it with `npx cap add android`.
