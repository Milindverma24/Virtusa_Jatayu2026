"""Clinical NLP Engine integrating n2c2 NER and MIMIC-III ClinicalBERT.

Provides dual-layer validation for Sanjeevani Lekh:
1. n2c2 Clinical Concept Extraction (samrawal/bert-base-uncased_clinical-ner)
   - Extracts treatment (medications, procedures), problem (symptoms, conditions), and test entities.
   - Detects potential missed treatments and verifies extracted items.
2. MIMIC-III Clinical Representations (emilyalsentzer/Bio_ClinicalBERT)
   - Generates 768-dimensional contextual clinical embeddings for semantic similarity and clustering.
"""

from functools import lru_cache
import logging
import re
from typing import Any

from app.config import settings
from app.schemas import ClinicalCrossCheckResult, ClinicalEntity, ExtractionResult

logger = logging.getLogger(__name__)

# Cached pipeline & model singletons
_n2c2_pipeline: Any = None
_mimic_tokenizer: Any = None
_mimic_model: Any = None
_device: str | None = None


def _get_device() -> str:
    """Detects available hardware acceleration (Apple Silicon MPS or CPU)."""
    global _device
    if _device is None:
        try:
            import torch

            if torch.backends.mps.is_available():
                _device = "mps"
            elif torch.cuda.is_available():
                _device = "cuda"
            else:
                _device = "cpu"
        except Exception:
            _device = "cpu"
    return _device


def get_n2c2_pipeline() -> Any:
    """Lazy loader for the n2c2-trained clinical NER pipeline."""
    global _n2c2_pipeline
    if _n2c2_pipeline is None:
        try:
            from transformers import pipeline

            device = _get_device()
            logger.info("Loading n2c2 Clinical NER model (%s) on %s...", settings.N2C2_MODEL_NAME, device)
            _n2c2_pipeline = pipeline(
                "token-classification",
                model=settings.N2C2_MODEL_NAME,
                aggregation_strategy="simple",
                device=device,
            )
            logger.info("n2c2 Clinical NER model loaded successfully.")
        except Exception as exc:
            logger.warning("Could not load n2c2 Clinical NER pipeline: %s", exc)
            _n2c2_pipeline = False
    return _n2c2_pipeline if _n2c2_pipeline is not False else None


def get_mimic_model() -> tuple[Any, Any]:
    """Lazy loader for MIMIC-III Bio_ClinicalBERT tokenizer and model."""
    global _mimic_tokenizer, _mimic_model
    if _mimic_tokenizer is None or _mimic_model is None:
        try:
            from transformers import AutoModel, AutoTokenizer

            device = _get_device()
            logger.info("Loading MIMIC-III Bio_ClinicalBERT model (%s) on %s...", settings.MIMIC_MODEL_NAME, device)
            _mimic_tokenizer = AutoTokenizer.from_pretrained(settings.MIMIC_MODEL_NAME)
            model = AutoModel.from_pretrained(settings.MIMIC_MODEL_NAME)
            _mimic_model = model.to(device).eval()
            logger.info("MIMIC-III Bio_ClinicalBERT model loaded successfully.")
        except Exception as exc:
            logger.warning("Could not load MIMIC-III model: %s", exc)
            _mimic_tokenizer = False
            _mimic_model = False
    if _mimic_tokenizer is False or _mimic_model is False:
        return None, None
    return _mimic_tokenizer, _mimic_model


def _merge_subword_tokens(raw_results: list[dict[str, Any]], original_text: str) -> list[dict[str, Any]]:
    """Merges contiguous subword tokens into full clinical words using character offsets."""
    if not raw_results:
        return []

    merged: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for item in raw_results:
        word = item.get("word", "")
        start = item.get("start")
        end = item.get("end")
        group = item.get("entity_group", "")
        score = float(item.get("score", 0.0))

        if current is None:
            current = {"word": word, "start": start, "end": end, "entity_group": group, "scores": [score]}
            continue

        is_adjacent = start is not None and current["end"] is not None and start == current["end"]
        is_subword = word.startswith("##")

        if current["entity_group"] == group and (is_adjacent or is_subword):
            current["end"] = end
            current["scores"].append(score)
            if current["start"] is not None and end is not None and original_text:
                current["word"] = original_text[current["start"]:end]
            else:
                current["word"] = current["word"] + word.lstrip("#")
        else:
            current["score"] = sum(current["scores"]) / len(current["scores"])
            merged.append(current)
            current = {"word": word, "start": start, "end": end, "entity_group": group, "scores": [score]}

    if current is not None:
        current["score"] = sum(current["scores"]) / len(current["scores"])
        merged.append(current)

    return merged


def _clean_entity_text(text: str) -> str:
    """Removes leading/trailing punctuation and cleans subword artifacts."""
    cleaned = re.sub(r"##", "", text)
    cleaned = re.sub(r"^[^\w]+|[^\w]+$", "", cleaned)
    return cleaned.strip()


def extract_clinical_entities(note_text: str) -> list[ClinicalEntity]:
    """Extracts clinical concepts using the n2c2 BERT NER model.

    Recognizes:
    - treatment: medications, dosages, procedures
    - problem: symptoms, diagnoses, patient status
    - test: diagnostic tests, vitals, readings
    """
    pipe = get_n2c2_pipeline()
    if not pipe or not note_text.strip():
        return []

    try:
        raw_results = pipe(note_text.strip())
        merged_results = _merge_subword_tokens(raw_results, note_text.strip())
        entities: list[ClinicalEntity] = []
        seen: set[tuple[str, str]] = set()

        for item in merged_results:
            group = item.get("entity_group", "").lower()
            word = _clean_entity_text(item.get("word", ""))
            score = float(item.get("score", 0.0))
            start = item.get("start")
            end = item.get("end")

            if not word or len(word) < 2:
                continue

            # Standardize category
            if group in ("treatment", "problem", "test"):
                category = group
            else:
                category = "other"

            key = (word.lower(), category)
            if key not in seen:
                seen.add(key)
                entities.append(
                    ClinicalEntity(
                        text=word,
                        category=category,
                        score=round(score, 4),
                        start=start,
                        end=end,
                    )
                )
        return entities
    except Exception as exc:
        logger.error("n2c2 NER inference failed: %s", exc)
        return []


def get_mimic_embedding(text: str) -> list[float] | None:
    """Computes a 768-dim normalized clinical embedding using MIMIC-III Bio_ClinicalBERT."""
    tok, model = get_mimic_model()
    if not tok or not model or not text.strip():
        return None

    try:
        import torch

        device = _get_device()
        inputs = tok(text.strip(), return_tensors="pt", truncation=True, max_length=512).to(device)

        with torch.no_grad():
            outputs = model(**inputs)
            # Mean pooling over token embeddings with attention mask
            token_embeddings = outputs.last_hidden_state
            input_mask_expanded = inputs["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
            sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
            sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
            mean_pooled = sum_embeddings / sum_mask

            # L2 normalize
            norm_pooled = torch.nn.functional.normalize(mean_pooled, p=2, dim=1)
            return [round(float(v), 6) for v in norm_pooled[0].tolist()]
    except Exception as exc:
        logger.error("MIMIC-III embedding generation failed: %s", exc)
        return None


def cross_check_extraction(
    raw_text: str,
    extraction: ExtractionResult,
) -> ClinicalCrossCheckResult:
    """Cross-validates LLM/rule extractions against n2c2 NER and MIMIC-III models."""
    if not settings.ENABLE_CLINICAL_NER or not raw_text.strip():
        return ClinicalCrossCheckResult(
            verified_treatments=[],
            potential_missed_treatments=[],
            entities=[],
            agreement_score=1.0,
            mimic_embedding_dim=768,
        )

    entities = extract_clinical_entities(raw_text)
    treatment_entities = [e for e in entities if e.category == "treatment"]

    # Build lookup of extracted item terms
    extracted_terms = set()
    for med in extraction.medications:
        extracted_terms.add(med.drug.lower())
        for token in med.drug.lower().split():
            extracted_terms.add(token)
    for proc in extraction.procedures:
        extracted_terms.add(proc.name.lower())
        for token in proc.name.lower().split():
            extracted_terms.add(token)

    verified: list[str] = []
    missed: list[str] = []

    for t in treatment_entities:
        t_lower = t.text.lower()
        # Check if treatment matches any extracted drug or procedure
        matches = any(t_lower in term or term in t_lower for term in extracted_terms)
        if matches:
            if t.text not in verified:
                verified.append(t.text)
        elif t.score >= 0.85 and len(t_lower) > 2:
            # High-confidence treatment found in text that was not extracted
            # Filter out common false positives (e.g. standalone numbers or units)
            if not t_lower.isdigit() and t_lower not in {"mg", "mcg", "g", "ml", "po", "iv", "im"}:
                if t.text not in missed:
                    missed.append(t.text)

    # Agreement score calculation
    total_treatments = len(treatment_entities)
    if total_treatments > 0:
        agreement = len(verified) / max(len(verified) + len(missed), 1)
    else:
        agreement = 1.0

    return ClinicalCrossCheckResult(
        verified_treatments=verified,
        potential_missed_treatments=missed,
        entities=entities,
        agreement_score=round(agreement, 2),
        mimic_embedding_dim=768,
    )
