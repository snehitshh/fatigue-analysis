# Phase P1 deep model vs P0 benchmark - ecg_fatigueset

677 windows, 12 subjects. Target: physical fatigue rating (continuous, ~0-100 scale).
Same Leave-One-Subject-Out protocol as the P0 classic-ML benchmark.

| Model | MAE | RMSE | R2 |
|---|---|---|---|
| Best classic (P0): SVR (RBF) | 13.668 | 16.492 | -4.177 |
| MLP (PyTorch, P1) | 17.861 +/- 7.618 | 21.405 +/- 8.894 | -1.755 +/- 1.448 |

The classic P0 benchmark still wins on this modality - expected at this sample size; deep models need more data than a few hundred rows to out-perform tree ensembles / linear models. Revisit once our own collected data is added (P2).