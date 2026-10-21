"""Script to prepare and download models required for offline execution.

Only this script and sync.py are permitted to access the network.
"""

from pathlib import Path
import subprocess
import sys
import urllib.request


def download_ollama_model(model_name: str = "medgemma1.5") -> None:
    """Pulls the specified model using the Ollama CLI."""
    print(f"[*] Downloading / verifying Ollama model '{model_name}'...")
    try:
        subprocess.run(["ollama", "pull", model_name], check=True)
        print(f"[+] Ollama model '{model_name}' ready.")
    except subprocess.CalledProcessError as err:
        print(f"[-] Failed to pull Ollama model '{model_name}': {err}")
        sys.exit(1)


def download_whisper_model(model_filename: str = "ggml-small.en.bin") -> None:
    """Downloads whisper.cpp GGML model for cross-platform laptop compatibility."""
    models_dir = Path(__file__).resolve().parent.parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    target_path = models_dir / model_filename

    if target_path.exists() and target_path.stat().st_size > 400_000_000:
        print(f"[+] whisper.cpp model already exists at {target_path}")
        return

    url = f"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{model_filename}"
    print(f"[*] Downloading whisper.cpp model '{model_filename}' from {url}...")
    try:
        subprocess.run(
            ["curl", "-L", "--continue-at", "-", url, "-o", str(target_path)],
            check=True,
        )
        print(f"[+] whisper.cpp model saved to {target_path}")
    except Exception as err:
        print(f"[-] Failed to download whisper.cpp model: {err}")


def download_clinical_models(
    n2c2_model: str = "samrawal/bert-base-uncased_clinical-ner",
    mimic_model: str = "emilyalsentzer/Bio_ClinicalBERT",
) -> None:
    """Downloads and caches n2c2 Clinical NER and MIMIC-III Bio_ClinicalBERT models for offline inference."""
    print(f"[*] Downloading / verifying n2c2 Clinical NER model '{n2c2_model}'...")
    try:
        from transformers import AutoModel, AutoTokenizer, pipeline

        pipeline("token-classification", model=n2c2_model, aggregation_strategy="simple")
        print(f"[+] n2c2 model '{n2c2_model}' cached locally.")
    except Exception as err:
        print(f"[-] Failed to download n2c2 model: {err}")

    print(f"[*] Downloading / verifying MIMIC-III Clinical model '{mimic_model}'...")
    try:
        AutoTokenizer.from_pretrained(mimic_model)
        AutoModel.from_pretrained(mimic_model)
        print(f"[+] MIMIC-III model '{mimic_model}' cached locally.")
    except Exception as err:
        print(f"[-] Failed to download MIMIC-III model: {err}")


def main() -> None:
    """Download all required models."""
    print("=== Sanjeevani Lekh Model Downloader ===")
    download_ollama_model("medgemma1.5")
    download_whisper_model("ggml-small.en.bin")
    download_clinical_models()
    print("All models ready for offline use.")


if __name__ == "__main__":
    main()
