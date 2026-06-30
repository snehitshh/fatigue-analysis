# FatigueIDPro Research Readiness Design

## Objective

Upgrade FatigueIDPro from a functional pilot into a research-ready data-collection platform without applying changes to the live Supabase project. Repository schema and migration files may change; the researcher will apply them later.

## Scope

The implementation covers five connected areas:

1. Research protocol clarity and reproducible assignment.
2. Validated subjective fatigue ratings around every experiment block.
3. Correct, versioned interaction metrics for Fitts, typing, cognition, and scrolling.
4. Accurate consent, withdrawal, camera, save-status, and data-quality language.
5. Database-ready provenance, exports, session linkage, and safer ingestion contracts.

The existing participant-code workflow, four task combinations, three-block structure, Supabase fallback mode, admin console, and Capacitor scroll application remain available.

## Protocol Flow

The participant flow becomes:

`Consent -> optional camera -> demographics -> seeded condition assignment -> pre-block KSS -> primary task -> NASA-TLX -> rest -> fatigue task -> post-block KSS`

The KSS sequence repeats for all three blocks. Pre-block ratings label the state immediately before the primary interaction task. Post-block ratings provide a manipulation check after the cognitive or physical task.

The current 16+ eligibility rule remains. Condition assignment stays within the existing four combinations, but uses a stored seed so the sequence can be reproduced. Stimulus and content randomization derive deterministic child seeds from the session seed.

## Study Configuration and Consent

Study-facing details live in a central configuration module sourced from Vite environment variables. The participant app requires configured institution, study contact, retention period, and protocol identifier before data collection. Development mode clearly reports missing configuration rather than silently inventing values.

Consent fails closed if its module is unavailable. It explains collection duration, task types, foreseeable discomfort, pseudonymous handling, optional camera processing, retention, sharing, contact, and the actual withdrawal behavior: withdrawal stops new collection while already-submitted data follows the approved retention policy.

## Measurement Modules

Pure, unit-tested modules own calculations and deterministic stimulus generation:

- Fitts: exclude first-target acquisition from measured movement time, divide by actual movements, preserve misclicks without ending a minute, and report the real experiment block in local exports.
- Typing: use standard five-characters-per-word WPM, Levenshtein character error rate, corrected-error counts, and deterministic corpus order. Virtual and physical keyboards remain distinct.
- Cognitive: generate congruent and incongruent Stroop trials, reset AX-CPT context at phase boundaries, cancel stale timers, and distinguish phase elapsed time from full-battery elapsed time.
- Scroll: calculate speed over the complete interval, represent long inactivity as pauses, use deterministic content, and keep early completion and backgrounding visible to quality review.

Every derived metric carries a metric-version identifier in the prepared database schema.

## Camera and Data Quality

Camera output is described as an exploratory head-pose attention estimate. Calibration metadata is retained for device validation but is not presented as gaze calibration. Arbitrary camera thresholds do not automatically classify a session as good or invalid.

Quality summaries use versioned rules and avoid join multiplication. Completion, expected row counts, app visibility, duration, and missing data are primary quality signals; camera values are informational.

## Database Preparation

Repository SQL will add:

- session protocol seed, protocol snapshot, and build identifier;
- a dedicated `fatigue_ratings` table and researcher export;
- metric-version fields on derived datasets;
- stronger session linkage for manual/device measurements;
- corrected session-quality aggregation;
- capability-token scaffolding for future authenticated experiment ingestion.

The frontend remains compatible while the migration is pending by saving fatigue ratings as session events and using current insert APIs. No remote migration, policy change, or deployment is performed in this work.

## Interface Design

The existing dark laboratory visual language remains, with calmer research terminology, improved hierarchy, contrast, spacing, mobile controls, and accessible focus states. A consistent protocol header communicates block, stage, participant context, and save status. Offline or queued writes are visible without interrupting measurements.

Visual changes never resize an active Fitts arena, alter stimulus timing, animate measured stimuli, or change recorded task geometry.

## Error Handling

Participant-facing save states distinguish saved, queued, offline, configuration missing, and permanent failure. Permanent write failures remain available for researcher troubleshooting instead of being silently dropped. Resume snapshots include protocol seed, KSS progress, and task progress.

## Verification

The implementation adds unit tests for protocol seeding, KSS validation, Fitts metrics, typing metrics, cognitive stimulus generation, scroll interval behavior, queue status, and research configuration. Existing tests, production build, and schema consistency checks must pass. Browser/device hardware paths remain pilot-validation requirements.

## Deferred Until Deployment

- Applying the Supabase migration and regenerating live policies.
- Deploying capability-token Edge Functions.
- Hardware validation of camera and Raspberry Pi ECG ingestion.
- Confirmatory sample-size calculation and preregistration after pilot effect estimates.
