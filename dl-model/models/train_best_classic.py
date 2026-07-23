"""
Save the actual "final model" per modality - the best classic-ML performer
from train_baselines.py's benchmark (see results/model_comparison_<modality>.csv),
fit on ALL subjects and bundled into one pipeline for inference.

Why not the MLP (Phase P1)? It scored worse than classic ML on both
modalities at this sample size (see dl-model/DL_MEETING_NOTES.md) - the MLP
checkpoint stays on disk for comparison, but this is the one api.py serves.

Usage: python dl-model/models/train_best_classic.py
Reads: results/model_comparison_<modality>.csv (must exist - run train_baselines.py first)
Writes: models/checkpoints/<modality>_best.joblib
"""
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).parent.parent
sys.path.insert(0, str(HERE))
from train_baselines import make_models, build_pipeline  # noqa: E402

RESULTS = HERE / "results"
CKPT_DIR = HERE / "models" / "checkpoints"
CKPT_DIR.mkdir(parents=True, exist_ok=True)


def train_and_save_best(csv_path, numeric_features, categorical_features, target, out_prefix, label_desc):
    df = pd.read_csv(csv_path)
    X = df[numeric_features + categorical_features]
    y = df[target].values
    label_scale = float(np.ptp(y))

    comparison = pd.read_csv(RESULTS / f"model_comparison_{out_prefix}.csv")  # already sorted by MAE ascending
    best_name = comparison.iloc[0]["model"]
    best_mae = float(comparison.iloc[0]["MAE_mean"])

    model = make_models(label_scale)[best_name]
    pipe = build_pipeline(model, numeric_features, categorical_features)
    pipe.fit(X, y)

    joblib.dump({
        "pipeline": pipe,
        "model_name": best_name,
        "cv_mae": best_mae,
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "label_desc": label_desc,
    }, CKPT_DIR / f"{out_prefix}_best.joblib")
    print(f"{out_prefix}: saved best model '{best_name}' (LOSO-CV MAE {best_mae:.3f}) -> {out_prefix}_best.joblib")


def main():
    from modality_config import MODALITIES
    for out_prefix, cfg in MODALITIES.items():
        train_and_save_best(cfg["csv"], cfg["numeric_features"], cfg["categorical_features"],
                             cfg["target"], out_prefix, cfg["label_desc"])


if __name__ == "__main__":
    main()
