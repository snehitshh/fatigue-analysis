# Model Comparison Study - FatigueSet (Phase P0 benchmark)

Dataset: `dl-model/data/fatigueset_final.csv` (677 windows, 12 subjects, 3 sessions/subject).
Target: `label` (physical fatigue rating, continuous 0-100).
Validation: Leave-One-Subject-Out cross-validation (12 folds) - no subject's data appears in both train and test in any fold, so results reflect generalisation to a NEW person, not memorisation of a known one.

## Results (sorted by MAE, lower is better)

| Model | MAE | RMSE | R2 |
|---|---|---|---|
| SVR (RBF) | 13.67 +/- 6.17 | 16.48 +/- 6.23 | -4.136 +/- 12.352 |
| Ridge | 14.20 +/- 7.74 | 16.64 +/- 7.44 | -4.421 +/- 10.763 |
| Linear Regression | 14.22 +/- 7.79 | 16.67 +/- 7.48 | -4.447 +/- 10.803 |
| XGBoost | 14.90 +/- 7.43 | 17.98 +/- 7.37 | -5.832 +/- 16.313 |
| HistGradientBoosting | 15.09 +/- 6.94 | 18.07 +/- 6.70 | -5.343 +/- 14.640 |
| KNN (k=5) | 15.44 +/- 4.67 | 18.53 +/- 5.25 | -4.268 +/- 10.612 |
| Dummy (mean) | 15.45 +/- 5.25 | 18.29 +/- 5.47 | -2.768 +/- 6.345 |
| Random Forest | 15.48 +/- 8.94 | 18.14 +/- 8.93 | -7.567 +/- 22.845 |

**Best on this benchmark: SVR (RBF)** (MAE 13.67). The Dummy (mean) row is the naive baseline any real model must beat.

## Interpretation

Even the Dummy (predict-the-population-mean) baseline scores R2 = -2.77 (negative) under Leave-One-Subject-Out. A negative R2 here does NOT mean the code is wrong - it means each held-out subject's fatigue level sits far from the population mean learned from the other 11, i.e. **fatigue baselines vary a lot between people**. All models land close to the Dummy baseline, so with only 12 subjects, a population-level model struggles to generalise to an unseen person from raw HR/HRV values alone.

This is a genuine, useful finding for the study, not a failure:
- **Recommendation 1**: normalise the label and/or features per subject (e.g. z-score against that subject's own baseline session) before pooling across subjects.
- **Recommendation 2**: this is exactly why P2 (training on OUR data) matters - our protocol collects a KSS/Borg/NASA baseline for every participant, enabling per-person calibration that FatigueSet's public data doesn't provide.
- **Recommendation 3**: more subjects (combining datasets per modality, per the roadmap) should reduce this variance and give the population model more to generalise from.

## Notes
- Features: hr, rmssd, sdnn, lf_hf (median-imputed where missing - 30s windows),
  sss_pretask, gvas_sleepy, intensity_level (one-hot).
- This is the P0 classic-ML benchmark from docs/DL_MODEL_ROADMAP.md - the bar a
  later lightweight deep model (P1) must beat on the same subjects/split.
- Only ECG/HRV features are used here (FatigueSet's parsed modality). Other
  datasets (EMG, video) get their own per-modality comparison the same way.