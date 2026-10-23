"""Script to generate a high-impact, professional 16:9 PowerPoint presentation
for Sanjeevani Lekh (Field-to-Record) using python-pptx.
"""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE


def create_presentation(output_path: Path) -> None:
    prs = Presentation()
    # 16:9 Widescreen dimensions
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    blank_layout = prs.slide_layouts[6]

    # Color Palette
    COLOR_BG = RGBColor(15, 23, 42)         # Deep slate/navy #0f172a
    COLOR_SURFACE = RGBColor(30, 41, 59)     # Surface card #1e293b
    COLOR_SURFACE_ALT = RGBColor(51, 65, 85) # Highlight border/surface #334155
    COLOR_BLUE = RGBColor(56, 189, 248)      # Sky blue #38bdf8
    COLOR_PURPLE = RGBColor(168, 85, 247)    # Accent purple #a855f7
    COLOR_GREEN = RGBColor(52, 211, 153)     # Emerald #34d399
    COLOR_AMBER = RGBColor(251, 191, 36)     # Amber #fbbf24
    COLOR_TEXT = RGBColor(248, 250, 252)     # Bright white #f8fafc
    COLOR_MUTED = RGBColor(148, 163, 184)    # Slate muted #94a3b8

    def add_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = COLOR_BG
        bg.line.fill.background()
        return bg

    def add_header(slide, category: str, title: str, subtitle: str = ""):
        # Category Pill
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.55), Inches(3.2), Inches(0.38))
        pill.fill.solid()
        pill.fill.fore_color.rgb = RGBColor(30, 58, 102)
        pill.line.color.rgb = COLOR_BLUE
        pill.line.width = Pt(1)
        tf = pill.text_frame
        tf.word_wrap = False
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = category.upper()
        p.alignment = PP_ALIGN.CENTER
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = COLOR_BLUE

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.95), Inches(11.7), Inches(0.8))
        tf = title_box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(28)
        p.font.bold = True
        p.font.color.rgb = COLOR_TEXT

        if subtitle:
            p2 = tf.add_paragraph()
            p2.text = subtitle
            p2.font.size = Pt(14)
            p2.font.color.rgb = COLOR_MUTED

    def add_card(slide, left, top, width, height, title="", border_color=None):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_SURFACE
        if border_color:
            card.line.color.rgb = border_color
            card.line.width = Pt(1.5)
        else:
            card.line.color.rgb = COLOR_SURFACE_ALT
            card.line.width = Pt(1)
        
        if title:
            tb = slide.shapes.add_textbox(left + Inches(0.2), top + Inches(0.18), width - Inches(0.4), Inches(0.5))
            tf = tb.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
            p = tf.paragraphs[0]
            p.text = title
            p.font.size = Pt(16)
            p.font.bold = True
            p.font.color.rgb = COLOR_TEXT
        return card

    # =========================================================================
    # SLIDE 1: TITLE SLIDE
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    add_bg(s1)

    # Decorative glow
    glow = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(11.7), Inches(4.5))
    glow.fill.solid()
    glow.fill.fore_color.rgb = RGBColor(17, 24, 39)
    glow.line.color.rgb = COLOR_BLUE
    glow.line.width = Pt(1.5)

    badge = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.4), Inches(2.2), Inches(3.6), Inches(0.42))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(30, 58, 102)
    badge.line.color.rgb = COLOR_BLUE
    p = badge.text_frame.paragraphs[0]
    p.text = "NEXT-GEN HEALTHCARE • OFFLINE AI"
    p.alignment = PP_ALIGN.CENTER
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = COLOR_BLUE

    tb = s1.shapes.add_textbox(Inches(1.4), Inches(2.8), Inches(10.5), Inches(2.2))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Sanjeevani Lekh"
    p.font.size = Pt(46)
    p.font.bold = True
    p.font.color.rgb = COLOR_TEXT

    p2 = tf.add_paragraph()
    p2.text = "Field-to-Record: Offline Clinical Voice & OCR Ledger for Emergency Responders"
    p2.font.size = Pt(20)
    p2.font.color.rgb = COLOR_BLUE

    p3 = tf.add_paragraph()
    p3.text = "\nZero-Cloud Edge AI Ensemble • Microsoft TrOCR Glove Vision • whisper.cpp Metal STT • SHA-256 Tamper-Proof Audit Chain"
    p3.font.size = Pt(14)
    p3.font.color.rgb = COLOR_MUTED

    # Bottom metadata & Team
    tb_meta = s1.shapes.add_textbox(Inches(1.4), Inches(5.1), Inches(10.5), Inches(1.0))
    tf = tb_meta.text_frame
    p = tf.paragraphs[0]
    p.text = "Team: Milind Verma • Aditya Bipin Kulkarni • Gaurav Kumar • Nikhil Agarwal | Virtusa Jatayu 2026"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = COLOR_BLUE

    p_meta = tf.add_paragraph()
    p_meta.text = "Built for First Responders, Paramedics, and Hospital Handover Teams | 100% Air-Gapped & HIPAA Compliant"
    p_meta.font.size = Pt(12)
    p_meta.font.color.rgb = COLOR_GREEN

    # =========================================================================
    # SLIDE 2: THE PROBLEM
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_bg(s2)
    add_header(s2, "Clinical Crisis in Pre-Hospital Care", "The High-Stakes Documentation Gap in Moving Ambulances", "Paramedics save lives under chaotic conditions, but medical records are lost or delayed.")

    add_card(s2, Inches(0.8), Inches(2.2), Inches(3.7), Inches(4.5), "1. Gloves & Moving Vehicles", COLOR_AMBER)
    tb = s2.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = "• Hands Occupied:\nSterile nitrile gloves and vibrating transport prevent typing or complex software navigation.\n\n• Glove Scribbles:\nDoses (e.g. '14:32 ASA 324 mg') are jotted on gloves or tape scraps.\n\n• High Cognitive Load:\nResponders focus on CPR and drug titration, not paperwork."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s2, Inches(4.8), Inches(2.2), Inches(3.7), Inches(4.5), "2. Memory Loss & Omissions", RGBColor(244, 63, 94))
    tb = s2.shapes.add_textbox(Inches(5.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = "• Handoff Amnesia:\nCrucial medication doses are written from memory 45 minutes later at the ED.\n\n• Severe Patient Risk:\nHospital physicians may duplicate or contradict drugs without knowing pre-hospital administration.\n\n• Up to 28% of field medication details are misremembered or omitted."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s2, Inches(8.8), Inches(2.2), Inches(3.7), Inches(4.5), "3. Cloud & Connectivity Dead-Zones", COLOR_PURPLE)
    tb = s2.shapes.add_textbox(Inches(9.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = "• Rural & Basements:\nCellular data drops in tunnels, rural roads, and concrete trauma bays.\n\n• Privacy / HIPAA Barriers:\nStreaming raw patient speech to commercial cloud APIs violates strict health privacy regulations.\n\n• Zero Non-Repudiation:\nNo cryptographic proof of exact administration time."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 3: THE SOLUTION
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_bg(s3)
    add_header(s3, "The Sanjeevani Lekh Solution", "Instant Field-to-Record with Edge AI & Tamper-Evident Ledger", "A 1-tap capture workflow designed specifically for busy hands and urgent eyes.")

    add_card(s3, Inches(0.8), Inches(2.2), Inches(5.6), Inches(2.1), "Multimodal Edge Capture", COLOR_BLUE)
    tb = s3.shapes.add_textbox(Inches(1.0), Inches(2.8), Inches(5.2), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Voice: 1-tap microphone dictation transcribed on-device via whisper.cpp.\n• Vision: Snaps photos of paramedic nitrile gloves deciphered by Microsoft TrOCR.\n• 100% Offline: Operates seamlessly in basement trauma bays and remote rural routes."
    p.font.size = Pt(13)
    p.font.color.rgb = COLOR_MUTED

    add_card(s3, Inches(6.9), Inches(2.2), Inches(5.6), Inches(2.1), "Dual-Layer Clinical Validation", COLOR_PURPLE)
    tb = s3.shapes.add_textbox(Inches(7.1), Inches(2.8), Inches(5.2), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• MedGemma LLM extracts FHIR-lite MedicationAdministration & Procedure records.\n• Harvard n2c2 Clinical BERT safety cross-checker catches omitted drugs.\n• MIMIC-III Bio_ClinicalBERT grounds medical synonyms ('nitro' -> nitroglycerin)."
    p.font.size = Pt(13)
    p.font.color.rgb = COLOR_MUTED

    add_card(s3, Inches(0.8), Inches(4.6), Inches(5.6), Inches(2.1), "Human-in-the-Loop Sign-Off", COLOR_GREEN)
    tb = s3.shapes.add_textbox(Inches(1.0), Inches(5.2), Inches(5.2), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Side-by-side review: Extracted fields linked directly to original spoken words.\n• Color-coded safety flags warn the paramedic of missing units or routes.\n• Responder signs off in 1 tap, satisfying strict clinical governance standards."
    p.font.size = Pt(13)
    p.font.color.rgb = COLOR_MUTED

    add_card(s3, Inches(6.9), Inches(4.6), Inches(5.6), Inches(2.1), "Cryptographic Audit Ledger", COLOR_AMBER)
    tb = s3.shapes.add_textbox(Inches(7.1), Inches(5.2), Inches(5.2), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• SHA-256 Hash Chain: Each record anchors to the cryptographic root of the run.\n• Immutable SQLite Triggers: Hard triggers reject any UPDATE or DELETE queries.\n• Handover Transfer Sheet: Auto-generates printable SBAR report for hospital trauma staff."
    p.font.size = Pt(13)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 4: ARCHITECTURE & PIPELINE
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_bg(s4)
    add_header(s4, "System Architecture", "6-Stage Edge Pipeline: From Speech/Glove to Cryptographic Seal", "Modular, decoupled pipeline engineered for high reliability and zero network dependencies.")

    steps = [
        ("1. CAPTURE", "Voice, glove image, or typed field note", COLOR_BLUE),
        ("2. TRANSCRIBE", "whisper.cpp (Audio) & TrOCR (Glove)", COLOR_BLUE),
        ("3. EXTRACT", "MedGemma LLM strict JSON mapping", COLOR_PURPLE),
        ("4. VALIDATE", "n2c2 BERT omission & MIMIC synonym check", COLOR_PURPLE),
        ("5. CONFIRM", "Paramedic signs with Responder ID", COLOR_GREEN),
        ("6. SEAL", "SHA-256 Hash Chain & Handover Sheet", COLOR_AMBER),
    ]

    for idx, (title, desc, color) in enumerate(steps):
        left = Inches(0.8 + idx * 1.95)
        card = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, Inches(2.3), Inches(1.85), Inches(4.4))
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_SURFACE
        card.line.color.rgb = color
        card.line.width = Pt(1.5)

        tb = s4.shapes.add_textbox(left + Inches(0.12), Inches(2.5), Inches(1.6), Inches(4.0))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = f"\n{desc}\n"
        p2.font.size = Pt(13)
        p2.font.color.rgb = COLOR_TEXT

        # Pipeline flow arrows between cards
        if idx < len(steps) - 1:
            arrow_tb = s4.shapes.add_textbox(left + Inches(1.7), Inches(4.2), Inches(0.3), Inches(0.4))
            p_arr = arrow_tb.text_frame.paragraphs[0]
            p_arr.text = "►"
            p_arr.font.size = Pt(16)
            p_arr.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 5: SPEECH ENGINE (whisper.cpp)
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_bg(s5)
    add_header(s5, "Speech-to-Text Subsystem", "whisper.cpp Engine & Pharmaceutical Prompt Conditioning", "Sub-second on-device transcription with low Word Error Rate on emergency medication names.")

    add_card(s5, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "Engine Architecture & Hardware Acceleration", COLOR_BLUE)
    tb = s5.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Model: ggml-small.en.bin (~487.6 MB, 244M params)\n• Zero Dependencies: Written in pure C/C++ (Georgi Gerganov)\n• Apple Silicon Metal Acceleration: libggml-metal.dylib offloads tensors to GPU cores\n• High Speed: ~10x real-time speed (15s voice note in <1.2s)\n• English Dedicated (.en): 100% capacity assigned to English phonemes\n• Resource Footprint: Fits in ~500 MB RAM, easily co-existing with local LLM"
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s5, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Solving the 'Amiodarone Problem' via Hints", COLOR_GREEN)
    tb = s5.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• The Challenge: Rare drug names (e.g. Versed, Adenosine, Zofran) are mistranscribed by generic speech models.\n\n• The Solution: whisper-hint-v1.0 vocabulary conditioning prompt primes the autoregressive decoder.\n\n• Benchmark Result: Drug Word Error Rate reduced from ~24% down to <4% (exceeding NFR-15 benchmark of <= 10%).\n\n• Output Sanitizer: Custom regex cleans whisper-cli engine status and timestamp tags for clean downstream NLP."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 6: VISUAL INTELLIGENCE (TrOCR)
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_bg(s6)
    add_header(s6, "Visual Intelligence Subsystem", "Microsoft TrOCR: Deciphering Scribbled Nitrile Gloves", "Vision Transformer architecture solving the real-world emergency handwritten glove note crisis.")

    add_card(s6, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "The Nitrile Glove Reality", COLOR_AMBER)
    tb = s6.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Emergency Reality:\nParamedics commonly scribble medication doses, IV gauges, and times on the back of their gloves or tape strips.\n\n• Failure of Classical OCR:\nTesseract and classical contour detectors fail on curved, rubbery, wrinkled glove surfaces with low-contrast ink.\n\n• Sanjeevani Lekh Innovation:\nTakes photo directly via camera, runs through TrOCR, and immediately extracts into structured clinical draft."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s6, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Microsoft TrOCR Architecture", COLOR_PURPLE)
    tb = s6.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Model: microsoft/trocr-base-handwritten (~1.33 GB, 334M params)\n\n• Visual Encoder (DeiT):\nData-efficient Image Transformer decomposes image patches into spatial visual tokens.\n\n• Text Decoder (RoBERTa):\nLanguage model decodes handwritten sequences autoregressively.\n\n• Contextual Grammar Reconstruction:\nBecause RoBERTa understands language context, it accurately infers partially smudged letters and medical acronyms."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 7: DUAL-LAYER SAFETY VALIDATION (n2c2 + MIMIC)
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_bg(s7)
    add_header(s7, "Clinical Safety Net", "Dual-Layer Cross-Validation: Harvard n2c2 BERT & MIMIC-III", "Independent discriminative models catching LLM omissions and grounding clinical concepts.")

    add_card(s7, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "Layer 1: Harvard n2c2 Omission Detector", COLOR_GREEN)
    tb = s7.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Model: samrawal/bert-base-uncased_clinical-ner (~436 MB)\n• Benchmark: Harvard DBMI n2c2 / i2b2 ICU Challenges\n• Entity Classes: TREATMENT, PROBLEM, TEST\n\n• The Safety Catch:\nIf the paramedic stated 'Gave 324 mg aspirin and 0.4 mg nitro', but the generative LLM only extracted aspirin, n2c2 detects the missing TREATMENT and triggers an instant 'Omitted Treatment' alert on the screen."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s7, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Layer 2: MIMIC-III Bio_ClinicalBERT Grounding", COLOR_BLUE)
    tb = s7.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Model: emilyalsentzer/Bio_ClinicalBERT (~436 MB)\n• Pretraining: 2+ million ICU discharge summaries and nursing progress notes from Beth Israel Deaconess Medical Center.\n\n• 768-Dim Dense Embeddings:\nMaps informal paramedic field terminology into standardized clinical concepts ('nitro' <-> nitroglycerin, 'epi' <-> epinephrine).\n\n• Zero Hallucination: Grounded purely on clinical ICU language corpora."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 8: CRYPTOGRAPHIC AUDIT CHAIN
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_bg(s8)
    add_header(s8, "Cryptographic Accountability", "Tamper-Evident SHA-256 Hash Chain & Hard SQLite Triggers", "Immutable pre-hospital audit trail providing undeniable legal and clinical proof of administration.")

    add_card(s8, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "SHA-256 Hash Chaining Protocol", COLOR_AMBER)
    tb = s8.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Blockchain-Style Cryptographic Integrity:\nEvery confirmed record seals its payload with:\nHash_N = SHA-256(Hash_{N-1} + Record_ID + Timestamp + FHIR_JSON)\n\n• Genesis Root Validation:\nThe audit log verifies that the hash sequence forms an unbroken link back to the system root.\n\n• One-Click Verification:\nAuditors can verify thousands of records in <5 milliseconds directly from the supervisor dashboard."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s8, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Hard Database Immutability Triggers", COLOR_PURPLE)
    tb = s8.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Built directly into SQLite engine schema:\n  CREATE TRIGGER trig_audit_log_no_update\n  BEFORE UPDATE ON audit_log\n  BEGIN SELECT RAISE(FAIL, 'Updates forbidden'); END;\n\n• Physical Prevention of Tampering:\nEven a database administrator or malicious actor cannot modify or delete past administration records.\n\n• Complete Non-Repudiation for Legal & Clinical Governance."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 9: DUAL UI DESIGN SYSTEMS
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    add_bg(s9)
    add_header(s9, "Tailored User Experiences", "Two Distinct Design Systems for Two Critical Clinical Moments", "Apple-inspired refinement for field responders; Oracle-inspired clarity for supervisors.")

    add_card(s9, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "Field App: Apple Pro Design System", COLOR_BLUE)
    tb = s9.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Target User: Paramedic inside moving ambulance\n• Technology: React + Vite on port 5173\n• Aesthetics: macOS Sequoia / iOS 18 Glassmorphism\n• Interaction Design:\n  - 156px central pulse microphone with concentric ripples\n  - EMS telemetry HUD (GPS, Device Battery, 100% Offline Pill)\n  - Split Review Workspace: Original text vs extracted items\n  - Touch-friendly action pills (Accept Flag, Remove Item)\n  - Instant printable hospital transfer handover sheet"
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s9, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Dashboard: Oracle Redwood Enterprise System", COLOR_AMBER)
    tb = s9.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Target User: Medical Director, Auditor, ED Charge Nurse\n• Technology: Next.js 14 App Router on port 3000\n• Aesthetics: Oracle Redwood Enterprise Design Language\n• Interaction Design:\n  - Georgia serif typographic hierarchy\n  - High-density cryptographic audit table with hash inspector\n  - Fleet analytics: Encounter volume, flag resolution rate\n  - Instant tamper-detection status banner\n  - Export to enterprise hospital EHR via FHIR bundles"
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 10: EVALUATION & BENCHMARKS
    # =========================================================================
    s10 = prs.slides.add_slide(blank_layout)
    add_bg(s10)
    add_header(s10, "Empirical Validation", "Rigorous Clinical Benchmark & Test Suite Results", "Demonstrating high clinical precision, low latency, and 100% test pass rate.")

    metrics = [
        ("F1 >= 0.85", "Clinical Entity Extraction", "Precision & recall across drug, dose, unit, route, and procedures", COLOR_GREEN),
        ("WER < 4%", "Drug Name Audio Accuracy", "Conditioned whisper.cpp beats the strict NFR-15 benchmark of <=10%", COLOR_BLUE),
        ("< 1.5s", "Edge Inference Latency", "End-to-end voice transcription & extraction on standard laptops", COLOR_PURPLE),
        ("85 / 85", "Test Suite 100% Passed", "Full pytest coverage across OCR, Whisper, NER, DB, and FHIR modules", COLOR_AMBER),
    ]

    for idx, (stat, label, detail, color) in enumerate(metrics):
        col = idx % 2
        row = idx // 2
        left = Inches(0.8 + col * 6.0)
        top = Inches(2.3 + row * 2.3)

        card = add_card(s10, left, top, Inches(5.7), Inches(2.0), "", color)
        tb = s10.shapes.add_textbox(left + Inches(0.3), top + Inches(0.2), Inches(5.1), Inches(1.6))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p = tf.paragraphs[0]
        p.text = stat
        p.font.size = Pt(28)
        p.font.bold = True
        p.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = label
        p2.font.size = Pt(15)
        p2.font.bold = True
        p2.font.color.rgb = COLOR_TEXT

        p3 = tf.add_paragraph()
        p3.text = detail
        p3.font.size = Pt(12)
        p3.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 11: LIVE DEMO & HACKATHON HIGHLIGHTS
    # =========================================================================
    s11 = prs.slides.add_slide(blank_layout)
    add_bg(s11)
    add_header(s11, "Live System Demonstration", "1-Click Hackathon Presets & End-to-End Walkthrough", "Three realistic pre-hospital emergency scenarios demonstrating multi-model orchestration.")

    add_card(s11, Inches(0.8), Inches(2.2), Inches(3.7), Inches(4.5), "Scenario A: STEMI Cardiac Arrest", COLOR_AMBER)
    tb = s11.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Input:\n'14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC.'\n\n• Pipeline:\nWhisper transcribes -> MedGemma parses Aspirin 324mg & IV 18G -> n2c2 verifies Treatment.\n\n• Outcome:\nClean record sealed in SHA-256 chain; Handover report ready for cardiac cath lab."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s11, Inches(4.8), Inches(2.2), Inches(3.7), Inches(4.5), "Scenario B: Opioid OD with Flag", RGBColor(244, 63, 94))
    tb = s11.shapes.add_textbox(Inches(5.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Input:\n'Found unresponsive, cyanotic. Gave naloxone intranasal.'\n\n• Safety Flag Triggered:\nMedication has route (IN) but missing numeric dose.\n\n• Human-in-the-Loop:\nSystem surfaces warning badge. Paramedic reviews, enters 2 mg, accepts flag, and signs off."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s11, Inches(8.8), Inches(2.2), Inches(3.7), Inches(4.5), "Scenario C: Glove Scribble OCR", COLOR_PURPLE)
    tb = s11.shapes.add_textbox(Inches(9.0), Inches(2.9), Inches(3.3), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Input:\nCamera snapshot of paramedic glove with handwritten dosages.\n\n• Microsoft TrOCR:\nDeiT + RoBERTa visual transformer decodes handwriting with zero cloud connection.\n\n• Outcome:\nPopulates structured fields side-by-side with raw glove image."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # =========================================================================
    # SLIDE 12: CONCLUSION & FUTURE ROADMAP
    # =========================================================================
    s12 = prs.slides.add_slide(blank_layout)
    add_bg(s12)
    add_header(s12, "Summary & Future Roadmap", "Transforming Emergency Medicine with Trustworthy Edge AI", "Bridging the critical gap between emergency field care and hospital EHRs.")

    add_card(s12, Inches(0.8), Inches(2.2), Inches(5.6), Inches(4.5), "Why Sanjeevani Lekh Wins", COLOR_GREEN)
    tb = s12.shapes.add_textbox(Inches(1.0), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• 100% Offline Independence: Zero cellular drop-outs, zero cloud subscription fees.\n• Solves the Real Paramedic Problem: Hands-free voice and nitrile glove handwriting OCR.\n• Medical Safety First: Dual-layer n2c2/MIMIC BERT cross-checks eliminate LLM hallucinations.\n• Cryptographic Truth: Tamper-evident SHA-256 chain provides undeniable legal auditability.\n• Production-Ready UI: Apple Pro field app + Oracle Redwood audit console."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    add_card(s12, Inches(6.9), Inches(2.2), Inches(5.6), Inches(4.5), "Immediate Future Roadmap", COLOR_BLUE)
    tb = s12.shapes.add_textbox(Inches(7.1), Inches(2.9), Inches(5.2), Inches(3.5))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "• Phase 1 (Near-Term):\nDirect Bluetooth telemetry link to Zoll and Physio-Control LIFEPAK cardiac monitors.\n\n• Phase 2 (Mid-Term):\nNEMSIS v3.5 and FHIR R4 automated hospital EHR dispatch sync upon ambulance arrival.\n\n• Phase 3 (Long-Term):\nMultilingual paramedic model extensions with Whisper fine-tuning for regional languages."
    p.font.size = Pt(14)
    p.font.color.rgb = COLOR_MUTED

    # Bottom team footer
    tb_foot = s12.shapes.add_textbox(Inches(0.8), Inches(6.9), Inches(11.7), Inches(0.4))
    tf_f = tb_foot.text_frame
    p_f = tf_f.paragraphs[0]
    p_f.text = "Thank You! Questions & Live Demo Welcome. | Presented by: Milind Verma • Aditya Bipin Kulkarni • Gaurav Kumar • Nikhil Agarwal"
    p_f.font.size = Pt(12)
    p_f.font.bold = True
    p_f.font.color.rgb = COLOR_BLUE

    # Save
    prs.save(str(output_path))
    print(f"[+] Presentation successfully created at {output_path}")


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent.parent
    create_presentation(out_dir / "Sanjeevani_Lekh_Presentation.pptx")
