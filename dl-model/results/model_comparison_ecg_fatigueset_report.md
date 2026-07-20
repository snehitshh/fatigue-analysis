# Model Comparison Study - ecg_fatigueset (Phase P0 benchmark)

677 windows, 12 subjects. Target: physical fatigue rating (continuous, ~0-100 scale).
Validation: Leave-One-Subject-Out cross-validation - no subject's data appears in both train and test in any fold, so results reflect generalisation to a NEW person, not memorisation of a known one.

## Results (sorted by MAE, lower is better)

| Model | MAE | RMSE | R2 |
|---|---|---|---|
| SVR (RBF) | 13.668 +/- 6.224 | 16.492 +/- 6.288 | -4.177 +/- 12.491 |
| Ridge | 14.199 +/- 7.737 | 16.643 +/- 7.445 | -4.421 +/- 10.763 |
| Linear Regression | 14.224 +/- 7.792 | 16.665 +/- 7.481 | -4.447 +/- 10.803 |
| XGBoost | 14.900 +/- 7.433 | 17.982 +/- 7.373 | -5.832 +/- 16.313 |
| HistGradientBoosting | 15.091 +/- 6.944 | 18.069 +/- 6.703 | -5.343 +/- 14.640 |
| KNN (k=5) | 15.445 +/- 4.668 | 18.526 +/- 5.254 | -4.268 +/- 10.612 |
| Dummy (mean) | 15.446 +/- 5.252 | 18.291 +/- 5.470 | -2.768 +/- 6.345 |
| Random Forest | 15.475 +/- 8.937 | 18.135 +/- 8.928 | -7.567 +/- 22.845 |

**Best on this benchmark: SVR (RBF)** (MAE 13.668).
Dummy (mean) baseline R2 = -2.768 - notably negative, meaning per-subject baselines vary a lot and a population model needs per-subject calibration more than a fancier algorithm.