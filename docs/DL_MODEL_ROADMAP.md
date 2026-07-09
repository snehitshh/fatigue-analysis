# Fatigue Model — Roadmap (planning only, no training yet)

Goal: a **lightweight, edge-deployable** fatigue model, benchmarked against public
datasets, then refined on our own collected data. Small enough to run on a
microcontroller (TinyML) — not a large cloud model.

## Phases

**P0 — Benchmark on public data** (standard reference before our data exists)
- Pull 2-3 public datasets (see `FatigueIDPro_Fatigue_Datasets.docx`): e.g. DROZY /
  FatigueSet (ECG/HRV), a public sEMG fatigue set, a webcam set.
- Fixed features first (HR, HRV/RMSSD, reaction-time drift, error-rate drift), a
  couple of classic baselines (logistic regression, gradient-boosted trees), report
  accuracy/F1 as the **benchmark bar**.

**P1 — Lightweight model**
- Small 1D-CNN or tiny temporal model on windowed signals; quantize (int8) and export
  to **TensorFlow Lite Micro / ONNX** for microcontroller deployment.
- Target: fits in tens of KB, runs on-device; matches the P0 benchmark within a margin.

**P2 — Train on OUR data** (once collection is running)
- Same pipeline, our labelled sessions (tasks + NASA-TLX + Borg + KSS + ECG).
- Compare against the P0/P1 benchmark to show our data + model add value.

**P3 — Advanced DL** (you'll clarify)
- Multimodal fusion (behaviour + ECG + questionnaires), sequence models. Deferred.

## What the model is for — beyond "verify data"

1. **Live data-quality check** (the verify use): flag implausible/artefact windows
   during collection — bad electrode contact, motion artefact, a participant not
   actually doing the task. Catch bad data *while* recording, not after.
2. **Real-time fatigue estimate / early warning**: predict fatigue onset from
   physiology + behaviour before the participant self-reports it.
3. **Self-report cross-check**: compare predicted fatigue vs the BORG/KSS/NASA answers
   — a large mismatch flags careless or dishonest responders.
4. **Adaptive protocol**: shorten/stop a block once enough signal is captured, or
   trigger the next task when fatigue is detected — less participant burden.
5. **Sensor fusion / imputation**: fill a dropped ECG window or missing channel from
   the others, so a partial session is still usable.
6. **Standalone edge monitor**: deployed on a microcontroller, a wearable that scores
   fatigue on-device (no cloud) — a product outcome, not just analysis.
7. **Auto-labelling assistant**: pre-label our growing dataset to speed up P3.

## Label schema (training targets)

The public datasets use different native labels (KSS, drowsy/alert classes, exertion,
muscle-fatigue, workload). To use them **all together**, everything maps to one shared
label, with optional auxiliary heads where a dataset provides them.

**Primary target**
- `fatigue_level` — ordinal 3-class: **0 = low / alert, 1 = moderate, 2 = high / fatigued**.
  (Same thing as a continuous `fatigue_score` 0-1 for regression.)

**Auxiliary targets** (multi-task; each dataset supervises only the ones it has, others masked)
- `fatigue_type` — {sleepiness, mental, physical/muscular, drowsiness}
- `sleepiness_score` 0-1 — from KSS / PVT / drowsiness labels
- `exertion_score` 0-1 — from Borg CR10 / grip / EMG
- `workload_score` 0-1 — from NASA-TLX / mental-fatigue self-reports
- `data_quality` — binary valid / artefact (derived from signal checks; powers live verification)

**Dataset → label mapping**

| Dataset | Native label | -> fatigue_level | fatigue_type |
|---|---|---|---|
| DROZY | KSS 1-9 | 1-3 / 4-6 / 7-9 | sleepiness |
| FatigueSet | mental-fatigue self-report | tertiles | mental |
| Fatigue-Characterization (MR) | fatigue score | tertiles | mental |
| MEFAR | occupational mental fatigue | tertiles | mental |
| UL-DD | alert / drowsy | low / high | drowsiness |
| UTA-RLDD | alert / low-vigilant / drowsy | 0 / 1 / 2 direct | drowsiness |
| NTHU-DDD | drowsy / not | high / low | drowsiness |
| Mendeley EMG (biceps/triceps) | contraction fatigue onset | early / mid / late = 0/1/2 | physical |
| Handgrip force-time | fatigue index | thresholds | physical |
| MIMIC-III (BP/SpO2/ECG) | none (not fatigue-labelled) | -- (pretraining + data_quality only) | -- |
| **Our data** | KSS + Borg + NASA + performance drift | KSS/Borg -> level; RT/error drift confirms | all |

Notes: MIMIC has no fatigue label, so it feeds self-supervised pretraining and the
data-quality head only. Our own sessions carry all four self-reports plus behavioural
drift, so they can supervise every head - the richest source once collection runs.

## Not doing now
Training, hyperparameter search, and the advanced DL architecture — deferred until the
data pipeline is collecting and the DL requirements are clarified.
