"""Groq cloud client used in online mode.

Sends the note text (or recorded audio) to Groq's OpenAI-compatible API for extraction,
summary and transcription. Every function raises CloudError on any failure so that the
caller can fall back to the local Ollama / whisper path. Never logs clinical text.
"""

import json
import logging
import mimetypes
from pathlib import Path
import time
from typing import Tuple

import httpx

from app.config import settings
from app.med_indications import MEDICATION_INDICATIONS
from app.schemas import ExtractionResult

logger = logging.getLogger(__name__)

ONLINE = "online"
OFFLINE = "offline"


class CloudError(Exception):
    """Raised when the Groq cloud call fails for any reason."""


def resolve_mode(requested: str | None) -> str:
    """Returns 'online' or 'offline' for a request.

    An explicit X-Processing-Mode header wins. Otherwise PROCESSING_MODE decides:
    'offline' stays local, anything else ('auto') goes online when a key is configured.
    Online mode still falls back to local processing if the cloud call fails.
    """
    choice = (requested or "").strip().lower()
    if choice not in (ONLINE, OFFLINE):
        choice = OFFLINE if settings.PROCESSING_MODE.strip().lower() == OFFLINE else ONLINE
    if choice == ONLINE and not settings.GROQ_API_KEY:
        return OFFLINE
    return choice


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}


def _chat(messages: list[dict[str, str]], *, json_mode: bool, max_tokens: int) -> str:
    payload: dict = {
        "model": settings.GROQ_LLM_MODEL,
        "messages": messages,
        "temperature": settings.LLM_TEMPERATURE,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if "gpt-oss" in settings.GROQ_LLM_MODEL:
        # Reasoning models spend tokens thinking first; keep that small so the answer fits
        payload["reasoning_effort"] = "low"
    try:
        resp = httpx.post(
            f"{settings.GROQ_BASE_URL}/chat/completions",
            headers=_headers(),
            json=payload,
            timeout=settings.GROQ_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"] or ""
    except Exception as exc:
        logger.warning("Groq chat request failed: %s", type(exc).__name__)
        raise CloudError("Groq chat request failed") from exc


def extract_clinical_data(note_text: str) -> Tuple[ExtractionResult, int]:
    """Extracts medications and procedures with Groq. Same prompts and schema as the local path."""
    # Imported here to reuse the local prompt loader and parser without a circular import at module load
    from app.extract import _build_user_message, _parse_llm_json, load_prompt

    if not note_text or not note_text.strip():
        return ExtractionResult(medications=[], procedures=[]), 0

    system_prompt = load_prompt("extract_v1.txt")
    retry_prompt = load_prompt("extract_retry_v1.txt")
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": _build_user_message(note_text)},
    ]
    start = time.perf_counter()

    content = _chat(messages, json_mode=True, max_tokens=1500)
    try:
        result = _parse_llm_json(content)
    except ValueError:
        logger.warning("Groq output failed schema validation. Retrying once.")
        retry_messages = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": retry_prompt},
        ]
        try:
            result = _parse_llm_json(_chat(retry_messages, json_mode=True, max_tokens=1500))
        except ValueError as exc:
            raise CloudError("Groq returned invalid schema output after retry") from exc

    for med in result.medications:
        if not med.indication:
            med.indication = MEDICATION_INDICATIONS.get((med.drug or "").strip().lower())
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    logger.info("Groq extraction completed in %d ms", elapsed_ms)
    return result, elapsed_ms


def generate_clinical_summary(note_text: str) -> str:
    """Two to three sentence handover summary from Groq."""
    if not note_text or not note_text.strip():
        return ""
    prompt = (
        "You are an emergency medical service (EMS) documentation assistant. "
        "Write a concise, professional 2-3 sentence clinical handover summary of the administered "
        "medications, procedures, and patient condition from the field note. "
        "Do not explain, return ONLY the narrative paragraph."
    )
    return _chat(
        [{"role": "system", "content": prompt}, {"role": "user", "content": note_text.strip()}],
        json_mode=False,
        max_tokens=600,
    ).strip()


def transcribe_audio(audio_path: str | Path) -> Tuple[str, int]:
    """Transcribes an audio file with Groq's hosted Whisper."""
    from app.transcribe import load_whisper_hint_prompt

    path = Path(audio_path)
    if not path.exists():
        raise CloudError("Audio file not found")
    start = time.perf_counter()
    mime = mimetypes.guess_type(path.name)[0] or "audio/wav"
    data = {
        "model": settings.GROQ_WHISPER_MODEL,
        "language": "en",
        "temperature": "0",
        "response_format": "json",
    }
    hint = load_whisper_hint_prompt()
    if hint:
        data["prompt"] = hint[:800]
    try:
        with path.open("rb") as fh:
            resp = httpx.post(
                f"{settings.GROQ_BASE_URL}/audio/transcriptions",
                headers=_headers(),
                data=data,
                files={"file": (path.name, fh, mime)},
                timeout=max(settings.GROQ_TIMEOUT_SECONDS, 60.0),
            )
        resp.raise_for_status()
        text = (resp.json().get("text") or "").strip()
    except Exception as exc:
        logger.warning("Groq transcription failed: %s", type(exc).__name__)
        raise CloudError("Groq transcription failed") from exc
    if not text:
        raise CloudError("Groq returned an empty transcript")
    return text, int((time.perf_counter() - start) * 1000)


def list_models() -> list[str]:
    """Model IDs visible to the configured key. Used by the health check and for diagnostics."""
    try:
        resp = httpx.get(f"{settings.GROQ_BASE_URL}/models", headers=_headers(), timeout=5.0)
        resp.raise_for_status()
        return sorted(m["id"] for m in resp.json().get("data", []))
    except Exception as exc:
        raise CloudError("Groq model list failed") from exc
