# Examining Real-Time Fatigue Through Interaction Analysis — DL Model Progress

Center of Excellence in Data Science and AI, TIET Patiala

## 1. What this covers

This is the current status of the fatigue-detection model side of the project:
what data it's trained on, what we found, and what's next. The full data
collection platform (participant test battery, admin console, Raspberry Pi ECG
pipeline) is a separate, complete deliverable — this document is specifically
about the machine learning model.

## 2. Important: this model is NOT trained on our own collected data yet

Everything below is trained on **public research datasets**, not on data
collected through our own platform. Our own collection currently has close to
zero real participant sessions, so it has contributed nothing to this model
yet. This is intentional — the plan (see `docs/DL_MODEL_ROADMAP.md`) is:

1. **Phase P0/P1 (done, this document)** — benchmark on existing public fatigue
   datasets, so there is a working, testable model and a reference bar *before*
   our own data exists.
2. **Phase P2 (not started)** — once our platform has real sessions (task
   performance + NASA-TLX + Borg CR10 + KSS + a parallel ECG reading from a
   lab-grade device), fine-tune/retrain the model on that data. This is the
   step that actually answers the project's research question — whether
   software interaction alone can reveal fatigue that an independent ECG
   reading also confirms.

## 3. Datasets used

| Modality | Dataset | Subjects | Windows | Label |
|---|---|---|---|---|
| ECG / HRV | FatigueSet | 12 | 677 | physical fatigue rating (0–100, self-reported) |
| EMG | Mendeley "EMG for Muscle Fatigue in Biceps and Triceps" (DOI 10.17632/8j2p29hnbv.1) | 30 | 480 | rep-ordinal fatigue proxy (rep 1 = fresh .. rep 4 = most fatigued) |

Each dataset keeps its own label — we do not force a single common label across
datasets (see roadmap §2 for the reasoning).

## 4. Method

- **Phase P0** — classic ML baselines (Linear/Ridge Regression, KNN, SVR,
  Random Forest, HistGradientBoosting, XGBoost) per modality.
- **Phase P1** — a small PyTorch MLP per modality (not a CNN: the parsers
  produce engineered per-window features, not raw waveform, so there is
  nothing for a convolution to operate over yet).
- **Validation** — Leave-One-Subject-Out cross-validation throughout: a
  subject's data is never in both train and test in the same fold, so results
  measure generalisation to a genuinely new person.

## 5. Results

**ECG (FatigueSet, 12 subjects)**

| Model | MAE | RMSE | R² |
|---|---|---|---|
| Best classic: SVR (RBF) | 13.67 | 16.49 | -4.18 |
| MLP (P1, PyTorch) | 17.86 | 21.41 | -1.76 |

**EMG (Mendeley, 30 subjects)**

| Model | MAE | RMSE | R² |
|---|---|---|---|
| Best classic: Random Forest | 0.274 | 0.328 | **0.212** |
| MLP (P1, PyTorch) | 0.301 | 0.352 | 0.099 |

Full per-model tables are in the accompanying `model_comparison_*_report.md`
and `dl_model_*_report.md` files.

## 6. Interpretation

- **Classic ML currently beats the from-scratch deep model on both
  modalities.** This matches well-established findings on small tabular
  datasets (a few hundred rows) — deep networks need substantially more data
  before they out-perform tree ensembles or kernel methods. Expected at this
  sample size, not a failure of the approach.
- **EMG shows a real, positive signal (R² ≈ 0.21)**: RMS/MAV/waveform-length
  genuinely track muscle fatigue across 30 different people.
- **ECG does not generalise well yet**: even the naive "predict the population
  mean" baseline scores a negative R² under Leave-One-Subject-Out. This means
  fatigue baselines vary a lot *between* people — a population model needs
  per-subject calibration more than a better algorithm at 12 subjects. This is
  exactly why collecting our own data (with a personal baseline for every
  participant, via the KSS/Borg/NASA-TLX questionnaires at the start of each
  session) matters more than further tuning the current model.

## 7. Also built: the data-quality verification model

A separate, unsupervised model (IsolationForest, one per modality) scores
whether a new incoming reading looks physiologically plausible — e.g. it
correctly flags an implausible reading (heart rate of 2 bpm) while accepting a
normal one (heart rate of 75 bpm). This is the mechanism intended to catch bad
electrode contact, motion artefact, or sensor faults live during our own data
collection, rather than discovering the problem during analysis.

## 8. A local test console

A small internal tool (Flask API + a plain HTML page, `dl-model/api.py` +
`dl-model/frontend/index.html`) lets us type in the same values our platform
will collect and see the model's prediction and the data-quality verdict, per
modality. It also captures any field the model hasn't been trained on yet
(instead of silently ignoring it), so there is real data to work with once we
decide to add a new signal.

## 9. Next steps

1. Collect real sessions on our own platform with all three self-report
   questionnaires (NASA-TLX, Borg CR10, KSS) plus a parallel ECG reading from
   a lab-grade device, tagged to the exact task block it was recorded during.
2. Fine-tune the model on this combined, richer dataset (Phase P2) — the
   mechanism for this (`dl-model/models/finetune.py`) is already built and
   self-tested against a real held-out slice of existing data.
3. Compare the fine-tuned model's fatigue estimate against the independent ECG
   reading for the same session/block — this is the direct test of the
   project's research question.
