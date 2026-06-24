#!/usr/bin/env python3
"""
Generate the two hand-over Word documents for FatigueIDPro:

  FatigueIDPro_User_Guide.docx   - how to set up, operate, and run sessions
  FatigueIDPro_Features.docx     - every feature and how it helps the research

Re-run after changes to keep them current:  python scripts/make-docs.py
Requires: pip install python-docx
"""
from docx import Document
from docx.shared import Pt, RGBColor

ROOT = "e:/Data-center/fatigue-analysis"
BLUE = RGBColor(0x1E, 0x40, 0xAF)


def build(path, blocks):
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for kind, text in blocks:
        if kind == "title":
            h = doc.add_heading(text, level=0)
        elif kind == "h1":
            h = doc.add_heading(text, level=1)
            for r in h.runs:
                r.font.color.rgb = BLUE
        elif kind == "h2":
            doc.add_heading(text, level=2)
        elif kind == "b":
            doc.add_paragraph(text, style="List Bullet")
        elif kind == "n":
            doc.add_paragraph(text, style="List Number")
        else:
            doc.add_paragraph(text)
    doc.save(path)
    print("wrote", path)


# ---------------------------------------------------------------- USER GUIDE
user_guide = [
    ("title", "FatigueIDPro — User Guide"),
    ("p", "FatigueIDPro is a research platform that measures fatigue from how a person "
          "interacts with a device. This guide explains how to set it up, run a "
          "data-collection session, and review the results."),

    ("h1", "1. What you need"),
    ("b", "A free Supabase project (the database)."),
    ("b", "The app — run locally (npm) or hosted at a URL you deploy."),
    ("b", "A researcher (admin) account to use the console."),
    ("b", "Participant IDs you generate in the console before a session."),

    ("h1", "2. One-time setup"),
    ("n", "In Supabase, open the SQL Editor and run the file backend/supabase/schema.sql once. "
          "This creates all tables, security rules, and views."),
    ("n", "Create a file named .env in the project folder with your Supabase URL and anon key "
          "(VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)."),
    ("n", "Create your admin account: in Supabase, Authentication > Users > Add user. Then in the "
          "SQL Editor, run seed.sql with that user's email to grant the admin role."),
    ("p", "Without a .env the app still runs, but it saves data as local CSV files instead of the database."),

    ("h1", "3. Running the apps"),
    ("p", "Start the app (npm run dev). There is one link to share — the home page asks whether the "
          "person is a Participant or a Researcher:"),
    ("b", "/  — Home: choose 'I'm a Participant' (start the study) or 'Researcher / Admin' (the console)."),
    ("b", "/scroll.html  — the scroll-fatigue study."),

    ("h1", "4. Before a data-collection day"),
    ("n", "Sign in to the console (/admin.html)."),
    ("n", "In the Participant IDs card, generate a batch (for example prefix P, start 1, count 50 "
          "to make P001 to P050)."),
    ("n", "Print or write down the IDs to hand to participants."),

    ("h1", "5. Running a participant session"),
    ("n", "Open the link on their device and tap 'I'm a Participant'. Give them their ID."),
    ("n", "They read and agree to the consent screen."),
    ("n", "They can optionally enable the camera (attention check). If they do, a quick 4-dot "
          "calibration appears — they tap each glowing dot."),
    ("n", "They enter their assigned ID. An unknown or already-used ID is rejected."),
    ("n", "They complete three blocks of tasks (a tapping or typing task, a workload rating, a "
          "rest break, and a cognitive or physical task)."),
    ("n", "At the end they see a completion summary."),
    ("p", "Notes: a Withdraw button is always available. If the page is refreshed or the connection "
          "drops, the session resumes exactly where it left off, and any data that could not upload "
          "is retried automatically — nothing is lost."),

    ("h1", "6. Uploading manual measurements (ECG / physical)"),
    ("n", "In the console, use the Add a measurement card."),
    ("n", "Choose the candidate's ID, pick ECG or Physical, enter the values, and upload."),
    ("p", "They appear in that candidate's session detail. A Raspberry Pi can also upload ECG "
          "automatically (see the SETUP document)."),

    ("h1", "7. Reviewing results and data quality"),
    ("b", "Data quality card: a go/no-go flag per candidate — Good, Review (low attention or many "
          "app-switches), or Incomplete."),
    ("b", "Sessions list: click any session to see its per-test results, attention validation, and "
          "uploaded measurements."),
    ("b", "Export data: download any dataset (or all of them) as CSV from the Export data card, to "
          "open in Excel, Python (pandas), or R."),

    ("h1", "8. If a participant withdraws"),
    ("n", "In the Participant IDs card, click Revoke on their code."),
    ("n", "Click Release to free the code so the same printed ID can be reused by the next person."),

    ("h1", "9. The scroll study"),
    ("p", "Open /scroll.html (web) or install the Android app (see the SCROLL_APP guide). The "
          "participant enters their ID, chooses a duration (30, 60, or 120 minutes), and scrolls a "
          "feed. It measures how their scrolling changes as they tire."),

    ("h1", "10. Troubleshooting"),
    ("b", "'ID not recognised / already used': generate the ID in the console first, or Release it "
          "if it was used before."),
    ("b", "'Can't sign in to the console': make sure the account has a researcher_profiles row "
          "(step 2.3)."),
    ("b", "'Nothing is saving': check the .env values and that schema.sql has been run."),
]

# ------------------------------------------------------------- FEATURES DOC
features = [
    ("title", "FatigueIDPro — Features and How They Help"),
    ("p", "This document explains each part of FatigueIDPro and why it matters for collecting "
          "reliable fatigue-research data."),

    ("h1", "Interaction tasks"),
    ("p", "Fitts tapping, typing, NASA-TLX workload, a cognitive battery (Stroop and AX-CPT), and a "
          "physical task, run across three blocks."),
    ("b", "How it helps: fatigue shows up as performance change over time — slower, less accurate, "
          "more variable. Capturing many fine-grained measures gives a rich signal for analysis "
          "and machine learning."),

    ("h1", "Randomized assignment"),
    ("p", "Each session is randomly assigned one primary task and one fatigue task."),
    ("b", "How it helps: prevents selection bias and keeps the study design balanced."),

    ("h1", "Consent, safety screening, and withdrawal"),
    ("p", "Informed consent up front, a physical-activity safety check, and a Withdraw button."),
    ("b", "How it helps: responsible, ethics-aligned research, and a clear record of who agreed and "
          "who withdrew."),

    ("h1", "Mobile-friendly, measurement-safe design"),
    ("p", "Every task works on phones, tablets, and desktops; the tapping arena scales to the real "
          "screen and the cognitive stimulus appears instantly."),
    ("b", "How it helps: more participants can take part, and the measurements stay valid and "
          "comparable across devices."),

    ("h1", "Session resume and offline write-queue"),
    ("p", "A refresh or dropped connection restores the exact step; any data that fails to upload is "
          "parked and retried automatically."),
    ("b", "How it helps: no participant has to start over, and no data point is lost on unreliable "
          "venue Wi-Fi."),

    ("h1", "Session finalization"),
    ("p", "Sessions are marked completed or abandoned with a timestamp."),
    ("b", "How it helps: analysts can filter for sessions that genuinely finished instead of guessing."),

    ("h1", "Engagement and attention validation"),
    ("p", "Each task records whether the participant left the app (app-switches and time away), and "
          "— if they opt in — an on-device camera check of whether they were looking at the screen, "
          "refined by a 4-dot calibration. Only derived numbers are stored, never any image."),
    ("b", "How it helps: you can trust each measurement, and flag or exclude sessions where the "
          "person was distracted or away."),

    ("h1", "Participant ID pool"),
    ("p", "Researchers pre-generate IDs; the app accepts only valid, unused codes; withdrawn codes "
          "can be released and reused."),
    ("b", "How it helps: clean, controlled participant identity with no clashes, and easy reuse of "
          "printed IDs on a busy day."),

    ("h1", "Manual and device measurements (ECG / physical / Raspberry Pi)"),
    ("p", "Researchers upload ECG or manual physical results per candidate; a Raspberry Pi can push "
          "ECG automatically."),
    ("b", "How it helps: combines objective physiological data with the behavioural measures for a "
          "fuller picture of fatigue."),

    ("h1", "Research console with data-quality view"),
    ("p", "An authenticated console to manage IDs, review every candidate, upload measurements, and "
          "see a per-session go/no-go quality flag."),
    ("b", "How it helps: fast monitoring during collection and a quick way to decide which data to "
          "keep."),

    ("h1", "Scroll-fatigue study (web + Android app)"),
    ("p", "A standalone, safe study where the participant scrolls an in-app feed for a chosen "
          "duration; it measures how scrolling slows and pauses lengthen."),
    ("b", "How it helps: captures fatigue from natural, everyday scrolling, on the phone or laptop."),

    ("h1", "One-click CSV export"),
    ("p", "Download any dataset, or all of them, as CSV from the console."),
    ("b", "How it helps: the data goes straight into Excel, pandas, or R for analysis — no manual "
          "database queries."),

    ("h1", "Secure, centralized data"),
    ("p", "All data lives in one Supabase database with row-level security: the public app can only "
          "insert, only authenticated researchers can read, and devices upload through a key-guarded "
          "function."),
    ("b", "How it helps: no fragile manual file collection, and participant data is protected by "
          "least-privilege access."),
]

build(ROOT + "/FatigueIDPro_User_Guide.docx", user_guide)
build(ROOT + "/FatigueIDPro_Features.docx", features)
