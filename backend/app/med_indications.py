"""Clinical medication indications and therapeutic uses knowledge base."""

import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# Primary clinical uses for emergency and clinical medications
MEDICATION_INDICATIONS: dict[str, str] = {
    "aspirin": "Antiplatelet agent / Acute Coronary Syndrome (ACS), suspected myocardial infarction (prevents platelet aggregation and coronary thrombus enlargement)",
    "asa": "Antiplatelet agent / Acute Coronary Syndrome (ACS), suspected myocardial infarction",
    "nitroglycerin": "Potent vasodilator / Relief of acute angina pectoris, ischemic cardiac chest pain, and cardiogenic pulmonary edema",
    "nitro": "Potent vasodilator / Relief of acute angina pectoris, ischemic cardiac chest pain",
    "ntg": "Potent vasodilator / Relief of acute angina pectoris, ischemic cardiac chest pain",
    "epinephrine": "Sympathomimetic inotrope & vasopressor / Severe anaphylaxis, cardiac arrest (VF/pVT/asystole/PEA), and acute severe bronchospasm",
    "epi": "Sympathomimetic inotrope & vasopressor / Severe anaphylaxis, cardiac arrest, acute bronchospasm",
    "naloxone": "Competitive opioid receptor antagonist / Complete or partial reversal of opioid-induced respiratory depression and acute overdose",
    "narcan": "Competitive opioid receptor antagonist / Reversal of opioid-induced respiratory depression and acute overdose",
    "albuterol": "Short-acting beta-2 adrenergic bronchodilator / Rapid relief of acute bronchospasm in asthma, COPD, and allergic bronchoconstriction",
    "ventolin": "Short-acting beta-2 adrenergic bronchodilator / Rapid relief of acute bronchospasm in asthma and COPD",
    "ipratropium": "Anticholinergic bronchodilator / Adjunctive bronchodilation for severe bronchospasm in acute asthma or COPD exacerbations",
    "atrovent": "Anticholinergic bronchodilator / Adjunctive bronchodilation in severe bronchospasm",
    "ondansetron": "Selective 5-HT3 receptor antagonist antiemetic / Prevention and control of acute nausea and severe vomiting",
    "zofran": "Selective 5-HT3 receptor antagonist antiemetic / Prevention and control of acute nausea and vomiting",
    "midazolam": "Short-acting benzodiazepine anticonvulsant & sedative / Termination of status epilepticus, acute seizures, procedural sedation, and chemical restraint",
    "versed": "Short-acting benzodiazepine / Termination of status epilepticus, acute seizures, sedation",
    "dextrose": "Monosaccharide carbohydrate replenishment / Immediate correction of acute symptomatic hypoglycemia and altered mental status",
    "d50": "Concentrated dextrose (50%) / Rapid restoration of blood glucose in acute severe hypoglycemia",
    "d10": "Dextrose (10%) / Controlled correction of symptomatic hypoglycemia",
    "glucagon": "Hyperglycemic polypeptide hormone / Treatment of severe hypoglycemia when IV access is unobtainable; beta-blocker overdose antidote",
    "morphine": "Opioid analgesic / Analgesia for moderate-to-severe acute pain, acute ischemic cardiac pain, and pulmonary edema preload reduction",
    "fentanyl": "Potent synthetic opioid analgesic / Rapid-onset analgesia for severe acute trauma, burn injuries, and procedural analgesia",
    "amiodarone": "Class III antiarrhythmic / Treatment and prophylaxis of shock-refractory VF, pulseless VT, and hemodynamically stable ventricular tachycardia",
    "adenosine": "Endogenous purine nucleoside antiarrhythmic / Rapid conversion of paroxysmal supraventricular tachycardia (PSVT / SVT) to normal sinus rhythm",
    "atropine": "Anticholinergic vagolytic / Immediate treatment of hemodynamically unstable bradycardia; organophosphate poisoning antidote",
    "oxygen": "Supplemental medical gas / Correction of tissue hypoxia, acute respiratory distress, cyanosis, shock, and major trauma (SpO2 < 94%)",
    "furosemide": "Loop diuretic / Rapid reduction of fluid overload in acute decompensated heart failure and cardiogenic pulmonary edema",
    "lasix": "Loop diuretic / Reduction of fluid overload in acute heart failure and pulmonary edema",
    "diphenhydramine": "First-generation H1 antihistamine / Treatment of acute allergic reactions, adjunctive anaphylaxis therapy, and acute dystonic reactions",
    "benadryl": "First-generation H1 antihistamine / Treatment of allergic reactions and anaphylaxis adjunct",
    "calcium chloride": "Electrolyte solution / Membrane stabilization in severe hyperkalemia; antidote for calcium channel blocker toxicity",
    "calcium gluconate": "Electrolyte solution / Membrane stabilization in severe hyperkalemia; treatment of hypocalcemia",
    "sodium bicarbonate": "Systemic alkalinizer / Treatment of severe metabolic acidosis; cardiac arrest adjunct; alkalinization in tricyclic antidepressant (TCA) toxicity",
    "magnesium sulfate": "Mineral electrolyte / Suppression of eclamptic seizures; treatment of torsades de pointes; bronchodilation in refractory acute severe asthma",
    "ketamine": "NMDA receptor antagonist dissociative anesthetic / Rapid analgesia, sedation for excited delirium, rapid sequence induction (RSI)",
    "ketorolac": "Injectable NSAID analgesic / Moderate-to-severe acute musculoskeletal pain, renal colic, and post-traumatic inflammatory pain",
    "toradol": "Injectable NSAID analgesic / Moderate-to-severe acute pain, renal colic",
    "lorazepam": "Intermediate-acting benzodiazepine / Control of status epilepticus, prolonged acute seizures, acute severe anxiety/agitation",
    "ativan": "Intermediate-acting benzodiazepine / Control of status epilepticus and acute seizures",
    "diazepam": "Long-acting benzodiazepine / Termination of acute prolonged seizures, muscle spasm relaxation",
    "valium": "Long-acting benzodiazepine / Termination of acute seizures, muscle spasm relaxation",
    "paracetamol": "Non-opioid analgesic & antipyretic / Relief of mild-to-moderate pain, reduction of acute pyrexia (fever)",
    "acetaminophen": "Non-opioid analgesic & antipyretic / Relief of mild-to-moderate pain, reduction of acute pyrexia (fever)",
    "tylenol": "Non-opioid analgesic & antipyretic / Relief of mild-to-moderate pain, fever reduction",
    "ibuprofen": "NSAID anti-inflammatory & analgesic / Relief of inflammatory musculoskeletal pain, fever reduction",
    "advil": "NSAID anti-inflammatory & analgesic / Relief of inflammatory pain, fever reduction",
    "methylprednisolone": "Systemic glucocorticoid corticosteroid / Suppression of airway inflammation in acute severe asthma, COPD exacerbation, and anaphylaxis",
    "solu-medrol": "Systemic corticosteroid / Airway inflammation suppression in severe asthma/COPD",
    "dexamethasone": "Long-acting glucocorticoid / Reduction of airway edema in croup, acute bronchospasm, and severe allergic reactions",
    "decadron": "Long-acting glucocorticoid / Reduction of airway edema and inflammation",
    "ceftriaxone": "Broad-spectrum third-generation cephalosporin / Empiric antimicrobial therapy for suspected severe bacterial sepsis and meningitis",
    "tranexamic acid": "Synthetic lysine-analog antifibrinolytic / Reduction of microvascular bleeding and hyperfibrinolysis in severe traumatic hemorrhage",
    "txa": "Antifibrinolytic / Reduction of hyperfibrinolytic bleeding in severe traumatic hemorrhage",
    "heparin": "Anticoagulant / Prevention and propagation of intracoronary thrombus in acute STEMI / NSTEMI and pulmonary embolism",
    "clopidogrel": "P2Y12 platelet inhibitor / Secondary antiplatelet aggregation inhibitor in acute coronary syndrome and STEMI",
    "plavix": "P2Y12 platelet inhibitor / Secondary antiplatelet aggregation inhibitor in acute coronary syndrome",
}


def get_medication_indication(drug_name: str, client: Optional[Any] = None) -> str:
    """Returns the primary clinical use/indication for a medication.

    Checks the instant offline emergency pharmacology dictionary first.
    Falls back to local Ollama query if the medication is unlisted.
    """
    clean_name = (drug_name or "").strip().lower()
    if clean_name in MEDICATION_INDICATIONS:
        return MEDICATION_INDICATIONS[clean_name]

    # Partial substring match
    for key, val in MEDICATION_INDICATIONS.items():
        if key in clean_name or clean_name in key:
            return val

    # Ollama fallback for rare/unlisted medications
    try:
        import ollama
        from app.config import settings

        active_client = client or ollama.Client(host=settings.OLLAMA_BASE_URL)
        prompt = (
            f"In 1 short sentence, state the primary clinical medical indication and therapeutic use of {drug_name}."
            " Do not explain, return ONLY the indication."
        )
        resp = active_client.chat(
            model=settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            think=False,
            options={"temperature": 0.0, "num_predict": 60},
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
        content = ""
        if hasattr(resp, "message"):
            content = resp.message.content or getattr(resp.message, "thinking", "") or ""
        elif isinstance(resp, dict) and "message" in resp:
            content = resp["message"].get("content") or resp["message"].get("thinking") or ""
        clean = content.strip().replace("\n", " ")
        if clean:
            return clean
    except Exception as exc:
        logger.warning("Could not fetch indication from Ollama for %s: %s", drug_name, exc)

    return "Therapeutic pharmaceutical administration per clinical protocol"
