"""Offline voice transcription module using whisper.cpp and medical vocabulary hints."""

from functools import lru_cache
import logging
from pathlib import Path
import re
import subprocess
import time
from typing import Tuple

from app.config import settings

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Raised when audio transcription fails."""


@lru_cache(maxsize=2)
def load_whisper_hint_prompt() -> str:
    """Loads and caches the medical vocabulary hint prompt."""
    hint_file = settings.PROMPTS_DIR / "whisper_hint_v1.txt"
    if hint_file.exists():
        return hint_file.read_text(encoding="utf-8").strip()
    return ""


def clean_whisper_output(raw_output: str) -> str:
    """Extracts spoken clinical text from whisper-cli output, stripping log headers."""
    lines = raw_output.splitlines()
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        # Filter out whisper-cli status/info lines
        if not stripped:
            continue
        if stripped.startswith("read_audio_data:") or stripped.startswith("whisper_"):
            continue
        if stripped.startswith("main: processing") or stripped.startswith("system_info:"):
            continue
        if stripped.startswith("ggml_"):
            continue
        # Remove timestamp markers if any remain like [00:00:00.000 --> 00:00:11.000]
        cleaned_line = re.sub(r"\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*", "", stripped)
        if cleaned_line:
            clean_lines.append(cleaned_line)

    return " ".join(clean_lines).strip()


_asr_pipeline = None


def get_asr_pipeline():
    """Lazy loader for local Whisper ASR pipeline."""
    global _asr_pipeline
    if _asr_pipeline is None:
        try:
            from transformers import pipeline
            _asr_pipeline = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en")
            logger.info("Local Whisper ASR pipeline loaded successfully.")
        except Exception as exc:
            logger.warning("Could not load Transformers Whisper pipeline: %s", exc)
            _asr_pipeline = False
    return _asr_pipeline if _asr_pipeline is not False else None


def transcribe_audio(audio_path: str | Path) -> Tuple[str, int]:
    """Transcribes an audio file into plain text using whisper-cli or local Whisper pipeline.

    Args:
        audio_path: Path to the audio file (.wav, .mp3, .ogg, .flac).

    Returns:
        Tuple of (transcribed_text, elapsed_ms).

    Raises:
        TranscriptionError: If audio file is missing or speech transcription fails.
    """
    path_obj = Path(audio_path)
    if not path_obj.exists():
        raise TranscriptionError(f"Audio file not found: {audio_path}")

    start_time = time.perf_counter()
    cli_path = settings.WHISPER_CLI_PATH
    model_path = settings.WHISPER_MODEL_PATH

    # Method 1: Use whisper.cpp C/C++ CLI if available
    if cli_path.exists() and model_path.exists():
        hint_prompt = load_whisper_hint_prompt()
        cmd = [
            str(cli_path),
            "-m",
            str(model_path),
            "-f",
            str(path_obj.resolve()),
            "-nt",
            "-np",
        ]
        if hint_prompt:
            cmd.extend(["--prompt", hint_prompt])

        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=120,
            )
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            if proc.returncode == 0:
                text = clean_whisper_output(proc.stdout)
                logger.info("Transcribed audio via whisper.cpp (%s) in %d ms", path_obj.name, elapsed_ms)
                return text, elapsed_ms
        except Exception as exc:
            logger.warning("whisper.cpp failed, falling back to Python ASR: %s", exc)

    # Method 2: Local Whisper pipeline
    asr = get_asr_pipeline()
    if asr is not None:
        try:
            res = asr(str(path_obj.resolve()))
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            raw_text = res.get("text", "").strip() if isinstance(res, dict) else str(res).strip()
            logger.info("Transcribed audio via Python Whisper (%s) in %d ms", path_obj.name, elapsed_ms)
            return raw_text, elapsed_ms
        except Exception as exc:
            logger.error("Python Whisper transcription failed: %s", exc)
            raise TranscriptionError(f"Transcription failed: {exc}") from exc

    raise TranscriptionError(
        f"No speech recognition engine available. Neither whisper.cpp at {cli_path} nor transformers whisper could run."
    )
