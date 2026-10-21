"""Clinical entity extraction module invoking local Ollama.

Forces JSON schema validation and zero-guessing principles.
"""

from functools import lru_cache
import json
import logging
import time
from typing import Any, Tuple

import ollama
from pydantic import ValidationError

from app.config import settings
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
    """Parses raw text into validated ExtractionResult."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
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

    active_client = client or ollama.Client(host=settings.OLLAMA_BASE_URL)
    options: dict[str, Any] = {
        "temperature": settings.LLM_TEMPERATURE,
        "num_predict": 2048,
        "seed": settings.LLM_SEED,
    }

    start_time = time.perf_counter()

    # First extraction attempt
    try:
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

    content = response.message.content if hasattr(response, "message") else response["message"]["content"]

    try:
        result = _parse_llm_json(content)
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
            options=options,
            keep_alive=settings.LLM_KEEP_ALIVE,
        )
        retry_content = (
            retry_response.message.content
            if hasattr(retry_response, "message")
            else retry_response["message"]["content"]
        )
        result = _parse_llm_json(retry_content)
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.info("Extraction succeeded on retry in %d ms", elapsed_ms)
        return result, elapsed_ms
    except Exception as final_err:
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        logger.error("Extraction failed on retry after %d ms: %s", elapsed_ms, type(final_err).__name__)
        raise ExtractionError("LLM failed to return valid schema output after retry") from final_err
