# Phase P1 deep model vs P0 benchmark - emg_mendeley

480 windows, 30 subjects. Target: rep-ordinal fatigue proxy (0=fresh .. 1=most fatigued rep in the set).
Same Leave-One-Subject-Out protocol as the P0 classic-ML benchmark.

| Model | MAE | RMSE | R2 |
|---|---|---|---|
| Best classic (P0): Random Forest | 0.274 | 0.328 | 0.212 |
| MLP (PyTorch, P1) | 0.301 +/- 0.026 | 0.352 +/- 0.031 | 0.099 +/- 0.162 |

The classic P0 benchmark still wins on this modality - expected at this sample size; deep models need more data than a few hundred rows to out-perform tree ensembles / linear models. Revisit once our own collected data is added (P2).