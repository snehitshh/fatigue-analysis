# dl-model — Fatigue model (Phase P0: benchmark)

Plan: `docs/DL_MODEL_ROADMAP.md`. This folder holds the model side; dataset
parsing/features live in the teammate's pipeline (currently
[fatigueset_parser_v1](https://github.com/Shuchih-Negi/fatigueset_parser_v1) for
FatigueSet), whose output `.csv` is copied into `data/`.

## Run

```
pip install -r requirements.txt
python train_baselines.py
```

Writes `results/model_comparison.csv` and `results/model_comparison_report.md`.

## What this does
Trains 7-8 classic regressors (Dummy, Linear/Ridge, KNN, SVR, Random Forest,
HistGradientBoosting, XGBoost) to predict the FatigueSet physical-fatigue label
from HR/HRV features, validated with **Leave-One-Subject-Out** CV (12 folds — a
subject's data is never in both train and test). This sets the classic-ML
benchmark bar (P0) a later lightweight deep model (P1) must beat.

## Current result (see results/model_comparison_report.md for full write-up)
All models land close to the Dummy baseline; even Dummy scores negative R² under
LOSO. That means fatigue baselines vary a lot **between subjects** — not a bug.
Implication: per-subject calibration (our own protocol collects a baseline
KSS/Borg/NASA per participant) matters more than model choice at this sample size.

## Next
- Add per-modality comparisons as more datasets are parsed (EMG, video).
- P1: a small quantised model once the benchmark + our own data collection are ready.
