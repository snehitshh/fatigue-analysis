# dl-model — Fatigue model (Phase P0 + P1)

Plan: `docs/DL_MODEL_ROADMAP.md`. Dataset parsing/features per modality; the
teammate's own pipeline ([fatigueset_parser_v1](https://github.com/Shuchih-Negi/fatigueset_parser_v1))
produced `data/fatigueset_final.csv` (ECG/HRV). This folder additionally parses a
second, freely-downloadable dataset (Mendeley EMG) and adds the model side: the
P0 classic-ML benchmark, the P1 lightweight deep model, and the data-quality
verification model.

## Datasets used

| Modality | Dataset | Subjects | Windows | Label |
|---|---|---|---|---|
| ECG/HRV | FatigueSet (via fatigueset_parser_v1) | 12 | 677 | physical fatigue rating (0-100) |
| EMG | Mendeley "EMG for Muscle Fatigue" (biceps/triceps), DOI 10.17632/8j2p29hnbv.1 | 30 | 480 | rep-ordinal fatigue proxy (0-1) |

Each dataset keeps its OWN label (per `docs/DL_MODEL_ROADMAP.md` §2 — no forced
common label). Per-modality models stay separate; our own collected data (once
it exists) is the multimodal fusion/validation set.

## Setup

```
pip install -r requirements.txt
python download/download_emg_mendeley.py   # fetches the EMG raw files (~29 MB, gitignored)
python parsers/emg_mendeley.py             # -> data/emg_features.csv
python train_baselines.py                  # Phase P0: classic ML, both modalities
python models/train_dl.py                  # Phase P1: PyTorch MLP, both modalities
python models/verify_data_quality.py       # data-quality / verification model
python models/finetune.py                  # self-check for the fine-tune scaffold
```

## Test console (simple frontend)

A local page to type in the same values collected during data collection and see
the trained P1 model's response + the data-quality verdict, per modality.

```
python api.py                        # starts the local API on :5001
# then open dl-model/frontend/index.html in a browser
```

The page fetches `/api/modalities` for the exact field list (with the real
min/mean/max or category options from the training data), so it always matches
whatever the model was actually trained on - no hardcoded fields to keep in sync.
"Fill typical values" pre-fills the mean/first-category for a quick sanity check.
Needs `models/train_dl.py` and `models/verify_data_quality.py` to have been run
first (their checkpoints are what it loads).

## Results (Leave-One-Subject-Out, so results = generalisation to a NEW person)

**ECG (FatigueSet, 12 subjects)** — best classic: SVR, MAE 13.67. MLP (P1): MAE
17.86 — classic wins. Even the Dummy (mean) baseline scores negative R2: fatigue
baselines vary a lot **between subjects**, so per-subject calibration matters
more than model choice at 12 subjects.

**EMG (Mendeley, 30 subjects)** — best classic: Random Forest, MAE 0.274, **R2 =
0.21** (a real, positive signal — RMS/MAV/waveform-length genuinely track muscle
fatigue). MLP (P1): MAE 0.301, R2 0.10 — classic still wins, but less of a gap.

**Classic ML beats the from-scratch deep model on both modalities right now.**
This matches well-established findings on small tabular datasets (a few hundred
rows) — deep nets need more data to pull ahead. That's expected, not a failure;
see full write-ups in `results/*_report.md`.

## Extending with a new field

The trained model can only use the fields it was trained on - it can't learn a
pattern from a signal it's never seen. If you start collecting a new field (a
new sensor channel, a new derived metric):

1. **Now**: submit it anyway through the test console's "+ Add a new field to
   test" box, or just include the extra key in a `/api/predict` request. It
   won't affect the prediction yet, but `api.py` logs it to
   `results/unknown_fields_log.csv` (gitignored - it's operational data, not a
   dataset artefact) - so real values accumulate instead of being silently
   dropped. This is how "finding new patterns" actually starts: there is no
   pattern to find until there is data.
2. **Once enough real data exists** for that field: add it to the right
   modality's `numeric_features` / `categorical_features` list in
   `modality_config.py`, make sure the parser/feature-extractor also produces
   it, then re-run `train_baselines.py` (new P0 benchmark including it) and
   `models/train_dl.py` (retrains the MLP with the wider input - the test
   console picks it up automatically next time it fetches `/api/modalities`,
   nothing else to change).

## The data-quality / verification model (the primary purpose of this work)

`models/verify_data_quality.py` fits an unsupervised IsolationForest per
modality on the valid feature distribution (no fatigue label needed). At real
collection time, score a new incoming window:
```python
from models.verify_data_quality import score_window
score_window("ecg", {"hr": 78, "rmssd": 30, "sdnn": 40, "lf_hf": 1.2})
# -> {"is_anomaly": False, "quality_score": 0.18}
```
A low/negative score = implausible reading (bad electrode contact, motion
artefact, sensor fault) - flag it for the operator instead of silently keeping
bad data. ~5% of the existing data is flagged in each modality (by design,
`contamination=0.05`).

## The "trains itself on new data" mechanism

`models/finetune.py` continues training a saved checkpoint on new same-schema
data (low learning rate, reuses the ORIGINAL fitted preprocessor so feature
scaling stays consistent) and refits the quality detector on old+new combined.
Proven with a running self-check (`python models/finetune.py`) against a real
held-out slice of the existing data. **Not yet exercised on real field data** -
our own collection currently has ~0 sessions in the live DB; run this once it does.

## Next
- Add more datasets/modalities as the teammate parses them (video/PERCLOS next).
- P2: fine-tune/calibrate on our own multimodal sessions (all 3 questionnaires +
  ECG + task performance) once collection produces real data.
