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

## Not doing now
Training, hyperparameter search, and the advanced DL architecture — deferred until the
data pipeline is collecting and the DL requirements are clarified.
