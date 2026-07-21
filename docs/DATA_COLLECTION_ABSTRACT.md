# Participant Data Collection — Abstract

Examining Real-Time Fatigue Through Interaction Analysis — Center of
Excellence in Data Science and AI, TIET Patiala

## Purpose

This document summarises every category of data collected from a participant
by the FatigueIDPro platform, in plain terms, verified directly against the
live database schema (not from memory) so it is accurate as of this date.

## 1. Identity and registration

- **Email** (required) — used only to auto-issue a unique participant ID and
  to prevent the same person registering twice. Stored in a separate,
  admin-only table, never joined to research data by anyone but an admin.
- **Full name and phone** (optional) — same separate, admin-only table.
- **Auto-issued participant ID** (e.g. `FP-A1B2C3`) — this pseudonymous code,
  not the participant's name or email, is what every research record is
  tagged with.

## 2. Consent and study context

- A record that informed consent was given, with a timestamp and the protocol
  version shown.
- The study details shown to the participant (institution, protocol ID, data
  retention period, contact) at the time of consent.
- If the physical-fatigue track applies: their answers to the physical
  activity safety screening (PAR-Q style) and its outcome.

## 3. Demographics

Age, gender, primary input device (mouse / trackpad / touchscreen / other),
dominant hand, and eye correction status (normal / glasses / contacts /
uncorrected).

## 4. Device and session context

Browser/device type, screen size and pixel ratio, platform, a session
identifier, the randomisation seed that determined their task order, and the
software build version. This is technical context for analysis, not personal
identification.

## 5. Camera and attention data (optional, separately consented)

The camera is entirely opt-in and asked about separately from the main
consent. If enabled:

- **On-device attention signal**: only a "looking at the screen" percentage
  and a look-away count per task — computed on the participant's own device.
  No video is analysed off-device for this signal.
- **4-dot calibration**: the screen-tap coordinates and head-angle (yaw/pitch)
  at each of the four screen corners, used to adapt the attention threshold to
  that person's screen and seating distance.
- **App-switch / tab-away tracking**: how many times and for how long the
  participant left the browser tab during a task.
- **Low-resolution photo snapshots** (only if the participant separately ticks
  a photo-capture consent box): four labelled photos taken during the 4-dot
  calibration, plus one roughly every 15 seconds during the test. Stored in a
  private file storage area readable only by an admin. This can be turned off
  platform-wide with a single setting, with no effect on the numeric attention
  signal above.

## 6. Self-report questionnaires

Collected at four points per session (once before any task, and after each of
the three main task rounds):

- **NASA-TLX** — six workload ratings (mental demand, physical demand,
  temporal demand, performance, effort, frustration), each 1-20.
- **Borg CR10** — a single perceived-exertion rating, 0-10.

Collected at two points per session (the very first and very last
questionnaire only):

- **KSS (Karolinska Sleepiness Scale)** — a single sleepiness rating, 1-9,
  giving a start-of-session and end-of-session sleepiness comparison.

## 7. Task performance data

One of two "base" tasks is assigned per session:

- **Fitts' Law (pointing)**: target size and distance, movement time, click
  accuracy/error, and throughput per trial. Numeric performance only.
- **Typing**: the fixed prompt sentence shown and what the participant typed
  in response, plus derived typing speed (WPM), error rate, inter-key timing,
  and backspace count. The prompts are fixed, neutral, non-personal sentences
  (not the participant's own free-form writing).

One of two "fatigue" tasks is assigned per session:

- **Cognitive (Stroop / AX-CPT)**: the stimulus shown, the participant's
  response, whether it was correct, reaction time, and whether they timed
  out. The stimuli are fixed words/colours/letters defined by the task, not
  personal content.
- **Physical**: active duration, paused duration, number of pauses, and
  whether the protocol was completed — timing/completion data about a
  researcher-approved light movement protocol, not biometric data itself
  (see Section 8 for the physiological reading of this).

## 8. Physiological / device measurements

When applicable, a researcher enters ECG readings (heart rate, HRV, and any
additional values a device provides) for a participant, tagged to the exact
session and task block it was recorded during — either from the project's
Raspberry Pi sensor or, going forward, from a lab-grade ECG device used in
parallel with the software test.

## 9. Session event log

A timestamped internal log of protocol milestones (consent given, calibration
completed, each rating recorded, a break skipped, the session completed or
withdrawn) — used to confirm data integrity and reconstruct the session
timeline, not to capture additional personal content.

## 10. Withdrawal

A participant may withdraw at any time; this stops all further collection for
that session and the session is marked accordingly. Already-collected data is
handled under the retention policy stated at consent.

## 11. Planned, not yet active: phone-use study

A separate, optional study (on hold, not currently collecting data) is
designed to record — via a dedicated Android app, once built — which apps a
participant uses, for how long, how often they are opened, and how much
scrolling occurs, without recording any content viewed. Listed here for
completeness since it is part of the platform's data model.

## 12. What is explicitly NOT collected

- No raw or recorded video/audio — only the derived numeric attention signal
  described in Section 5, plus optional low-resolution still photos if
  separately consented.
- No content typed outside the fixed task prompts (no free-form personal
  writing, messages, or files).
- No browsing history, no data from outside the study session.
- No participant name/email is ever attached to a research record — only the
  separate, admin-only contacts table (Section 1) holds that link.

## 13. Where this lives and who can see it

All data is stored in a single database with row-level security: the
participant's device can only ever insert its own data, never read anyone
else's; only an approved, admin-authorised researcher account can read
research data; contact details and camera images are further restricted to
admin accounts only. Every data export and every access-approval decision is
recorded in an append-only audit log.
