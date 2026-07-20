"""
Model comparison study - Phase P0 benchmark (see docs/DL_MODEL_ROADMAP.md).

Compares classic ML baselines + gradient-boosted models per modality, to set the
benchmark bar a later deep model must beat. Runs once per dataset/modality:
  - FatigueSet (ECG/HRV): 12 subjects, continuous physical-fatigue label.
  - Mendeley EMG (biceps/triceps): 30 subjects, rep-ordinal fatigue proxy label.

Validation: Leave-One-Subject-Out (LOSO) - a subject's data is never in both train
and test, which prevents identity leakage (the model learning "this is P07"
instead of "this is fatigue").

Usage:
    python dl-model/train_baselines.py
Writes: dl-model/results/model_comparison_<modality>.csv and _report.md
"""
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
RESULTS = HERE / "results"
RESULTS.mkdir(exist_ok=True)


def make_models(label_scale=1.0):
    # ponytail: SVR's epsilon is an absolute margin, so it must scale with the
    # label's range or SVR silently collapses to predicting the mean (this bit
    # us on the 0-1 EMG label with a fixed epsilon=1.0 tuned for the 0-100 ECG one).
    models = {
        "Dummy (mean)": DummyRegressor(strategy="mean"),
        "Linear Regression": LinearRegression(),
        "Ridge": Ridge(alpha=1.0),
        "KNN (k=5)": KNeighborsRegressor(n_neighbors=5),
        "SVR (RBF)": SVR(kernel="rbf", C=10, epsilon=0.01 * label_scale),
        "Random Forest": RandomForestRegressor(n_estimators=300, max_depth=6, random_state=42),
        "HistGradientBoosting": HistGradientBoostingRegressor(max_depth=4, random_state=42),
    }
    try:
        from xgboost import XGBRegressor
        models["XGBoost"] = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                                          subsample=0.8, colsample_bytree=0.8, random_state=42)
    except ImportError:
        pass  # ponytail: xgboost optional, sklearn models still give a full comparison
    return models


def build_pipeline(model, numeric_features, categorical_features):
    pre = ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")),
                           ("scale", StandardScaler())]), numeric_features),
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
    ])
    return Pipeline([("pre", pre), ("model", model)])


def evaluate_modality(csv_path, numeric_features, categorical_features, target, group, out_prefix, label_desc):
    df = pd.read_csv(csv_path)
    X = df[numeric_features + categorical_features]
    y = df[target].values
    groups = df[group].values
    logo = LeaveOneGroupOut()
    label_scale = float(np.ptp(y))  # range of the label, for a scale-appropriate SVR epsilon

    rows = []
    for name, model in make_models(label_scale).items():
        fold_mae, fold_rmse, fold_r2 = [], [], []
        for train_idx, test_idx in logo.split(X, y, groups):
            pipe = build_pipeline(model, numeric_features, categorical_features)
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
    results = pd.DataFrame(rows).sort_values("MAE_mean")
    results.to_csv(RESULTS / f"model_comparison_{out_prefix}.csv", index=False)
    write_report(results, df, out_prefix, group, label_desc)
    print(f"\n=== {out_prefix} ===")
    print(results.to_string(index=False))
    return results


def write_report(results, df, out_prefix, group_col, label_desc):
    best = results.iloc[0]
    dummy_r2 = results.loc[results["model"] == "Dummy (mean)", "R2_mean"].iloc[0]
    lines = [
        f"# Model Comparison Study - {out_prefix} (Phase P0 benchmark)",
        "",
        f"{df.shape[0]} windows, {df[group_col].nunique()} subjects. Target: {label_desc}.",
        "Validation: Leave-One-Subject-Out cross-validation - no subject's data appears "
        "in both train and test in any fold, so results reflect generalisation to a NEW "
        "person, not memorisation of a known one.",
        "",
        "## Results (sorted by MAE, lower is better)",
        "",
        "| Model | MAE | RMSE | R2 |",
        "|---|---|---|---|",
    ]
    for _, r in results.iterrows():
        lines.append(f"| {r['model']} | {r['MAE_mean']:.3f} +/- {r['MAE_std']:.3f} | "
                      f"{r['RMSE_mean']:.3f} +/- {r['RMSE_std']:.3f} | "
                      f"{r['R2_mean']:.3f} +/- {r['R2_std']:.3f} |")
    lines += [
        "",
        f"**Best on this benchmark: {best['model']}** (MAE {best['MAE_mean']:.3f}).",
        f"Dummy (mean) baseline R2 = {dummy_r2:.3f} - "
        + ("close to 0, population mean is a reasonable per-subject predictor here."
           if dummy_r2 > -0.5 else
           "notably negative, meaning per-subject baselines vary a lot and a population "
           "model needs per-subject calibration more than a fancier algorithm."),
    ]
    (RESULTS / f"model_comparison_{out_prefix}_report.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    from modality_config import MODALITIES
    for out_prefix, cfg in MODALITIES.items():
        evaluate_modality(
            cfg["csv"], cfg["numeric_features"], cfg["categorical_features"],
            cfg["target"], cfg["group"], out_prefix, cfg["label_desc"],
        )


if __name__ == "__main__":
    main()
