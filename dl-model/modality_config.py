"""
Single source of truth for each modality's feature/target/group columns - used by
train_baselines.py, models/train_dl.py, models/verify_data_quality.py, and api.py.
Keeping this in one place means the feature list can never drift between the P0
benchmark, the P1 model, and the demo frontend.
"""
from pathlib import Path

HERE = Path(__file__).parent

MODALITIES = {
    "ecg_fatigueset": {
        "label": "ECG / HRV (FatigueSet)",
        "csv": HERE / "data" / "fatigueset_final.csv",
        "numeric_features": ["hr", "rmssd", "sdnn", "lf_hf", "sss_pretask", "gvas_sleepy"],
        "categorical_features": ["intensity_level"],
        "target": "label",
        "group": "subject_id",
        "label_desc": "physical fatigue rating (continuous, ~0-100 scale)",
        "quality_features": ["hr", "rmssd", "sdnn", "lf_hf"],
    },
    "emg_mendeley": {
        "label": "EMG (Mendeley biceps/triceps)",
        "csv": HERE / "data" / "emg_features.csv",
        "numeric_features": ["rms", "mav", "wl", "zc", "ssc", "load_kg", "age", "weight_kg"],
        "categorical_features": ["muscle", "sex"],
        "target": "label",
        "group": "subject_id",
        "label_desc": "rep-ordinal fatigue proxy (0=fresh .. 1=most fatigued rep in the set)",
        "quality_features": ["rms", "mav", "wl", "zc", "ssc"],
    },
}
