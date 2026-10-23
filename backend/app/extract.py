"""Clinical entity extraction module invoking local Ollama.

Forces JSON schema validation and zero-guessing principles.
"""

from functools import lru_cache
import json
import logging
import re
import time
from typing import Any, Tuple

import ollama
from pydantic import ValidationError

from app.config import settings
from app.med_indications import get_medication_indication
from app.schemas import ExtractionResult, get_extraction_json_schema

logger = logging.getLogger(__name__)


class OllamaServiceError(Exception):
    """Raised when the local Ollama service cannot be reached."""


class ExtractionError(Exception):
    """Raised when the LLM output fails schema validation even after retry."""


@lru_cache(maxsize=4)
def load_prompt(filename: str) -> str:
    """Loads and caches a prompt file from the versioned prompts directory."""
    prompt_file = settings.PROMPTS_DIR / filename
    if not prompt_file.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
    return prompt_file.read_text(encoding="utf-8")


def _build_user_message(note_text: str) -> str:
    """Formats the note in the delimiter structure specified in PROMPTS.md."""
    return f"FIELD NOTE:\n<<<\n{note_text.strip()}\n>>>"


def _parse_llm_json(raw_text: str) -> ExtractionResult:
    """Parses raw text into validated ExtractionResult, handling thinking tags and formatting."""
    cleaned = raw_text.strip()
    # Strip any <think>...</think> blocks from reasoning models
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned).strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    # Try extracting JSON object directly
    json_match = re.search(r"(\{[\s\S]*\})", cleaned)
    if json_match:
        cleaned = json_match.group(1).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model output is not valid JSON: {exc}") from exc

    try:
        return ExtractionResult.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Schema validation failed: {exc}") from exc


def extract_clinical_data(
    note_text: str,
    client: ollama.Client | None = None,
) -> Tuple[ExtractionResult, int]:
    """Extracts medications and procedures from note text using local Ollama.

    Args:
        note_text: Raw clinical note text.
        client: Optional preconfigured Ollama client (injected for testing).

    Returns:
        Tuple of (ExtractionResult, elapsed_time_ms).

    Raises:
        OllamaServiceError: If Ollama daemon is unreachable.
        ExtractionError: If extraction fails schema validation twice.
    """
    if not note_text or not note_text.strip():
        return ExtractionResult(medications=[], procedures=[]), 0

    system_prompt = load_prompt("extract_v1.txt")
    retry_prompt = load_prompt("extract_retry_v1.txt")
    user_message = _build_user_message(note_text)
    json_schema = get_extraction_json_schema()

    active_client = client or ollama.Client(host=settings.OLLAMA_BASE_URL, timeout=10.0)
    options: dict[str, Any] = {
        "temperature": settings.LLM_TEMPERATURE,
        "num_predict": 512,
        "seed": settings.LLM_SEED,
    }

    start_time = time.perf_counter()

    # First extraction attempt (think=False avoids reasoning delay)
    try:
        response = active_client.chat(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            format=json_schema,
            think=False,
            options=options,
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
    except TypeError:
        # Fallback if older ollama client doesn't accept think parameter
        response = active_client.chat(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            format=json_schema,
            options=options,
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
    except Exception as exc:
        # Never log clinical note_text
        logger.error("Failed to connect to Ollama service: %s", type(exc).__name__)
        raise OllamaServiceError("Ollama service unreachable or returned error") from exc

    content = ""
    if hasattr(response, "message"):
        content = response.message.content or getattr(response.message, "thinking", "") or ""
    elif isinstance(response, dict) and "message" in response:
        content = response["message"].get("content") or response["message"].get("thinking") or ""

    try:
        result = _parse_llm_json(content)
        for med in result.medications:
            if not med.indication:
                med.indication = get_medication_indication(med.drug, client=active_client)
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info("Extraction completed successfully in %d ms", elapsed_ms)
        return result, elapsed_ms
    except ValueError as parse_err:
        logger.warning("First attempt failed schema validation: %s. Retrying once.", parse_err)

    # Retry attempt with strict retry instruction
    try:
        retry_response = active_client.chat(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": content},
                {"role": "user", "content": retry_prompt},
            ],
            format=json_schema,
            think=False,
            options=options,
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
    except TypeError:
        retry_response = active_client.chat(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": content},
                {"role": "user", "content": retry_prompt},
            ],
            format=json_schema,
            options=options,
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
    except Exception as final_err:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.error("Extraction failed on retry after %d ms: %s", elapsed_ms, type(final_err).__name__)
        raise ExtractionError("LLM failed to return valid schema output after retry") from final_err

    retry_content = ""
    if hasattr(retry_response, "message"):
        retry_content = retry_response.message.content or getattr(retry_response.message, "thinking", "") or ""
    elif isinstance(retry_response, dict) and "message" in retry_response:
        retry_content = retry_response["message"].get("content") or retry_response["message"].get("thinking") or ""

    try:
        result = _parse_llm_json(retry_content)
        for med in result.medications:
            if not med.indication:
                med.indication = get_medication_indication(med.drug, client=active_client)
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info("Extraction succeeded on retry in %d ms", elapsed_ms)
        return result, elapsed_ms
    except Exception as final_err:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.error("Extraction failed on retry after %d ms: %s", elapsed_ms, type(final_err).__name__)
        raise ExtractionError("LLM failed to return valid schema output after retry") from final_err


def generate_clinical_summary(note_text: str, client: ollama.Client | None = None) -> str:
    """Uses Ollama to generate a concise, professional clinical handover narrative from raw notes."""
    if not note_text or not note_text.strip():
        return ""

    active_client = client or ollama.Client(host=settings.OLLAMA_BASE_URL, timeout=4.0)
    prompt = (
        "You are an emergency medical service (EMS) documentation assistant. "
        "Write a concise, professional 2-3 sentence clinical handover summary of the administered "
        "medications, procedures, and patient condition from the field note. Do not explain, return ONLY the narrative paragraph."
    )
    try:
        try:
            resp = active_client.chat(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": note_text.strip()},
                ],
                think=False,
                options={"temperature": 0.0, "num_predict": 200},
                keep_alive=settings.LLM_KEEP_ALIVE,
            )
        except TypeError:
            resp = active_client.chat(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": note_text.strip()},
                ],
                options={"temperature": 0.0, "num_predict": 200},
                keep_alive=settings.LLM_KEEP_ALIVE,
            )

        content = ""
        if hasattr(resp, "message"):
            content = resp.message.content or getattr(resp.message, "thinking", "") or ""
        elif isinstance(resp, dict) and "message" in resp:
            content = resp["message"].get("content") or resp["message"].get("thinking") or ""

        # Clean thinking blocks if present
        clean = re.sub(r"<think>[\s\S]*?</think>", "", content).strip()
        if clean:
            return clean
    except Exception as exc:
        logger.warning("Failed to generate clinical summary with Ollama: %s", exc)

    return f"Clinical encounter documented: {note_text.strip()}"

