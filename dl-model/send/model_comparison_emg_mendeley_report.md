# Model Comparison Study - emg_mendeley (Phase P0 benchmark)

480 windows, 30 subjects. Target: rep-ordinal fatigue proxy (0=fresh .. 1=most fatigued rep in the set).
Validation: Leave-One-Subject-Out cross-validation - no subject's data appears in both train and test in any fold, so results reflect generalisation to a NEW person, not memorisation of a known one.

## Results (sorted by MAE, lower is better)

| Model | MAE | RMSE | R2 |
|---|---|---|---|
| Random Forest | 0.274 +/- 0.044 | 0.328 +/- 0.046 | 0.212 +/- 0.219 |
| HistGradientBoosting | 0.277 +/- 0.048 | 0.334 +/- 0.052 | 0.177 +/- 0.254 |
| XGBoost | 0.277 +/- 0.050 | 0.338 +/- 0.052 | 0.157 +/- 0.256 |
| KNN (k=5) | 0.290 +/- 0.048 | 0.345 +/- 0.056 | 0.119 +/- 0.288 |
| Ridge | 0.292 +/- 0.034 | 0.344 +/- 0.039 | 0.136 +/- 0.195 |
| Linear Regression | 0.292 +/- 0.034 | 0.344 +/- 0.039 | 0.136 +/- 0.196 |
| SVR (RBF) | 0.296 +/- 0.051 | 0.364 +/- 0.063 | 0.020 +/- 0.342 |
| Dummy (mean) | 0.333 +/- 0.000 | 0.373 +/- 0.000 | 0.000 +/- 0.000 |

**Best on this benchmark: Random Forest** (MAE 0.274).
Dummy (mean) baseline R2 = 0.000 - close to 0, population mean is a reasonable per-subject predictor here.