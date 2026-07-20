"""
Local demo API for the DL model + data-quality verifier - lets you type in the
same feature values our data collection captures and see what the model says.

Serves:
  GET  /api/modalities            -> field list + realistic ranges/categories per modality
  POST /api/predict                -> { modality, features:{...} } -> MLP fatigue
                                       prediction + data-quality verification

Run:
    python dl-model/api.py
Then open dl-model/frontend/index.html in a browser (it calls http://127.0.0.1:5001).

Requires the models to already be trained (python models/train_dl.py and
python models/verify_data_quality.py) - see dl-model/README.md.
"""
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from flask import Flask, jsonify, request
from flask_cors import CORS

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "models"))
from modality_config import MODALITIES
from models.train_dl import FatigueMLP
from models.verify_data_quality import CKPT_DIR as QUALITY_CKPT_DIR

CKPT_DIR = HERE / "models" / "checkpoints"
# api.py's MODALITIES keys (ecg_fatigueset/emg_mendeley) vs the shorter keys the
# quality-verification checkpoints were saved under (ecg/emg) - see verify_data_quality.py.
QUALITY_KEY = {"ecg_fatigueset": "ecg", "emg_mendeley": "emg"}

app = Flask(__name__)
CORS(app)


def field_specs(modality: str) -> list:
    """Per-field {name, kind, min, mean, max} or {name, kind:'categorical', options}."""
    cfg = MODALITIES[modality]
    df = pd.read_csv(cfg["csv"])
    specs = []
    for f in cfg["numeric_features"]:
        col = df[f].dropna()
        specs.append({
            "name": f, "kind": "numeric",
            "min": round(float(col.min()), 3), "mean": round(float(col.mean()), 3),
            "max": round(float(col.max()), 3),
        })
    for f in cfg["categorical_features"]:
        specs.append({"name": f, "kind": "categorical",
                       "options": sorted(df[f].dropna().unique().tolist())})
    return specs


@app.get("/api/modalities")
def list_modalities():
    return jsonify([
        {"key": key, "label": cfg["label"], "label_desc": cfg["label_desc"],
         "fields": field_specs(key)}
        for key, cfg in MODALITIES.items()
    ])


def load_mlp(modality: str):
    ckpt = torch.load(CKPT_DIR / f"{modality}.pt", weights_only=False)
    model = FatigueMLP(in_dim=ckpt["in_dim"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    pre_bundle = joblib.load(CKPT_DIR / f"{modality}_preprocessor.joblib")
    return model, pre_bundle["preprocessor"], pre_bundle["numeric_features"], pre_bundle["categorical_features"]


def load_quality(modality: str):
    key = QUALITY_KEY[modality]
    bundle = joblib.load(QUALITY_CKPT_DIR / f"quality_{key}.joblib")
    return bundle["pipeline"], bundle["features"]


UNKNOWN_FIELDS_LOG = HERE / "results" / "unknown_fields_log.csv"


def log_unknown_fields(modality: str, unknown: dict):
    """A field the model has never seen can't be used for prediction until we
    retrain on it - but we should still capture it now, or there is no data to
    retrain on later. Appends one row per submission with a timestamp so a
    future field's real value distribution can be studied once enough
    submissions accumulate (see README 'Extending with a new field')."""
    if not unknown:
        return
    row = {"timestamp": pd.Timestamp.utcnow().isoformat(), "modality": modality, **unknown}
    df = pd.DataFrame([row])
    UNKNOWN_FIELDS_LOG.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(UNKNOWN_FIELDS_LOG, mode="a", header=not UNKNOWN_FIELDS_LOG.exists(), index=False)


@app.post("/api/predict")
def predict():
    body = request.get_json(force=True) or {}
    modality = body.get("modality")
    features = body.get("features", {})
    if modality not in MODALITIES:
        return jsonify({"error": f"unknown modality '{modality}'"}), 400

    try:
        model, pre, numeric_features, categorical_features = load_mlp(modality)
    except FileNotFoundError:
        return jsonify({"error": "Model not trained yet - run: python models/train_dl.py"}), 503

    cols = numeric_features + categorical_features
    row = pd.DataFrame([{c: features.get(c) for c in cols}])
    X = pre.transform(row)
    with torch.no_grad():
        pred = float(model(torch.tensor(X, dtype=torch.float32)).item())

    # Any submitted field the model was NOT trained on can't affect this
    # prediction, but capture it so there's real data to retrain on once it's
    # worth adding (see modality_config.py + README).
    unknown = {k: v for k, v in features.items() if k not in cols}
    log_unknown_fields(modality, unknown)

    result = {"modality": modality, "fatigue_prediction": round(pred, 4),
              "label_desc": MODALITIES[modality]["label_desc"],
              "unknown_fields_logged": list(unknown.keys())}

    try:
        q_pipe, q_features = load_quality(modality)
        q_row = pd.DataFrame([{f: features.get(f) for f in q_features}])
        is_anomaly = bool(q_pipe.predict(q_row)[0] == -1)
        score = float(q_pipe.decision_function(q_row)[0])
        result["data_quality"] = {"is_anomaly": is_anomaly, "quality_score": round(score, 4)}
    except FileNotFoundError:
        result["data_quality"] = {"error": "Quality model not trained yet - run: python models/verify_data_quality.py"}

    return jsonify(result)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)
