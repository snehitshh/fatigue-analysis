"""
Data-quality / verification model - the primary purpose of this DL work.

Fits one anomaly detector per modality on the feature distribution of our
currently-valid public data (FatigueSet ECG/HRV, Mendeley EMG). At real
collection time, a new incoming session's features can be scored against this:
a low/anomalous score means the reading looks implausible (bad electrode
contact, motion artefact, sensor fault, or the participant not doing the task)
- flag it for the operator to check, rather than silently keeping bad data.

This does NOT need a fatigue label - it is unsupervised (IsolationForest), so it
can be re-fit/extended directly on our own incoming data with no manual labelling,
which is the "trains itself on new data" half of the brief.

Usage:
    python dl-model/models/verify_data_quality.py            # fit + save + report
Then, to score a new window at collection time:
    from verify_data_quality import score_window
    score_window("ecg", {"hr": 78, "rmssd": 30, "sdnn": 40, "lf_hf": 1.2})
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).parent.parent
CKPT_DIR = HERE / "models" / "checkpoints"
CKPT_DIR.mkdir(parents=True, exist_ok=True)
RESULTS = HERE / "results"

MODALITY_CONFIG = {
    "ecg": {
        "csv": HERE / "data" / "fatigueset_final.csv",
        "features": ["hr", "rmssd", "sdnn", "lf_hf"],
    },
    "emg": {
        "csv": HERE / "data" / "emg_features.csv",
        "features": ["rms", "mav", "wl", "zc", "ssc"],
    },
}


def fit_detector(modality: str, contamination: float = 0.05):
    cfg = MODALITY_CONFIG[modality]
    df = pd.read_csv(cfg["csv"])
    X = df[cfg["features"]]
    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("iforest", IsolationForest(n_estimators=200, contamination=contamination, random_state=42)),
    ])
    pipe.fit(X)
    joblib.dump({"pipeline": pipe, "features": cfg["features"]}, CKPT_DIR / f"quality_{modality}.joblib")

    flags = pipe.predict(X)  # -1 = anomaly, 1 = normal
    scores = pipe.decision_function(X)  # higher = more normal
    report = {
        "modality": modality, "n_rows": int(len(df)),
        "n_flagged": int((flags == -1).sum()),
        "flagged_pct": round(100 * (flags == -1).mean(), 1),
        "score_min": round(float(scores.min()), 3), "score_max": round(float(scores.max()), 3),
    }
    return report


def score_window(modality: str, feature_dict: dict) -> dict:
    """Score ONE new incoming window against the fitted detector for `modality`."""
    bundle = joblib.load(CKPT_DIR / f"quality_{modality}.joblib")
    pipe, features = bundle["pipeline"], bundle["features"]
    row = pd.DataFrame([{f: feature_dict.get(f, np.nan) for f in features}])
    is_anomaly = pipe.predict(row)[0] == -1
    score = float(pipe.decision_function(row)[0])
    return {"is_anomaly": bool(is_anomaly), "quality_score": score}


def main():
    reports = [fit_detector(m) for m in MODALITY_CONFIG]
    (RESULTS / "data_quality_models_report.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
    for r in reports:
        print(r)

    # Self-check: a plausible, in-range ECG reading should NOT be flagged.
    demo = score_window("ecg", {"hr": 75, "rmssd": 40, "sdnn": 50, "lf_hf": 1.5})
    print("sanity check (plausible ECG reading):", demo)
    assert not demo["is_anomaly"], "a typical reading should not be flagged as an anomaly"
    # An implausible reading (near-zero HR, huge HRV) should be flagged.
    demo_bad = score_window("ecg", {"hr": 2, "rmssd": 5000, "sdnn": 5000, "lf_hf": 500})
    print("sanity check (implausible ECG reading):", demo_bad)
    assert demo_bad["is_anomaly"], "an implausible reading should be flagged as an anomaly"
    print("Sanity checks passed.")


if __name__ == "__main__":
    main()
