"""Offline Optical Character Recognition (OCR) module for medical monitor photos and notes.

Supports:
1. Microsoft UniLM TrOCR (microsoft/trocr-base-handwritten) for high-accuracy handwritten note recognition.
2. EasyOCR for multi-line bounding box detection and printed medical text fallback.
"""

from functools import lru_cache
import logging
from pathlib import Path
import time
from typing import Any, List, Tuple

from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# Threshold below which an OCR line is flagged as low confidence
LOW_CONFIDENCE_THRESHOLD = 0.60

_trocr_processor: Any = None
_trocr_model: Any = None
_trocr_device: str | None = None


class OCRError(Exception):
    """Raised when optical character recognition fails."""


def _get_device() -> str:
    """Detects safe hardware device for TrOCR (defaults to cpu to prevent MPS Metal thread collisions)."""
    return getattr(settings, "TROCR_DEVICE", "cpu")


def get_trocr_engine() -> Tuple[Any, Any]:
    """Lazily loads and caches the Microsoft TrOCR processor and model."""
    global _trocr_processor, _trocr_model
    if _trocr_processor is None or _trocr_model is None:
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            device = _get_device()
            logger.info("Loading Microsoft TrOCR (%s) on %s...", settings.TROCR_MODEL_NAME, device)
            _trocr_processor = TrOCRProcessor.from_pretrained(settings.TROCR_MODEL_NAME)
            model = VisionEncoderDecoderModel.from_pretrained(settings.TROCR_MODEL_NAME)
            _trocr_model = model.to(device).eval()
            logger.info("Microsoft TrOCR model loaded successfully.")
        except Exception as exc:
            logger.warning("Could not load Microsoft TrOCR model: %s", exc)
            _trocr_processor = False
            _trocr_model = False
    if _trocr_processor is False or _trocr_model is False:
        return None, None
    return _trocr_processor, _trocr_model


@lru_cache(maxsize=1)
def get_ocr_reader():
    """Lazily loads and caches the EasyOCR Reader instance."""
    try:
        import easyocr

        return easyocr.Reader(["en"], gpu=False)
    except Exception as exc:
        logger.error("Failed to initialize EasyOCR reader: %s", exc)
        raise OCRError(f"OCR engine initialization failed: {exc}") from exc


def _run_trocr_on_image(image: Image.Image) -> str:
    """Runs TrOCR on a single image or text-line crop."""
    processor, model = get_trocr_engine()
    if not processor or not model:
        return ""

    try:
        import torch

        device = _get_device()
        rgb_img = image.convert("RGB")
        pixel_values = processor(images=rgb_img, return_tensors="pt").pixel_values.to(device)

        with torch.no_grad():
            generated_ids = model.generate(pixel_values, max_new_tokens=64)

        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return text.strip()
    except Exception as exc:
        logger.warning("TrOCR inference failed on crop: %s", exc)
        return ""


def perform_ocr(image_path: str | Path) -> Tuple[str, float, List[str], int]:
    """Extracts text and line-level confidence from an image using TrOCR and EasyOCR.

    Args:
        image_path: Path to the image file (.png, .jpg, .jpeg, etc.).

    Returns:
        Tuple of (extracted_text, overall_confidence, low_confidence_lines, elapsed_ms).

    Raises:
        OCRError: If the image cannot be read or processed.
    """
    path_obj = Path(image_path)
    if not path_obj.exists():
        raise OCRError(f"Image file not found: {image_path}")

    start_time = time.perf_counter()

    try:
        pil_img = Image.open(str(path_obj.resolve()))
    except Exception as exc:
        raise OCRError(f"Cannot open image: {exc}") from exc

    # Try Microsoft TrOCR if enabled
    if settings.USE_TROCR:
        processor, model = get_trocr_engine()
        if processor and model:
            try:
                reader = get_ocr_reader()
                detected = reader.readtext(str(path_obj.resolve()))
            except Exception:
                detected = []

            if detected:
                # Use EasyOCR bounding boxes to crop each line, then transcribe with TrOCR
                lines: List[str] = []
                confidences: List[float] = []
                low_conf_lines: List[str] = []

                for bbox, easy_text, easy_conf in detected:
                    try:
                        # Extract bounding box coordinates [ [x1,y1], [x2,y2], [x3,y3], [x4,y4] ]
                        xs = [p[0] for p in bbox]
                        ys = [p[1] for p in bbox]
                        min_x, max_x = max(0, int(min(xs))), min(pil_img.width, int(max(xs)))
                        min_y, max_y = max(0, int(min(ys))), min(pil_img.height, int(max(ys)))

                        if (max_x - min_x) > 5 and (max_y - min_y) > 5:
                            crop = pil_img.crop((min_x, min_y, max_x, max_y))
                            trocr_text = _run_trocr_on_image(crop)
                            # Pick best result
                            final_text = trocr_text if trocr_text else str(easy_text).strip()
                        else:
                            final_text = str(easy_text).strip()

                        if final_text:
                            lines.append(final_text)
                            confidences.append(float(easy_conf))
                            if float(easy_conf) < LOW_CONFIDENCE_THRESHOLD:
                                low_conf_lines.append(final_text)
                    except Exception as box_err:
                        logger.debug("Failed processing bounding box: %s", box_err)
                        if easy_text:
                            lines.append(str(easy_text).strip())

                if lines:
                    elapsed_ms = int((time.perf_counter() - start_time) * 1000)
                    full_text = " ".join(lines).strip()
                    avg_conf = float(sum(confidences) / len(confidences)) if confidences else 0.90
                    logger.info("TrOCR+EasyOCR extracted %d lines in %d ms", len(lines), elapsed_ms)
                    return full_text, round(avg_conf, 2), low_conf_lines, elapsed_ms

            # Fallback: run TrOCR directly on the full image
            direct_text = _run_trocr_on_image(pil_img)
            if direct_text:
                elapsed_ms = int((time.perf_counter() - start_time) * 1000)
                logger.info("Direct TrOCR extracted text in %d ms", elapsed_ms)
                return direct_text, 0.90, [], elapsed_ms

    # EasyOCR fallback
    reader = get_ocr_reader()
    try:
        results = reader.readtext(str(path_obj.resolve()))
    except Exception as exc:
        logger.error("EasyOCR extraction failed on %s: %s", path_obj.name, exc)
        raise OCRError(f"Image text recognition failed: {exc}") from exc

    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    if not results:
        logger.info("OCR completed on %s in %d ms (no text detected)", path_obj.name, elapsed_ms)
        return "", 1.0, [], elapsed_ms

    lines = []
    confidences = []
    low_confidence_lines = []

    for item in results:
        if len(item) >= 3:
            _, text, conf = item[:3]
            line_str = str(text).strip()
            conf_val = float(conf)
            if line_str:
                lines.append(line_str)
                confidences.append(conf_val)
                if conf_val < LOW_CONFIDENCE_THRESHOLD:
                    low_confidence_lines.append(line_str)

    full_text = " ".join(lines).strip()
    avg_conf = float(sum(confidences) / len(confidences)) if confidences else 1.0
    return full_text, round(avg_conf, 2), low_confidence_lines, elapsed_ms
