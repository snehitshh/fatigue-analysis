"""
Parser for the Mendeley EMG (biceps/triceps) dataset -> unified feature rows.

Label construction (documented assumption, same approach used in the papers this
dataset was built for): ManualSegmentation.xlsx marks 4 contraction repetitions
per recording (PI_i start / PF_i end, sample indices). Muscle fatigue is assumed
to increase monotonically across reps within one set (rep 1 = freshest, rep 4 =
most fatigued) - a standard proxy label for this kind of protocol, NOT a
physiological ground-truth measurement. We record it plainly as label_type
"rep_ordinal_proxy" so downstream users know its limitation.

Usage:
    python dl-model/parsers/emg_mendeley.py
Reads:  dl-model/data/raw_emg_mendeley/*.xlsx  (run download_emg_mendeley.py first)
Writes: dl-model/data/emg_features.csv
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.emg import compute_features

RAW_DIR = Path(__file__).parent.parent / "data" / "raw_emg_mendeley"
OUT_FILE = Path(__file__).parent.parent / "data" / "emg_features.csv"


def rep_to_label(rep_number: int) -> tuple:
    """rep 1-4 -> (continuous 0-1 fatigue_score, 3-class fatigue_level)."""
    score = (rep_number - 1) / 3.0
    level = 0 if rep_number <= 2 else (1 if rep_number == 3 else 2)
    return score, level


def parse_recording(seg_row: pd.Series, filename_xlsx: str, labels_df: pd.DataFrame) -> list:
    stem = filename_xlsx.replace(".xlsx", "")  # e.g. Suj_1_B1
    parts = stem.split("_")
    subject_id = f"{parts[0]}_{parts[1]}"        # Suj_1
    muscle_arm = parts[2]                        # B1 / B2 / T1 / T2
    muscle = "Bicep" if muscle_arm.startswith("B") else "Tricep"
    arm = int(muscle_arm[1])                     # 1=right, 2=left

    fpath = RAW_DIR / filename_xlsx
    if not fpath.exists():
        return []
    sig = pd.read_excel(fpath)["EMG"].values

    # Covariates: load/demographics are on the FIRST row of a B1/T1 pair in Dataset_labels.
    demo = labels_df[labels_df["Filename"] == stem]
    load_kg = sex = age = weight_kg = height_m = workouts = np.nan
    if len(demo):
        r = demo.iloc[0]
        load_kg = r.get("Load (kg)", np.nan)
        sex = r.get("Sex", np.nan)
        age = r.get("Age", np.nan)
        weight_kg = r.get("Weight (kg)", np.nan)
        height_m = r.get("Height (m)", np.nan)
        workouts = r.get("Workouts per week", np.nan)

    rows = []
    for rep in range(1, 5):
        pi, pf = seg_row.get(f"PI_{rep}"), seg_row.get(f"PF_{rep}")
        if pd.isna(pi) or pd.isna(pf):
            continue
        segment = sig[int(pi):int(pf)]
        feats = compute_features(segment)
        score, level = rep_to_label(rep)
        rows.append({
            "subject_id": subject_id, "session_id": stem, "muscle": muscle, "arm": arm,
            "rep_number": rep, **feats,
            "label": score, "fatigue_level": level, "label_type": "rep_ordinal_proxy",
            "load_kg": load_kg, "sex": sex, "age": age, "weight_kg": weight_kg,
            "height_m": height_m, "workouts_per_week": workouts,
            "modality": "emg", "dataset": "mendeley_emg_biceps_triceps",
        })
    return rows


def main():
    labels_path = RAW_DIR / "Dataset_labels.xlsx"
    seg_path = RAW_DIR / "ManualSegmentation.xlsx"
    if not labels_path.exists() or not seg_path.exists():
        print("Run download_emg_mendeley.py first - raw files not found.")
        sys.exit(1)

    labels_df = pd.read_excel(labels_path)
    all_rows = []
    for sheet in ["BICEP", "TRICEP"]:
        seg_df = pd.read_excel(seg_path, sheet_name=sheet)
        for _, seg_row in seg_df.iterrows():
            all_rows.extend(parse_recording(seg_row, seg_row["Filename"], labels_df))

    out = pd.DataFrame(all_rows)
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_FILE, index=False)
    print(f"Wrote {len(out)} rows ({out['subject_id'].nunique()} subjects) to {OUT_FILE}")
    print(out["data_quality"].value_counts())


if __name__ == "__main__":
    main()
