# Team task brief — Fatigue dataset pipeline + baselines (Phase P0)

**Owner:** (the new team member) · **Runs in parallel** with app + data collection · **No deep-model training yet.**

## Goal
Turn the public fatigue datasets into a clean, comparable **feature store** and a set of
small **per-modality baseline models** — the benchmark our later deep model must beat.

## Key design decision (read first)
- **Do not train on raw data**, and **do not build one model for all inputs.** Extract
  features per modality (this shrinks GB of raw data to MB of features), keep a shared
  feature *schema* for comparability, and train **one small model per modality** (ECG,
  EMG, video). A session may have only some modalities, so per-modality is correct.
- "Combine into one" = one common **feature format**, not one giant model.

## Scope / deliverables
1. **Download scripts** — one per dataset (DROZY, FatigueSet, UTA-RLDD, NTHU-DDD,
   Mendeley EMG, handgrip, MIMIC subset, etc.) into `raw/`. (Links: `FatigueIDPro_Fatigue_Datasets.docx`.)
2. **Per-modality feature extractors**
   - ECG -> HR, HRV (RMSSD, SDNN, LF/HF)
   - EMG -> median/mean frequency decline (MDF/MNF), RMS
   - Video -> PERCLOS, blink rate, yawning, head pose
   - Windowed consistently (e.g. 30-60 s).
3. **Unified feature store** — `unified_features.parquet` with columns:
   `features... , label, label_type, modality, dataset, subject_id, window_start`.
   Each dataset keeps ITS own label (sleepiness / drowsiness / muscle-fatigue / etc.).
4. **EDA** — label distributions, class balance, missing-data report per dataset.
5. **P0 baselines** — logistic regression + gradient-boosted trees **per modality** ->
   `baseline_results.md` (accuracy / F1 per dataset). This is the bar to beat.

## Suggested layout
```
fatigue-ml/
  download/        one script per dataset -> raw/
  features/        ecg.py  emg.py  video.py  -> features/*.parquet
  unified/         schema.md, build.py -> unified_features.parquet
  eda/             notebooks (label + missing-data reports)
  baselines/       train.py -> baseline_results.md
  requirements.txt
```

## Non-goals (deferred)
Deep-model training, multimodal fusion, edge/microcontroller export. Those come after P0,
and the **fusion** step runs on OUR collected multimodal data (owned by the main team).

## Boundaries
- Team member owns: datasets, feature extraction, unified store, P0 baselines.
- Main team owns: the app, our own data collection, and the later fusion + edge model.
