"""Generate dl-model/send/FatigueIDPro_DL_Results_For_Teacher.docx - the DL model
progress summary to send to the professor/mentor. Run (after the dl-model
pipeline has been run at least once): python scripts/make-dl-results-for-teacher-doc.py
"""
from datetime import date
import pandas as pd
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

NAVY = RGBColor(0x0F, 0x2B, 0x4A); BLUE = RGBColor(0x1D, 0x4E, 0xD8); GREY = RGBColor(0x47, 0x55, 0x69)
ROOT = "e:/Data-center/fatigue-analysis"
DL = f"{ROOT}/dl-model"
OUT = f"{DL}/send/FatigueIDPro_DL_Results_For_Teacher.docx"

doc = Document()
doc.styles["Normal"].font.name = "Calibri"; doc.styles["Normal"].font.size = Pt(10.5)


def title(t, sub):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(t); r.bold = True; r.font.size = Pt(19); r.font.color.rgb = NAVY
    p2 = doc.add_paragraph(); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run(sub); r2.font.size = Pt(11.5); r2.font.color.rgb = BLUE
    p3 = doc.add_paragraph(); p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r3 = p3.add_run("Center of Excellence in Data Science and AI, TIET Patiala  |  " + date.today().strftime("%d %B %Y"))
    r3.font.size = Pt(9); r3.font.color.rgb = GREY


def h1(t):
    doc.add_paragraph(); h = doc.add_heading(level=1)
    r = h.add_run(t); r.font.color.rgb = NAVY; r.font.size = Pt(14.5)


def para(t, grey=False, bold=False):
    p = doc.add_paragraph(); r = p.add_run(t); r.bold = bold
    if grey: r.font.color.rgb = GREY; r.font.size = Pt(10)


def bullet(t):
    doc.add_paragraph(t, style="List Bullet")


def add_table(rows):
    t = doc.add_table(rows=len(rows), cols=len(rows[0])); t.style = "Light Grid Accent 1"
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            c = t.cell(ri, ci); c.text = str(val)
            for pp in c.paragraphs:
                for rn in pp.runs:
                    rn.font.size = Pt(9)
                    if ri == 0: rn.bold = True


title("Examining Real-Time Fatigue Through Interaction Analysis",
      "DL model progress report (Phase P0 + P1)")

h1("1. Status")
para("This model is trained ONLY on public research datasets so far - not on our own "
     "collected data (our platform currently has close to zero real sessions). This is "
     "intentional: Phase P0/P1 establishes a working benchmark before our own data exists; "
     "Phase P2 fine-tunes on our own data once real sessions (task performance + NASA-TLX + "
     "Borg CR10 + KSS + a parallel ECG reading) start being collected.", bold=True)

h1("2. Team contribution - the FatigueSet pipeline and how it was continued")
para("The ECG/HRV dataset used below (FatigueSet) was prepared by a teammate, not built "
     "from scratch by the modelling side of the project. Splitting the work this way - one "
     "person preparing datasets, the other building the model - let both move in parallel "
     "instead of the model waiting on data collection.")
para("What the teammate built (fatigueset_parser_v1, public GitHub repo): a complete "
     "pipeline for the FatigueSet dataset.", bold=True)
bullet("Downloaded the raw dataset (ECG waveform + RR intervals, per subject/session).")
bullet("Task-aligned windowing: sliced each recording using the experiment's own task-block "
       "markers rather than fixed wall-clock time, so no window straddles a task transition.")
bullet("HRV feature extraction: heart rate, RMSSD, SDNN, LF/HF, plus a data-quality flag, "
       "per window.")
bullet("Label join: matched each window to its corresponding physical/mental fatigue "
       "self-report from the study, with a documented fallback.")
bullet("Combined all 12 subjects into one final, labelled dataset (fatigueset_final.csv, "
       "677 windows) ready for model training.")
para("Review and feedback given: the pipeline was reviewed and the pattern approved as the "
     "template for other datasets. Two corrections were requested and incorporated: (1) "
     "LF/HF is unreliable on 30-second windows (needs ~2 minutes of data) - a "
     "lf_hf_low_confidence flag was added instead of reporting an unreliable number "
     "silently; (2) an EDA notebook was added to check label distributions and missing data.",
     bold=True)
para("How the model side continued from there:", bold=True)
bullet("The teammate's finished fatigueset_final.csv was used as-is as the ECG/HRV "
       "modality's training data.")
bullet("The exact same pipeline pattern was replicated independently for a second, "
       "freely-downloadable dataset (Mendeley EMG, 30 subjects), following the same "
       "final-CSV schema the teammate established, so a second modality was ready "
       "immediately and both datasets stay directly comparable.")
bullet("The model side - the classic-ML benchmark (P0), the PyTorch deep model (P1), the "
       "data-quality verification model, the fine-tuning mechanism, and the local test "
       "console - was built end-to-end and evaluated on both the teammate's ECG data and "
       "the newly-added EMG data.")
para("Going forward: the teammate continues parsing additional public datasets (video/"
     "PERCLOS is next) following this same pattern; the model side continues refining the "
     "benchmark and will fine-tune on our own collected data (Phase P2) once real sessions "
     "exist.", grey=True)

h1("3. Datasets used")
add_table([
    ["Modality", "Dataset", "Subjects", "Windows", "Label"],
    ["ECG / HRV", "FatigueSet", "12", "677", "physical fatigue rating (0-100, self-reported)"],
    ["EMG", "Mendeley Muscle Fatigue (biceps/triceps)", "30", "480", "rep-ordinal fatigue proxy (fresh->fatigued)"],
])

h1("4. Method")
bullet("Phase P0: classic ML baselines per modality (Linear/Ridge, KNN, SVR, Random Forest, "
       "HistGradientBoosting, XGBoost).")
bullet("Phase P1: a small PyTorch MLP per modality.")
bullet("Validation: Leave-One-Subject-Out - a subject's data is never in both train and "
       "test, so results measure generalisation to a genuinely new person.")

h1("5. Results")
para("ECG (FatigueSet, 12 subjects)", bold=True)
add_table([["Model", "MAE", "RMSE", "R2"],
           ["Best classic: SVR (RBF)", "13.67", "16.49", "-4.18"],
           ["MLP (P1, PyTorch)", "17.86", "21.41", "-1.76"]])
para("EMG (Mendeley, 30 subjects)", bold=True)
add_table([["Model", "MAE", "RMSE", "R2"],
           ["Best classic: Random Forest", "0.274", "0.328", "0.212"],
           ["MLP (P1, PyTorch)", "0.301", "0.352", "0.099"]])

h1("6. Interpretation")
bullet("Classic ML currently beats the from-scratch deep model on both modalities - matches "
       "well-established findings on small tabular datasets; deep nets need more data before "
       "out-performing tree ensembles/kernel methods. Expected, not a failure.")
bullet("EMG shows a real, positive signal (R2 ~0.21): RMS/MAV/waveform-length genuinely track "
       "muscle fatigue across 30 different people.")
bullet("ECG does not generalise well yet: even the naive mean-predictor scores negative R2 "
       "under LOSO - fatigue baselines vary a lot between people, so per-subject calibration "
       "(which our own KSS/Borg/NASA-TLX baseline per participant provides) matters more than "
       "a better algorithm at 12 subjects.")

h1("7. Also built")
bullet("A data-quality verification model (unsupervised, per modality) that flags "
       "physiologically implausible readings - sanity-checked and working.")
bullet("A local test console (web page) to type in the values our platform will collect and "
       "see the model's live prediction + quality verdict, per modality - also captures any "
       "new field not yet part of the model instead of discarding it, so real data accumulates "
       "for future retraining.")
bullet("A fine-tune/continual-learning mechanism, self-tested, ready for Phase P2 once real "
       "sessions exist.")

h1("8. Next steps")
bullet("Collect real sessions with all three questionnaires plus a parallel ECG reading from "
       "a lab-grade device, tagged to the exact task block (now supported in the admin console).")
bullet("Fine-tune the model on this combined dataset (Phase P2).")
bullet("Compare the fine-tuned model's fatigue estimate against the independent ECG reading for "
       "the same session/block - the direct test of the project's research question.")

doc.save(OUT)
print("wrote", OUT)
