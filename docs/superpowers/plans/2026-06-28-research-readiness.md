# FatigueIDPro Research Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a versioned, reproducible, research-focused participant experience with corrected metrics, KSS ratings, clearer consent, stronger data provenance, prepared Supabase changes, and improved UI.

**Architecture:** Pure ES modules own protocol randomization, scales, and metric calculations so Node tests exercise the same functions used by the browser. Existing classic task scripts consume these modules through small `window.fatigueResearch` adapters, preserving the current Vite/Supabase architecture. A forward-compatible migration and updated `schema.sql` prepare dedicated research fields without applying anything remotely.

**Tech Stack:** Vanilla JavaScript, Vite, Node test runner, Supabase/Postgres SQL, CSS.

---

### Task 1: Protocol seed and KSS model

**Files:**
- Create: `frontend/src/lib/researchProtocol.js`
- Create: `tests/researchProtocol.test.js`
- Modify: `frontend/index.html`

- [ ] Write failing tests proving identical seeds produce identical condition/stimulus streams, child seeds are stable, and KSS accepts only integers 1-9.
- [ ] Run `node --test --test-isolation=none tests/researchProtocol.test.js` and confirm missing-module failure.
- [ ] Implement `createSeed`, `seededRandom`, `deriveSeed`, `assignCondition`, `validateKss`, and `kssLabel`; expose them as `window.fatigueResearch`.
- [ ] Re-run the focused test and all tests.

### Task 2: Research configuration, consent, and rating flow

**Files:**
- Create: `frontend/src/lib/studyConfig.js`
- Create: `frontend/fatigueScale.js`
- Create: `tests/studyConfig.test.js`
- Modify: `.env.example`
- Modify: `frontend/consent.js`
- Modify: `frontend/main.js`
- Modify: `frontend/index.html`

- [ ] Write failing tests for configuration completeness and participant-safe missing-field messages.
- [ ] Implement environment-backed study metadata with non-secret values only.
- [ ] Make consent fail closed and accurately describe pseudonymous collection, optional camera, retention, contact, discomfort, and withdrawal.
- [ ] Add pre/post-block KSS screens; persist scores, seed, and stage in resume state; save through a dedicated API when available and through `session_events` otherwise.
- [ ] Keep the existing 16-100 eligibility rule.

### Task 3: Correct and version interaction metrics

**Files:**
- Create: `frontend/src/lib/fittsMetrics.js`
- Create: `frontend/src/lib/typingMetrics.js`
- Create: `tests/fittsMetrics.test.js`
- Create: `tests/typingMetrics.test.js`
- Modify: `frontend/fitts.js`
- Modify: `frontend/typing.js`

- [ ] Write failing Fitts tests for movement count, first-acquisition exclusion, throughput, and average movement time.
- [ ] Implement pure Fitts aggregation and update the task to start measured time at the first acquired target, continue after misclicks, use seeded choices, and export the actual block.
- [ ] Write failing typing tests for standard WPM, Levenshtein distance, character error rate, IKI, and KSPC.
- [ ] Implement the typing metrics module and update the task to use deterministic corpus shuffling and version `typing-v3`.

### Task 4: Correct cognitive and scroll generation

**Files:**
- Create: `frontend/src/lib/cognitiveProtocol.js`
- Create: `tests/cognitiveProtocol.test.js`
- Modify: `frontend/cognitive.js`
- Modify: `frontend/src/scroll/scrollMetrics.js`
- Modify: `frontend/src/scroll/scroll.js`
- Create: `tests/scrollMetrics.test.js`

- [ ] Write failing cognitive tests covering congruent/incongruent Stroop generation, AX targets, and AX context reset.
- [ ] Implement deterministic generators; clear stale timers at phase transitions; reset AX state; store battery and phase elapsed time correctly.
- [ ] Write failing scroll tests proving the complete interval is the speed denominator and inactivity contributes pause counts.
- [ ] Implement bounded interval metrics and deterministic feed content with a stored session seed.

### Task 5: Save status, quality rules, and UI refinement

**Files:**
- Modify: `frontend/src/lib/writeQueue.js`
- Modify: `frontend/src/lib/experimentApi.js`
- Modify: `frontend/src/admin/quality.js`
- Modify: `frontend/main.js`
- Modify: `frontend/style.css`
- Modify: `frontend/admin.html`
- Create: `tests/writeQueue.test.js`
- Create: `tests/quality.test.js`

- [ ] Write failing tests for queue summaries, permanent-failure retention, and quality rules that do not use camera estimates as automatic exclusion.
- [ ] Expose saved/queued/offline/error state and stop silently discarding permanent failures.
- [ ] Add an accessible protocol status bar and calmer research copy without changing task geometry or stimulus timing.
- [ ] Improve consent, rating, instruction, completion, focus, contrast, and mobile layouts.

### Task 6: Prepare Supabase schema and compatibility API

**Files:**
- Modify: `backend/supabase/schema.sql`
- Create with Supabase CLI: `backend/supabase/migrations/20260628045000_research_readiness_v3.sql`
- Modify: `backend/supabase/EXPORTS.md`
- Modify: `frontend/src/lib/experimentApi.js`
- Modify: `frontend/src/admin/admin.js`

- [ ] Add `sessions.randomization_seed`, `sessions.protocol_config`, and `sessions.client_build`.
- [ ] Add researcher-protected `fatigue_ratings` plus an anonymous insert policy compatible with the current client, a researcher export, and a unique session/block/stage constraint.
- [ ] Add metric-version fields to derived datasets and session linkage validation for manual measurements.
- [ ] Replace the quality view's multiplying joins with pre-aggregated block and engagement subqueries.
- [ ] Add an API feature-detection fallback so an unapplied migration uses session events without breaking collection.
- [ ] Document but do not deploy the future capability-token ingestion boundary.

### Task 7: Research documentation and verification

**Files:**
- Create: `docs/research/PROTOCOL_V3.md`
- Create: `docs/research/DATA_DICTIONARY.md`
- Create: `docs/research/PILOT_CHECKLIST.md`
- Modify: `README.md`

- [ ] Document hypotheses, confounders, KSS timing, condition assignment, metric definitions, exclusions, missingness, pilot-only status, and deployment order.
- [ ] Run `node --test --test-isolation=none` and require zero failures.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Confirm no `.env` values are printed or committed and no remote Supabase change was attempted.
- [ ] Review `git diff --check` and `git status --short` before handoff.
