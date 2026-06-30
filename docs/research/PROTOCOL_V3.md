# FatigueIDPro Protocol v3

## Status

Protocol v3 is for supervised pilot validation. Do not describe the software as a validated fatigue detector. Freeze the code and protocol before confirmatory collection, then record the Git commit used for every session.

## Research question

Can within-person changes in pointing, typing, cognitive performance, and scrolling predict contemporaneous subjective sleepiness after controlling for practice, device, and time-on-task?

Primary pilot objectives:

1. Estimate change and variance in interaction metrics across blocks.
2. Test whether pre-task KSS is associated with interaction performance.
3. Check whether cognitive or physical tasks change post-block KSS.
4. Quantify missingness, device effects, interruptions, and measurement reliability.

## Participant flow

1. Informed consent and optional camera choice.
2. Demographics and assigned participant code.
3. Reproducible assignment to one primary task and one fatigue track.
4. For each of three blocks: pre-block KSS; primary task; NASA-TLX; standardized break; fatigue task; post-block KSS.

## Measures

- KSS: current sleepiness, 1-9, collected immediately before and after each block.
- NASA-TLX: subjective workload after the primary task; it is not a fatigue label.
- Fitts: throughput, movement time, and errors after excluding initial target acquisition.
- Typing: standard five-character WPM, character edit distance/error rate, IKI, KSPC, and backspaces.
- Cognitive: congruent/incongruent Stroop plus AX-CPT accuracy, timeout, and reaction time.
- Scroll: full-interval speed, event count, reversals, and inactivity-derived pause count.
- Camera: exploratory head-pose screen-orientation estimate only; never an automatic exclusion.

## Assignment and reproducibility

A cryptographically generated session seed determines the four-condition assignment and task-specific child random streams. Store the seed, protocol snapshot, build ID, and metric versions. Replaying a seed must reproduce the same condition and generated order.

## Confounders to collect or standardize before confirmatory work

- sleep duration and wake time;
- time of day and timezone;
- caffeine/nicotine and medication timing;
- recent exercise and current illness;
- device, input method, browser, viewport, and refresh rate;
- prior task familiarity and accessibility needs.

## Pilot analysis

Use participant-level repeated-measures models rather than treating trials as independent people. Model block/time and KSS continuously, include device/input method as covariates, and report condition interactions as exploratory. Define reaction-time trimming, minimum valid trials, interruption limits, missing-data handling, and exclusion rules before inspecting confirmatory outcomes.

## Ethics and withdrawal

The repository does not replace institutional ethics review. Configure the institution, contact, retention period, protocol ID, and intended use before enabling participant collection. Withdrawal stops new collection; handling of already-submitted records follows the approved protocol and must be stated accurately.

## Deployment order

1. Review and apply `backend/supabase/migrations/20260628045000_research_readiness_v3.sql`.
2. Configure all `VITE_STUDY_*` variables.
3. Deploy the frontend from a tagged commit.
4. Run the pilot checklist on every supported device class.
5. Export and inspect test records before recruiting participants.
