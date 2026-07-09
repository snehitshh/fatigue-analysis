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

## Labels per dataset (each modality keeps its own useful label)

We do NOT force one label across datasets. Each dataset type provides the label that
suits its signal; we train a model per modality from those, and our own collected data
is a NEW multimodal type that carries every label and ties them together.

| Dataset | Signals | Label we use | What it teaches the model |
|---|---|---|---|
| DROZY | ECG, EEG, EOG, EMG, NIR video | KSS sleepiness (1-9), PVT lapses | physiology + face -> sleepiness |
| FatigueSet | ECG, PPG, EEG, GSR, ST, ACC | mental-fatigue self-report | wearable signals -> mental fatigue |
| Fatigue-Characterization (MR) | EEG, ECG, EDA, SpO2, resp, temp | fatigue state | multimodal physiology -> fatigue |
| MEFAR | EEG, HR, PPG, GSR, ST, ACC | occupational mental fatigue | office / mental fatigue |
| UL-DD | RGB/IR/3D video + SpO2, BVP, HR, ST | drowsy vs alert | face + physiology -> drowsiness |
| UTA-RLDD | RGB webcam video | alert / low-vigilant / drowsy | webcam face -> drowsiness (matches our camera) |
| NTHU-DDD | IR video | drowsy/not + blink, yawn, eye, head | facial micro-signs of drowsiness |
| Mendeley EMG (biceps/triceps) | sEMG | muscle fatigue (MDF/MNF decline; fatigued vs rested) | EMG spectral shift -> muscle fatigue |
| Handgrip force-time | grip force | fatigue index / endurance decline | force decline -> physical fatigue |
| MIMIC-III | ECG, ABP (BP), PPG, SpO2, resp | none (not fatigue-labelled) | pretraining + signal-quality; BP/SpO2 baselines |
| Our data (NEW) | Typing/Pointing, Stroop, grip + ECG + EMG | KSS, Borg CR10, NASA-TLX, performance drift | the target multimodal set with all labels |

**How they combine**
- Per-modality models: an ECG/HRV model (DROZY, FatigueSet, MIMIC), an EMG model
  (Mendeley EMG, grip), a face/video model (UTA-RLDD, NTHU, UL-DD, DROZY).
- Our own sessions are the multimodal **fusion + validation** set - they have every
  modality plus KSS/Borg/NASA, so they fuse the per-modality models and calibrate them
  to our own subjective + behavioural labels.
- A derived `data_quality` (valid/artefact) label runs on every signal for live
  verification during collection.

## Not doing now
Training, hyperparameter search, and the advanced DL architecture — deferred until the
data pipeline is collecting and the DL requirements are clarified.
