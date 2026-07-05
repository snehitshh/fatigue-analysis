"""Generate FatigueIDPro_Fatigue_Datasets.docx - a shareable review of existing public
datasets for fatigue analysis (ECG, EMG, BP, SpO2, dynamometer, video/webcam), with
clickable links to papers/repositories. Run: python scripts/make-datasets-doc.py
"""
from datetime import date
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.shared import OxmlElement, qn

NAVY = RGBColor(0x0F, 0x2B, 0x4A)
BLUE = RGBColor(0x1D, 0x4E, 0xD8)
GREY = RGBColor(0x47, 0x55, 0x69)

doc = Document()
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)


def add_hyperlink(paragraph, url, text):
    part = paragraph.part
    r_id = part.relate_to(url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True)
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), r_id)
    run = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')
    c = OxmlElement('w:color'); c.set(qn('w:val'), '1D4ED8'); rPr.append(c)
    u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); rPr.append(u)
    run.append(rPr)
    t = OxmlElement('w:t'); t.text = text; run.append(t)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def title(text, sub):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = NAVY
    p2 = doc.add_paragraph(); p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run(sub); r2.font.size = Pt(12); r2.font.color.rgb = BLUE
    p3 = doc.add_paragraph(); p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r3 = p3.add_run("Dataset review for validation  |  " + date.today().strftime("%d %B %Y"))
    r3.font.size = Pt(9); r3.font.color.rgb = GREY


def section(text):
    doc.add_paragraph()
    h = doc.add_heading(level=1)
    r = h.add_run(text); r.font.color.rgb = NAVY; r.font.size = Pt(15)


def subsection(text):
    h = doc.add_heading(level=2)
    r = h.add_run(text); r.font.color.rgb = BLUE; r.font.size = Pt(12)


def para(text, grey=False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    if grey: r.font.color.rgb = GREY; r.font.size = Pt(10)


def bullet_link(name, desc, links):
    """links = list of (label, url)."""
    p = doc.add_paragraph(style="List Bullet")
    r = p.add_run(name + " — "); r.bold = True; r.font.color.rgb = NAVY
    p.add_run(desc + " ")
    for i, (label, url) in enumerate(links):
        if i: p.add_run("  ·  ")
        add_hyperlink(p, url, label)


# ------------------------------------------------------------------ cover
title("Existing Datasets for Fatigue Analysis",
      "ECG · EMG · Blood Pressure · SpO2 · Dynamometer · Video / Webcam")
para("Purpose: to check what public datasets already exist for fatigue analysis across the "
     "signals we plan to collect, so individual channels can be validated against prior work. "
     "Below are the real, accessible datasets found, grouped by signal, with links. Key finding: "
     "no single public dataset combines all six modalities, and blood-pressure-in-fatigue and "
     "dynamometer-fatigue are genuine gaps — which supports collecting our own multimodal dataset "
     "while validating each channel against existing sets.", grey=True)

# ------------------------------------------------------------------ coverage table
section("1. Coverage at a glance")
rows = [
    ("Dataset", "ECG", "EMG", "BP", "SpO2", "Grip", "Video"),
    ("DROZY (Univ. Liege)", "Y", "Y", "-", "-", "-", "Y (NIR)"),
    ("UL-DD (Univ. Louisiana)", "HR/BVP", "-", "-", "Y", "-", "Y (RGB/IR/3D)"),
    ("Fatigue-Characterization (Mixed Reality)", "Y", "-", "-", "Y", "-", "stereo"),
    ("FatigueSet", "Y", "-", "-", "-", "task", "-"),
    ("MEFAR", "-", "-", "-", "-", "-", "EEG+HR+PPG"),
    ("UTA-RLDD", "-", "-", "-", "-", "-", "Y (webcam)"),
    ("NTHU-DDD", "-", "-", "-", "-", "-", "Y"),
    ("Mendeley EMG (Biceps/Triceps)", "-", "Y", "-", "-", "-", "-"),
    ("MIMIC-III Waveform (not fatigue-labelled)", "Y", "-", "Y", "Y", "-", "-"),
]
table = doc.add_table(rows=len(rows), cols=7)
table.style = "Light Grid Accent 1"
for ri, row in enumerate(rows):
    for ci, val in enumerate(row):
        cell = table.cell(ri, ci)
        cell.text = val
        for pph in cell.paragraphs:
            for rn in pph.runs:
                rn.font.size = Pt(8.5)
                if ri == 0:
                    rn.bold = True

# ------------------------------------------------------------------ by modality
section("2. Datasets by signal")

subsection("ECG (heart / HRV)")
bullet_link("DROZY", "EEG, EOG, ECG, EMG and near-infrared video from 14 subjects during a Psychomotor Vigilance Test, with KSS labels. Access on request from University of Liege.",
            [("paper", "https://www.researchgate.net/publication/303563949_The_ULg_multimodality_drowsiness_database_called_DROZY_and_examples_of_use")])
bullet_link("FatigueSet", "Mental fatigue + fatigability; EEG (Muse S) + ECG (Zephyr BioHarness) + PPG/GSR/ST/ACC (Empatica E4), 12 subjects, cognitive + physical tasks. Publicly accessible.",
            [("paper (PDF)", "https://chulhong.github.io/paper/Kalanadhabhatta-PervasiveHealth2021-Camera.pdf")])
bullet_link("Multimodal Phenotyping Dataset of Driving Fatigue", "Driving-fatigue physiological dataset; preprocessed data on figshare.",
            [("Nature Sci Data", "https://www.nature.com/articles/s41597-026-06634-4")])

subsection("EMG (muscle fatigue)")
bullet_link("Mendeley - EMG Dataset for Muscle Fatigue Analysis (Biceps & Triceps)", "Dedicated muscle-fatigue sEMG recordings.",
            [("download", "https://data.mendeley.com/datasets/8j2p29hnbv/1")])
bullet_link("Mendeley - Multi-channel sEMG (40 subjects, BIOPAC)", "4-channel forearm sEMG for 10 hand gestures; sEMG methodology reference.",
            [("download", "https://data.mendeley.com/datasets/ckwc76xr2z/2")])
bullet_link("DROZY", "Also contains EMG alongside ECG/EEG/video.",
            [("paper", "https://www.researchgate.net/publication/303563949_The_ULg_multimodality_drowsiness_database_called_DROZY_and_examples_of_use")])

subsection("SpO2 (oxygen saturation)")
bullet_link("UL-DD (University of Louisiana Drowsiness Dataset)", "Facial video (RGB, IR, 3D depth) + SpO2, BVP, IBI, RR, HR, ST + behavioural, 19 subjects. Open.",
            [("arXiv", "https://arxiv.org/abs/2507.13403")])
bullet_link("Fatigue-Characterization Multimodal Dataset", "24-channel EEG + ECG + EDA + SpO2 + respiration + skin temperature; raw EEG on OpenNeuro, rest on Figshare.",
            [("PMC article", "https://pmc.ncbi.nlm.nih.gov/articles/PMC12873256/")])

subsection("Blood Pressure (BP)")
para("No fatigue-labelled BP dataset was found. For continuous arterial BP together with ECG and "
     "SpO2 (ICU data, NOT fatigue-labelled), use:", grey=True)
bullet_link("MIMIC-III Waveform Database (PhysioNet)", "Continuous ECG, arterial BP, PPG, SpO2, respiration for ~30,000 ICU patients. Requires PhysioNet credentialing.",
            [("PhysioNet", "https://physionet.org/content/mimic3wdb/")])
bullet_link("PulseDB", "Curated ECG/PPG/arterial-BP segments derived from MIMIC-III + VitalDB.",
            [("PMC article", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9944565/")])

subsection("Video / Webcam (facial fatigue)")
bullet_link("UTA-RLDD (Real-Life Drowsiness Dataset)", "~30 h of RGB webcam/phone video from 60 participants, three classes (alert / low-vigilant / drowsy). Closest match to a webcam use case.",
            [("Kaggle", "https://www.kaggle.com/datasets/rishab260/uta-reallife-drowsiness-dataset"),
             ("reference paper", "https://arxiv.org/pdf/2010.06235")])
bullet_link("NTHU-DDD (Driver Drowsiness Detection)", "Driving-simulator videos with eye/mouth/head/fatigue labels; access on request from NTHU.",
            [("reference paper", "https://arxiv.org/pdf/2010.06235")])
bullet_link("DROZY / UL-DD", "Both also provide synchronised video alongside physiological signals.",
            [("UL-DD", "https://arxiv.org/abs/2507.13403")])

subsection("Dynamometer / Grip-strength fatigue")
para("No dedicated open dataset was found — searches returned methodology studies and reviews, not "
     "downloadable data. Useful methods reference (force-time curve fatigue indicators):", grey=True)
bullet_link("Hand Grip Force-Time Curve Indicators - Systematic Review", "Defines fatigue index, fatigue rate, endurance and related grip metrics.",
            [("PMC review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11206825/")])

# ------------------------------------------------------------------ takeaway
section("3. Takeaway for the study")
para("No single public dataset combines all six modalities (ECG + EMG + BP + SpO2 + dynamometer + "
     "webcam). The most multimodal existing sets (DROZY, UL-DD, the Mixed-Reality fatigue dataset) "
     "each cover only 2-4 of them, and BP-in-fatigue and dynamometer-fatigue are genuine gaps. "
     "This supports collecting our own multimodal dataset, while validating each individual channel "
     "against prior work:")
bullet_link("ECG / HRV", "validate against FatigueSet and DROZY.", [])
bullet_link("EMG", "validate against the Mendeley muscle-fatigue sEMG set and DROZY.", [])
bullet_link("SpO2", "validate against UL-DD and the Mixed-Reality fatigue dataset.", [])
bullet_link("Webcam / facial", "validate against UTA-RLDD and NTHU-DDD.", [])
bullet_link("BP and dynamometer", "no fatigue-labelled public benchmark - our data would be a novel contribution.", [])

out = "FatigueIDPro_Fatigue_Datasets.docx"
doc.save(out)
print("wrote", out)
