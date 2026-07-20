"""Generate FatigueIDPro_Model_Comparison_Study.docx from dl-model/results.
Run: python scripts/make-model-comparison-doc.py (after train_baselines.py)
"""
from datetime import date
import pandas as pd
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

NAVY = RGBColor(0x0F, 0x2B, 0x4A); BLUE = RGBColor(0x1D, 0x4E, 0xD8); GREY = RGBColor(0x47, 0x55, 0x69)
ROOT = "e:/Data-center/fatigue-analysis"

doc = Document()
doc.styles["Normal"].font.name = "Calibri"; doc.styles["Normal"].font.size = Pt(10.5)


def title(t, sub):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(t); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = NAVY
    p2 = doc.add_paragraph(); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run(sub); r2.font.size = Pt(12); r2.font.color.rgb = BLUE
    p3 = doc.add_paragraph(); p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r3 = p3.add_run("Phase P0 benchmark  |  " + date.today().strftime("%d %B %Y"))
    r3.font.size = Pt(9); r3.font.color.rgb = GREY


def h1(t):
    doc.add_paragraph(); h = doc.add_heading(level=1)
    r = h.add_run(t); r.font.color.rgb = NAVY; r.font.size = Pt(15)


def para(t, grey=False):
    p = doc.add_paragraph(); r = p.add_run(t)
    if grey: r.font.color.rgb = GREY; r.font.size = Pt(10)


def bullet(t):
    doc.add_paragraph(t, style="List Bullet")


title("Fatigue Model Comparison Study",
      "Classic ML benchmark on FatigueSet (ECG/HRV) - Phase P0")
para("Goal: establish the classic-ML benchmark bar (Phase P0 of the DL roadmap) that a "
     "later lightweight deep model must beat, using the first parsed public dataset "
     "(FatigueSet, ECG/HRV). Not the final model - a reference point.", grey=True)

h1("1. Data")
df = pd.read_csv(f"{ROOT}/dl-model/data/fatigueset_final.csv")
bullet(f"{df.shape[0]} windows, {df['subject_id'].nunique()} subjects, 3 sessions each "
       f"(low/medium/high physical intensity).")
bullet("Features: hr, rmssd, sdnn, lf_hf (median-imputed where a 30s window makes LF/HF "
       "unreliable), sss_pretask, gvas_sleepy, intensity_level.")
bullet("Target: physical fatigue rating (continuous, ~0-100 scale) from FatigueSet's own "
       "self-report labels.")

h1("2. Method")
bullet("8 models compared: Dummy (mean), Linear Regression, Ridge, KNN, SVR (RBF), "
       "Random Forest, HistGradientBoosting, XGBoost.")
bullet("Validation: Leave-One-Subject-Out (12 folds). A subject's data is NEVER in both "
       "train and test in the same fold - this measures generalisation to a new person, "
       "not memorisation of a known one.")
bullet("Metrics: MAE, RMSE, R2, averaged (+/- std) across the 12 folds.")

h1("3. Results")
results = pd.read_csv(f"{ROOT}/dl-model/results/model_comparison.csv")
rows = [["Model", "MAE", "RMSE", "R2"]] + [
    [r["model"], f"{r['MAE_mean']:.2f} +/- {r['MAE_std']:.2f}",
     f"{r['RMSE_mean']:.2f} +/- {r['RMSE_std']:.2f}", f"{r['R2_mean']:.3f}"]
    for _, r in results.iterrows()
]
t = doc.add_table(rows=len(rows), cols=4); t.style = "Light Grid Accent 1"
for ri, row in enumerate(rows):
    for ci, val in enumerate(row):
        c = t.cell(ri, ci); c.text = str(val)
        for pp in c.paragraphs:
            for rn in pp.runs:
                rn.font.size = Pt(9)
                if ri == 0: rn.bold = True
best = results.iloc[0]
para(f"\nBest on this benchmark: {best['model']} (MAE {best['MAE_mean']:.2f}).", grey=False)

h1("4. Interpretation (the real finding)")
dummy_r2 = results.loc[results["model"] == "Dummy (mean)", "R2_mean"].iloc[0]
para(f"Even the Dummy (predict-the-population-mean) baseline scores R2 = {dummy_r2:.2f} "
     "(negative) under Leave-One-Subject-Out. This is not a bug: it means each held-out "
     "subject's fatigue level sits far from the mean learned from the other 11 - i.e. "
     "fatigue baselines vary substantially between people. All models land close to the "
     "Dummy baseline, so a population-level model struggles to generalise to an unseen "
     "person from raw HR/HRV alone, at this sample size (12 subjects).")
bullet("Recommendation 1: normalise the label/features per subject (e.g. z-score against "
       "that subject's own baseline session) before pooling across subjects.")
bullet("Recommendation 2: this is exactly why training on OUR own data matters - our "
       "protocol collects a KSS/Borg/NASA baseline per participant, enabling per-person "
       "calibration that FatigueSet's public data doesn't provide.")
bullet("Recommendation 3: combining more subjects across datasets (per-modality, per the "
       "DL roadmap) should reduce this variance and give the model more to generalise from.")

h1("5. Next steps")
bullet("Repeat this same comparison per modality as more datasets are parsed (EMG, video).")
bullet("P1: a small, quantised model once the benchmark + our own data collection are ready.")
bullet("P2: fine-tune / calibrate on our own multimodal sessions (all 3 questionnaires + "
       "ECG + task performance).")

doc.save(f"{ROOT}/FatigueIDPro_Model_Comparison_Study.docx")
print("wrote FatigueIDPro_Model_Comparison_Study.docx")
