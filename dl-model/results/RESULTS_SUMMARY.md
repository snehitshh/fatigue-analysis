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

## 3. Team contribution — the FatigueSet pipeline and how it was continued

The ECG/HRV dataset used below (FatigueSet) was prepared by a teammate, not
built from scratch by the modelling side of the project. Splitting the work
this way — one person preparing datasets, the other building the model — let
both move in parallel instead of the model waiting on data collection.

**What the teammate built** ([fatigueset_parser_v1](https://github.com/Shuchih-Negi/fatigueset_parser_v1),
public repo): a complete pipeline for the FatigueSet dataset —

- Downloaded the raw dataset (ECG waveform + RR intervals, per subject/session).
- **Task-aligned windowing**: sliced each recording into windows using the
  experiment's own task-block markers rather than fixed wall-clock time, so no
  window straddles a transition between tasks.
- **HRV feature extraction**: heart rate, RMSSD, SDNN, LF/HF, plus a
  `data_quality` flag, per window.
- **Label join**: matched each window to its corresponding physical/mental
  fatigue self-report from the study, with a documented fallback.
- Combined all 12 subjects into one final, labelled dataset (`fatigueset_final.csv`,
  677 windows) ready for model training.

**Review and feedback given**: the pipeline was reviewed and the pattern
approved as the template for other datasets. Two corrections were requested and
incorporated: (1) LF/HF (a frequency-domain HRV measure) is unreliable on
30-second windows — it needs roughly two minutes of data — so a
`lf_hf_low_confidence` flag was added rather than reporting an unreliable
number silently; (2) an EDA notebook was added to check label distributions and
missing data per subject.

**How the model side continued from there**:

- The teammate's finished `fatigueset_final.csv` was used as-is as the ECG/HRV
  modality's training data (Section 5 below).
- The exact same pipeline pattern (parser → per-modality feature extractor →
  one unified final CSV) was replicated independently for a second,
  freely-downloadable dataset (Mendeley EMG, 30 subjects), following the same
  final-CSV column schema the teammate established, so a second modality was
  ready immediately rather than waiting, and both datasets stay directly
  comparable.
- The model side — the classic-ML benchmark (Phase P0), the PyTorch deep model
  (Phase P1), the data-quality verification model, the fine-tuning mechanism,
  and the local test console — was built end-to-end and evaluated on both the
  teammate's ECG data and the newly-added EMG data.

**Going forward**: the teammate continues parsing additional public datasets
(a video/PERCLOS dataset is next) following this same established pattern; the
model side continues refining the benchmark and will fine-tune on our own
collected data (Phase P2) once real sessions exist.

## 4. Datasets used

| Modality | Dataset | Subjects | Windows | Label |
|---|---|---|---|---|
| ECG / HRV | FatigueSet | 12 | 677 | physical fatigue rating (0–100, self-reported) |
| EMG | Mendeley "EMG for Muscle Fatigue in Biceps and Triceps" (DOI 10.17632/8j2p29hnbv.1) | 30 | 480 | rep-ordinal fatigue proxy (rep 1 = fresh .. rep 4 = most fatigued) |

Each dataset keeps its own label — we do not force a single common label across
datasets (see roadmap §2 for the reasoning).

## 5. Method

- **Phase P0** — classic ML baselines (Linear/Ridge Regression, KNN, SVR,
  Random Forest, HistGradientBoosting, XGBoost) per modality.
- **Phase P1** — a small PyTorch MLP per modality (not a CNN: the parsers
  produce engineered per-window features, not raw waveform, so there is
  nothing for a convolution to operate over yet).
- **Validation** — Leave-One-Subject-Out cross-validation throughout: a
  subject's data is never in both train and test in the same fold, so results
  measure generalisation to a genuinely new person.

## 6. Understanding the fatigue scale (what the predicted number means)

The model outputs a number on the *scale of whichever dataset it was trained
on* — we do not force one universal fatigue scale (see §4). Right now, since
the model has only seen public data, its output should be read against that
data's own scale, not directly against our own questionnaires:

- **ECG (FatigueSet) model** — outputs a number on a **0–100 continuous
  scale**: 0 = no fatigue at all, 100 = maximum fatigue, exactly as the
  original study's participants self-rated their own physical fatigue. A
  prediction of e.g. 12 reads as low fatigue; 70 reads as high fatigue.
- **EMG (Mendeley) model** — outputs a number on a **0–1 scale**: 0 =
  the first, freshest repetition in a 4-repetition set; 1 = the last, most
  fatigued repetition. We also derive a simplified 3-level reading from this:
  0–0.33 = low, 0.33–0.67 = moderate, 0.67–1 = high.
- **Our own platform's questionnaires** (a separate thing — these are what
  *participants* report during our sessions, not what the model currently
  predicts): **KSS** 1 (extremely alert) – 9 (extremely sleepy), captured at
  the start and end of a session; **Borg CR10** 0 (nothing at all) – 10
  (maximal exertion), captured at all four questionnaire points; **NASA-TLX**
  six sub-scales each 1–20, averaged for an overall workload score.

**Important caveat**: the model's current output is not yet calibrated to our
own KSS/Borg/NASA-TLX scales, because it has never been trained on our data.
That calibration is exactly what Phase P2 does — once the model is fine-tuned
on our own sessions, its predicted number will map onto our actual
questionnaire scale, making "the model says X" directly comparable to "the
participant said Y on the KSS."

## 7. Results — all models compared, per modality

Every model evaluated, both phases together in one table, sorted by MAE
(lower is better). Same Leave-One-Subject-Out validation throughout, so every
row is directly comparable. The deep model (Phase P1) is marked.

**ECG (FatigueSet, 12 subjects) — target: 0–100 fatigue rating**

| Model | Phase | MAE | RMSE | R² |
|---|---|---|---|---|
| SVR (RBF) | P0 classic | 13.67 | 16.49 | -4.18 |
| Ridge | P0 classic | 14.20 | 16.64 | -4.42 |
| Linear Regression | P0 classic | 14.22 | 16.67 | -4.45 |
| XGBoost | P0 classic | 14.90 | 17.98 | -5.83 |
| HistGradientBoosting | P0 classic | 15.09 | 18.07 | -5.34 |
| KNN (k=5) | P0 classic | 15.44 | 18.53 | -4.27 |
| Dummy (mean baseline) | P0 classic | 15.45 | 18.29 | -2.77 |
| Random Forest | P0 classic | 15.48 | 18.14 | -7.57 |
| **MLP (PyTorch)** | **P1 deep learning** | **17.86** | **21.40** | **-1.75** |

**EMG (Mendeley, 30 subjects) — target: 0–1 fatigue proxy**

| Model | Phase | MAE | RMSE | R² |
|---|---|---|---|---|
| Random Forest | P0 classic | 0.274 | 0.328 | 0.212 |
| HistGradientBoosting | P0 classic | 0.277 | 0.334 | 0.177 |
| XGBoost | P0 classic | 0.277 | 0.338 | 0.157 |
| KNN (k=5) | P0 classic | 0.290 | 0.345 | 0.119 |
| Ridge | P0 classic | 0.292 | 0.344 | 0.136 |
| Linear Regression | P0 classic | 0.292 | 0.344 | 0.136 |
| SVR (RBF) | P0 classic | 0.296 | 0.364 | 0.020 |
| Dummy (mean baseline) | P0 classic | 0.333 | 0.373 | 0.000 |
| **MLP (PyTorch)** | **P1 deep learning** | **0.301** | **0.352** | **0.099** |

On ECG, the deep model ranks last of all 8 — the clearest illustration that a
from-scratch deep network needs more than 677 rows/12 subjects to compete with
classic methods. On EMG, it ranks 7th of 8 (ahead of only Dummy and SVR),
closer to the pack but still not the best choice at this sample size.

## 8. Interpretation

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

## 9. Also built: the data-quality verification model

A separate, unsupervised model (IsolationForest, one per modality) scores
whether a new incoming reading looks physiologically plausible — e.g. it
correctly flags an implausible reading (heart rate of 2 bpm) while accepting a
normal one (heart rate of 75 bpm). This is the mechanism intended to catch bad
electrode contact, motion artefact, or sensor faults live during our own data
collection, rather than discovering the problem during analysis.

## 10. A local test console, and where the trained models are saved

The trained model weights (both PyTorch MLPs, their preprocessors, and both
IsolationForest quality-verification models) are saved in
`dl-model/models/checkpoints/` and committed to the project repository (about
4.4 MB total) — not just produced locally and discarded. Anyone with the repo
has the actual trained models without needing to re-run training.

A small internal tool (Flask API + a plain HTML page, `dl-model/api.py` +
`dl-model/frontend/index.html`) loads these checkpoints and lets us type in
the same values our platform will collect and see the model's live prediction
and the data-quality verdict, per modality. It also captures any field the
model hasn't been trained on yet (instead of silently ignoring it), so there
is real data to work with once we decide to add a new signal.

## 11. Next steps

1. Collect real sessions on our own platform with all three self-report
   questionnaires (NASA-TLX, Borg CR10, KSS) plus a parallel ECG reading from
   a lab-grade device, tagged to the exact task block it was recorded during.
2. Fine-tune the model on this combined, richer dataset (Phase P2) — the
   mechanism for this (`dl-model/models/finetune.py`) is already built and
   self-tested against a real held-out slice of existing data.
3. Compare the fine-tuned model's fatigue estimate against the independent ECG
   reading for the same session/block — this is the direct test of the
   project's research question.
