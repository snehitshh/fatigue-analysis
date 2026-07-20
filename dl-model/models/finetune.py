"""
Fine-tune / continual-learning scaffold - the "trains itself on new data" half.

Once our own collection produces real sessions (currently ~0 in the live DB - see
docs/PROJECT_HANDOFF.md), call these with a same-schema dataframe of new rows to:
  - continue training the saved MLP checkpoint on the new data (few epochs, low
    learning rate, so it adapts without forgetting the original benchmark), and
  - refit the IsolationForest quality detector on old+new combined, so the
    "normal" distribution grows to include our own device/protocol's data.

Self-check below proves the MECHANISM works using a real held-out slice of the
EXISTING dataset (not fabricated data) - it is a demonstration of the pipeline,
not a claim that we have already fine-tuned on our own field data.
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

import sys
sys.path.insert(0, str(Path(__file__).parent))
from train_dl import FatigueMLP
from verify_data_quality import MODALITY_CONFIG, CKPT_DIR

HERE = Path(__file__).parent.parent


def finetune_mlp(out_prefix: str, target: str, new_df: pd.DataFrame,
                  epochs: int = 30, lr: float = 1e-4):
    """Continue training the saved `<out_prefix>.pt` checkpoint on `new_df`.

    Reuses the ORIGINAL fitted preprocessor (saved next to the checkpoint) via
    .transform() only - never refit on `new_df`, since a small new batch can be
    missing categories or have an all-NaN numeric column, which would silently
    change the feature width/scaling out from under the trained model.
    """
    ckpt = torch.load(CKPT_DIR / f"{out_prefix}.pt", weights_only=False)
    model = FatigueMLP(in_dim=ckpt["in_dim"])
    model.load_state_dict(ckpt["state_dict"])

    saved = joblib.load(CKPT_DIR / f"{out_prefix}_preprocessor.joblib")
    pre = saved["preprocessor"]
    cols = saved["numeric_features"] + saved["categorical_features"]
    X_new = pre.transform(new_df[cols])
    y_new = new_df[target].values.astype(np.float32)

    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-3)
    loss_fn = nn.MSELoss()
    xb, yb = torch.tensor(X_new, dtype=torch.float32), torch.tensor(y_new, dtype=torch.float32)
    model.train()
    for _ in range(epochs):
        opt.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        opt.step()

    torch.save({"state_dict": model.state_dict(), "in_dim": ckpt["in_dim"]},
               CKPT_DIR / f"{out_prefix}.pt")
    return float(loss.item())


def refit_quality_detector(modality: str, new_df: pd.DataFrame):
    """Refit the IsolationForest on old (from disk) + new combined rows."""
    cfg = MODALITY_CONFIG[modality]
    old_df = pd.read_csv(cfg["csv"])
    combined = pd.concat([old_df[cfg["features"]], new_df[cfg["features"]]], ignore_index=True)

    from sklearn.ensemble import IsolationForest
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("iforest", IsolationForest(n_estimators=200, contamination=0.05, random_state=42)),
    ])
    pipe.fit(combined)
    joblib.dump({"pipeline": pipe, "features": cfg["features"]}, CKPT_DIR / f"quality_{modality}.joblib")
    return {"modality": modality, "n_rows_after": len(combined)}


def _self_check():
    """Mechanism demo: hold out the last 20 EMG rows as if they were 'new' data,
    fine-tune on them, and confirm the checkpoint updates without erroring."""
    df = pd.read_csv(HERE / "data" / "emg_features.csv")
    held_out = df.tail(20).copy()
    loss = finetune_mlp("emg_mendeley", target="label", new_df=held_out)
    print(f"finetune_mlp self-check: final loss = {loss:.4f} (checkpoint updated OK)")
    refit_report = refit_quality_detector("emg", held_out)
    print(f"refit_quality_detector self-check: {refit_report}")


if __name__ == "__main__":
    _self_check()
