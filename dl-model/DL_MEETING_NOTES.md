# DL Model — Meeting Notes (for myself)

Quick reference to talk from. Full detail lives in `dl-model/results/RESULTS_SUMMARY.md`.

## 1. What we made

Two working fatigue-prediction models — one per modality (ECG, EMG) — plus a
data-quality checker and a local test console. Trained on **public datasets**,
not our own collected data yet (we have ~zero real sessions so far).

## 2. Datasets

| Modality | Dataset | Subjects | Windows | Label |
|---|---|---|---|---|
| ECG/HRV | FatigueSet (teammate's pipeline) | 12 | 677 | physical fatigue, 0–100 self-rated |
| EMG | Mendeley Biceps/Triceps EMG | 30 | 480 | rep-ordinal fatigue proxy, 0–1 |

Kept separate labels per dataset on purpose — didn't force one common fatigue
scale across modalities (different physiology, different self-report scales).

## 3. How we built it (pipeline)

1. **Parser** — raw dataset → per-window features (teammate built the ECG one,
   we replicated the same pattern for EMG).
2. **Task-aligned windowing** — windows cut at the experiment's own task-block
   markers, not fixed wall-clock time, so no window straddles a task switch.
3. **Phase P0** — classic ML baselines: Linear/Ridge Regression, KNN, SVR,
   Random Forest, HistGradientBoosting, XGBoost, Dummy (mean baseline).
4. **Phase P1** — a small PyTorch MLP per modality. Not a CNN (see alternatives
   below).
5. **Validation** — Leave-One-Subject-Out (LOSO) throughout: a subject's data
   never appears in both train and test in the same fold. Needed because N is
   small (12–30 people) — normal train/test split would leak per-person
   baseline info and look better than it is.
6. **Data-quality model** — separate IsolationForest (unsupervised) per
   modality, flags physiologically implausible readings (e.g. HR of 2 bpm).
7. **Fine-tune scaffold** — ready for Phase P2, loads the saved preprocessor so
   it doesn't refit on a mismatched feature set.
8. **Local test console** — Flask + plain HTML, type in values, see live
   prediction + quality verdict. Logs any field it hasn't seen before.

## 4. Scores — all models, both modalities

**ECG (12 subjects, target 0–100)**

| Model | MAE | RMSE | R² |
|---|---|---|---|
| SVR (RBF) | 13.67 | 16.49 | -4.18 |
| Ridge | 14.20 | 16.64 | -4.42 |
| Linear Regression | 14.22 | 16.67 | -4.45 |
| XGBoost | 14.90 | 17.98 | -5.83 |
| HistGradientBoosting | 15.09 | 18.07 | -5.34 |
| KNN (k=5) | 15.44 | 18.53 | -4.27 |
| Dummy (mean) | 15.45 | 18.29 | -2.77 |
| Random Forest | 15.48 | 18.14 | -7.57 |
| **MLP (PyTorch)** | 17.86 | 21.40 | -1.75 |

**EMG (30 subjects, target 0–1)**

| Model | MAE | RMSE | R² |
|---|---|---|---|
| Random Forest | 0.274 | 0.328 | 0.212 |
| HistGradientBoosting | 0.277 | 0.334 | 0.177 |
| XGBoost | 0.277 | 0.338 | 0.157 |
| KNN (k=5) | 0.290 | 0.345 | 0.119 |
| Ridge | 0.292 | 0.344 | 0.136 |
| Linear Regression | 0.292 | 0.344 | 0.136 |
| SVR (RBF) | 0.296 | 0.364 | 0.020 |
| Dummy (mean) | 0.333 | 0.373 | 0.000 |
| **MLP (PyTorch)** | 0.301 | 0.352 | 0.099 |

**Talking point:** classic ML beats the deep model on both — expected at this
sample size (a few hundred rows), not a failure. EMG shows a real signal (R²
≈ 0.21). ECG doesn't generalize yet — even the dummy baseline goes negative
under LOSO, meaning fatigue baselines vary a lot person-to-person; that's
exactly what our own per-participant KSS/Borg/NASA-TLX baseline is for.

## 5. Alternatives considered — and why we didn't go with them

- **CNN on raw waveform** — not possible yet. Parsers output engineered
  per-window features (RMS, MAV, HRV, etc.), not raw signal, so there's
  nothing for a convolution to operate over. Would need a parser rewrite.
- **RNN/LSTM/Transformer (sequence models)** — deferred. Our data is windowed
  and tabular, not a continuous sequence per subject, and 12–30 subjects is
  too little data for a sequence model to avoid overfitting worse than the
  MLP already does.
- **One common fatigue label across all datasets** — rejected. ECG's 0–100
  self-rated scale and EMG's 0–1 rep-ordinal proxy measure different things;
  forcing one scale would have thrown away information, not simplified it.
- **Frequency-domain EMG features (MDF/MNF)** — skipped. The EMG dataset's
  sampling rate is ambiguous, so a frequency-domain measure couldn't be
  trusted; used time-domain (Hudgins) features instead.
- **LF/HF (frequency-domain HRV) reported at face value** — not dropped, but
  flagged with a `lf_hf_low_confidence` column instead. 30-second windows are
  too short for a reliable LF/HF read (needs ~2 minutes); reporting it
  silently would have been misleading.
- **Scrolling test: ScrollTest vs SART** — picked SART (Sustained Attention to
  Response Task). It's a validated, simple go/no-go paradigm that fits our
  existing Stroop/AX-CPT-style interaction (tap/click, no new permissions);
  ScrollTest was a close second but less established in the literature.

## 6. Where things are saved

- Trained weights: `dl-model/models/checkpoints/` (~4.4 MB, committed to the
  repo — not just produced locally and discarded).
- Full write-up: `dl-model/results/RESULTS_SUMMARY.md`.

## 7. Next step (Phase P2)

Fine-tune on our own collected sessions once real data exists (NASA-TLX +
Borg + KSS + parallel ECG, tagged to the exact task block) — this is the step
that actually answers the research question: does software interaction alone
track fatigue that an independent ECG reading also confirms.
