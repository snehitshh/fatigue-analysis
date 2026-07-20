"""
Phase P1 - lightweight deep-learning model, one per modality (see DL_MODEL_ROADMAP.md).

A small MLP (not a CNN: the parsers give per-window ENGINEERED features - hr/rmssd/
sdnn/... for ECG, rms/mav/wl/... for EMG - not the raw waveform per window, so a
temporal/CNN model has nothing to convolve over here. A 1D-CNN becomes appropriate
once a parser exposes the raw per-window signal; documented as a TODO). Small on
purpose: a few hundred to ~500 rows per modality cannot support a large network
without overfitting - heavy dropout + weight decay + a tiny hidden size instead.

Validation: same Leave-One-Subject-Out protocol as train_baselines.py, so the
result is directly comparable to the classic-ML P0 benchmark - this IS the P1 vs
P0 comparison.

Usage: python dl-model/models/train_dl.py
Writes: dl-model/results/dl_model_<modality>.csv, dl_model_<modality>_report.md,
        dl-model/models/checkpoints/<modality>.pt (trained on ALL subjects, for
        inference / as the finetune-scaffold starting point)
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

HERE = Path(__file__).parent.parent
RESULTS = HERE / "results"
CKPT_DIR = HERE / "models" / "checkpoints"
CKPT_DIR.mkdir(parents=True, exist_ok=True)
torch.manual_seed(42)


class FatigueMLP(nn.Module):
    """Small regressor: in_dim -> 16 -> 8 -> 1, dropout-regularised for tiny data."""

    def __init__(self, in_dim: int, hidden=(16, 8), dropout=0.3):
        super().__init__()
        layers, d = [], in_dim
        for h in hidden:
            layers += [nn.Linear(d, h), nn.ReLU(), nn.Dropout(dropout)]
            d = h
        layers += [nn.Linear(d, 1)]
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


def make_preprocessor(numeric_features, categorical_features):
    return ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")),
                           ("scale", StandardScaler())]), numeric_features),
        ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
    ])


def train_one_fold(X_train, y_train, X_test, y_test, epochs=200, lr=1e-3, weight_decay=1e-3):
    model = FatigueMLP(in_dim=X_train.shape[1])
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    loss_fn = nn.MSELoss()
    xb = torch.tensor(X_train, dtype=torch.float32)
    yb = torch.tensor(y_train, dtype=torch.float32)
    model.train()
    for _ in range(epochs):
        opt.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        opt.step()
    model.eval()
    with torch.no_grad():
        pred = model(torch.tensor(X_test, dtype=torch.float32)).numpy()
    return pred, model


def evaluate_modality_dl(csv_path, numeric_features, categorical_features, target, group, out_prefix, label_desc):
    df = pd.read_csv(csv_path)
    X_raw = df[numeric_features + categorical_features]
    y = df[target].values.astype(np.float32)
    groups = df[group].values
    logo = LeaveOneGroupOut()

    mae, rmse, r2 = [], [], []
    for train_idx, test_idx in logo.split(X_raw, y, groups):
        pre = make_preprocessor(numeric_features, categorical_features)
        X_train = pre.fit_transform(X_raw.iloc[train_idx])
        X_test = pre.transform(X_raw.iloc[test_idx])
        pred, _ = train_one_fold(X_train, y[train_idx], X_test, y[test_idx])
        mae.append(mean_absolute_error(y[test_idx], pred))
        rmse.append(np.sqrt(mean_squared_error(y[test_idx], pred)))
        r2.append(r2_score(y[test_idx], pred) if len(test_idx) > 1 else np.nan)

    result = {"model": "MLP (PyTorch, P1)", "MAE_mean": np.mean(mae), "MAE_std": np.std(mae),
              "RMSE_mean": np.mean(rmse), "RMSE_std": np.std(rmse),
              "R2_mean": np.nanmean(r2), "R2_std": np.nanstd(r2)}
    pd.DataFrame([result]).to_csv(RESULTS / f"dl_model_{out_prefix}.csv", index=False)

    # Final model trained on ALL subjects (for inference + the finetune scaffold).
    # The fitted preprocessor is saved alongside it - finetune.py MUST reuse it
    # (transform only) rather than refit on a small new batch, which would give a
    # different feature width/scaling (e.g. one-hot categories missing, or a
    # numeric column with no observed values in the new slice).
    pre = make_preprocessor(numeric_features, categorical_features)
    X_all = pre.fit_transform(X_raw)
    _, final_model = train_one_fold(X_all, y, X_all, y)
    torch.save({"state_dict": final_model.state_dict(), "in_dim": X_all.shape[1]},
               CKPT_DIR / f"{out_prefix}.pt")
    joblib.dump({"preprocessor": pre, "numeric_features": numeric_features,
                 "categorical_features": categorical_features},
                CKPT_DIR / f"{out_prefix}_preprocessor.joblib")

    compare_and_report(result, out_prefix, label_desc, df.shape[0], df[group].nunique())
    print(f"{out_prefix}: MAE={result['MAE_mean']:.3f} RMSE={result['RMSE_mean']:.3f} R2={result['R2_mean']:.3f}")
    return result


def compare_and_report(dl_result, out_prefix, label_desc, n_rows, n_subjects):
    p0_path = RESULTS / f"model_comparison_{out_prefix}.csv"
    lines = [f"# Phase P1 deep model vs P0 benchmark - {out_prefix}", "",
             f"{n_rows} windows, {n_subjects} subjects. Target: {label_desc}.",
             "Same Leave-One-Subject-Out protocol as the P0 classic-ML benchmark.", ""]
    if p0_path.exists():
        p0 = pd.read_csv(p0_path)
        best_classic = p0.iloc[0]
        lines += ["| Model | MAE | RMSE | R2 |", "|---|---|---|---|",
                  f"| Best classic (P0): {best_classic['model']} | {best_classic['MAE_mean']:.3f} | "
                  f"{best_classic['RMSE_mean']:.3f} | {best_classic['R2_mean']:.3f} |",
                  f"| MLP (PyTorch, P1) | {dl_result['MAE_mean']:.3f} +/- {dl_result['MAE_std']:.3f} | "
                  f"{dl_result['RMSE_mean']:.3f} +/- {dl_result['RMSE_std']:.3f} | "
                  f"{dl_result['R2_mean']:.3f} +/- {dl_result['R2_std']:.3f} |", ""]
        verdict = ("The MLP beats the classic P0 benchmark on this modality."
                   if dl_result["MAE_mean"] < best_classic["MAE_mean"] else
                   "The classic P0 benchmark still wins on this modality - expected at "
                   "this sample size; deep models need more data than a few hundred rows "
                   "to out-perform tree ensembles / linear models. Revisit once our own "
                   "collected data is added (P2).")
        lines.append(verdict)
    (RESULTS / f"dl_model_{out_prefix}_report.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    evaluate_modality_dl(
        HERE / "data" / "fatigueset_final.csv",
        numeric_features=["hr", "rmssd", "sdnn", "lf_hf", "sss_pretask", "gvas_sleepy"],
        categorical_features=["intensity_level"],
        target="label", group="subject_id", out_prefix="ecg_fatigueset",
        label_desc="physical fatigue rating (continuous, ~0-100 scale)",
    )
    evaluate_modality_dl(
        HERE / "data" / "emg_features.csv",
        numeric_features=["rms", "mav", "wl", "zc", "ssc", "load_kg", "age", "weight_kg"],
        categorical_features=["muscle", "sex"],
        target="label", group="subject_id", out_prefix="emg_mendeley",
        label_desc="rep-ordinal fatigue proxy (0=fresh .. 1=most fatigued rep in the set)",
    )


if __name__ == "__main__":
    main()
