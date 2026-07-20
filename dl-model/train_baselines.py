"""
Model comparison study - Phase P0 benchmark (see docs/DL_MODEL_ROADMAP.md).

Compares classic ML baselines + gradient-boosted models on the FatigueSet dataset
(fatigueset_parser_v1 output) to set the benchmark bar a later deep model must beat.

Target: `label` (physical fatigue rating, 0-100 continuous scale).
Validation: Leave-One-Subject-Out (LOSO) across the 12 subjects - a subject's data
is never in both train and test, which prevents identity leakage (the model
learning "this is P07" instead of "this is fatigue").

Usage:
    python dl-model/train_baselines.py
Writes: dl-model/results/model_comparison.csv, model_comparison_report.md
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.svm import SVR
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

HERE = Path(__file__).parent
DATA = HERE / "data" / "fatigueset_final.csv"
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)

NUMERIC_FEATURES = ["hr", "rmssd", "sdnn", "lf_hf", "sss_pretask", "gvas_sleepy"]
CATEGORICAL_FEATURES = ["intensity_level"]
TARGET = "label"
GROUP = "subject_id"


def build_pipeline(model):
    pre = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")),
                           ("scale", StandardScaler())]), NUMERIC_FEATURES),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ])
    return Pipeline([("pre", pre), ("model", model)])


MODELS = {
    "Dummy (mean)": DummyRegressor(strategy="mean"),
    "Linear Regression": LinearRegression(),
    "Ridge": Ridge(alpha=1.0),
    "KNN (k=5)": KNeighborsRegressor(n_neighbors=5),
    "SVR (RBF)": SVR(kernel="rbf", C=10, epsilon=1.0),
    "Random Forest": RandomForestRegressor(n_estimators=300, max_depth=6, random_state=42),
    "HistGradientBoosting": HistGradientBoostingRegressor(max_depth=4, random_state=42),
}
try:
    from xgboost import XGBRegressor
    MODELS["XGBoost"] = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                                      subsample=0.8, colsample_bytree=0.8, random_state=42)
except ImportError:
    pass  # ponytail: xgboost optional, sklearn models still give a full comparison


def evaluate(df):
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = df[TARGET].values
    groups = df[GROUP].values
    logo = LeaveOneGroupOut()

    rows = []
    for name, model in MODELS.items():
        fold_mae, fold_rmse, fold_r2 = [], [], []
        for train_idx, test_idx in logo.split(X, y, groups):
            pipe = build_pipeline(model)
            pipe.fit(X.iloc[train_idx], y[train_idx])
            pred = pipe.predict(X.iloc[test_idx])
            fold_mae.append(mean_absolute_error(y[test_idx], pred))
            fold_rmse.append(np.sqrt(mean_squared_error(y[test_idx], pred)))
            fold_r2.append(r2_score(y[test_idx], pred) if len(test_idx) > 1 else np.nan)
        rows.append({
            "model": name,
            "MAE_mean": np.mean(fold_mae), "MAE_std": np.std(fold_mae),
            "RMSE_mean": np.mean(fold_rmse), "RMSE_std": np.std(fold_rmse),
            "R2_mean": np.nanmean(fold_r2), "R2_std": np.nanstd(fold_r2),
        })
    return pd.DataFrame(rows).sort_values("MAE_mean")


def write_report(results, df):
    best = results.iloc[0]
    lines = [
        "# Model Comparison Study - FatigueSet (Phase P0 benchmark)",
        "",
        f"Dataset: `dl-model/data/fatigueset_final.csv` "
        f"({df.shape[0]} windows, {df['subject_id'].nunique()} subjects, "
        f"{df.groupby('subject_id')['session_id'].nunique().mean():.0f} sessions/subject).",
        f"Target: `label` (physical fatigue rating, continuous 0-100).",
        "Validation: Leave-One-Subject-Out cross-validation (12 folds) - no subject's "
        "data appears in both train and test in any fold, so results reflect generalisation "
        "to a NEW person, not memorisation of a known one.",
        "",
        "## Results (sorted by MAE, lower is better)",
        "",
        "| Model | MAE | RMSE | R2 |",
        "|---|---|---|---|",
    ]
    for _, r in results.iterrows():
        lines.append(f"| {r['model']} | {r['MAE_mean']:.2f} +/- {r['MAE_std']:.2f} | "
                      f"{r['RMSE_mean']:.2f} +/- {r['RMSE_std']:.2f} | "
                      f"{r['R2_mean']:.3f} +/- {r['R2_std']:.3f} |")
    dummy_r2 = results.loc[results["model"] == "Dummy (mean)", "R2_mean"].iloc[0]
    lines += [
        "",
        f"**Best on this benchmark: {best['model']}** (MAE {best['MAE_mean']:.2f}). "
        f"The Dummy (mean) row is the naive baseline any real model must beat.",
        "",
        "## Interpretation",
        "",
        f"Even the Dummy (predict-the-population-mean) baseline scores R2 = {dummy_r2:.2f} "
        "(negative) under Leave-One-Subject-Out. A negative R2 here does NOT mean the code is "
        "wrong - it means each held-out subject's fatigue level sits far from the population "
        "mean learned from the other 11, i.e. **fatigue baselines vary a lot between people**. "
        "All models land close to the Dummy baseline, so with only 12 subjects, a population-level "
        "model struggles to generalise to an unseen person from raw HR/HRV values alone.",
        "",
        "This is a genuine, useful finding for the study, not a failure:",
        "- **Recommendation 1**: normalise the label and/or features per subject (e.g. z-score "
        "against that subject's own baseline session) before pooling across subjects.",
        "- **Recommendation 2**: this is exactly why P2 (training on OUR data) matters - our "
        "protocol collects a KSS/Borg/NASA baseline for every participant, enabling per-person "
        "calibration that FatigueSet's public data doesn't provide.",
        "- **Recommendation 3**: more subjects (combining datasets per modality, per the roadmap) "
        "should reduce this variance and give the population model more to generalise from.",
        "",
        "## Notes",
        "- Features: hr, rmssd, sdnn, lf_hf (median-imputed where missing - 30s windows),",
        "  sss_pretask, gvas_sleepy, intensity_level (one-hot).",
        "- This is the P0 classic-ML benchmark from docs/DL_MODEL_ROADMAP.md - the bar a",
        "  later lightweight deep model (P1) must beat on the same subjects/split.",
        "- Only ECG/HRV features are used here (FatigueSet's parsed modality). Other",
        "  datasets (EMG, video) get their own per-modality comparison the same way.",
    ]
    (RESULTS / "model_comparison_report.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    df = pd.read_csv(DATA)
    results = evaluate(df)
    results.to_csv(RESULTS / "model_comparison.csv", index=False)
    write_report(results, df)
    print(results.to_string(index=False))
    print(f"\nWrote {RESULTS / 'model_comparison.csv'} and model_comparison_report.md")


if __name__ == "__main__":
    main()
