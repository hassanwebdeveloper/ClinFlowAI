"""Async file-based speech-to-text via Soniox.

Transcription: https://soniox.com/docs/stt/SDKs/python-SDK/async-transcription
Translation: https://soniox.com/docs/stt/async/async-translation — translated text lives on
tokens with translation_status == \"translation\"; transcript.text is the source-language text.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from soniox import SonioxClient
from soniox.types import (
    CreateTranscriptionConfig,
    StructuredContext,
    StructuredContextGeneralItem,
    TranslationConfig,
    TranscriptionTranscript,
)

from app.core.config import settings
from app.services.api_analytics import (
    audio_file_metrics,
    count_soniox_tokens,
    record_stt_usage,
)

# Improves translation to English for clinical audio: domain hints + terminology so drug/lab
# names stay as standard English terms rather than generic descriptions (see Soniox context docs).
# https://soniox.com/docs/stt/concepts/context
# https://soniox.com/docs/stt/async/async-translation
_CLINICAL_CONTEXT_TEXT = (
    "Medical consultation or dictation. Clinicians name medications, doses, lab tests, "
    "and diagnoses. English output should use established international drug names and "
    "standard laboratory nomenclature where applicable."
)

_CLINICAL_TERMS: tuple[str, ...] = (
    # Analgesics / antipyretics (user example)
    "Panadol",
    "Tylenol",
    "Paracetamol",
    "Acetaminophen",
    "Ibuprofen",
    "Brufen",
    "Diclofenac",
    "Voltaren",
    "Naproxen",
    "Aspirin",
    "Tramadol",
    "Morphine",
    # Common antibiotics / GI
    "Amoxicillin",
    "Augmentin",
    "Clavulanate",
    "Azithromycin",
    "Ceftriaxone",
    "Ciprofloxacin",
    "Metronidazole",
    "Omeprazole",
    "Pantoprazole",
    "Lansoprazole",
    # Cardio / diabetes / chronic
    "Atorvastatin",
    "Metformin",
    "Glimepiride",
    "Insulin",
    "Amlodipine",
    "Losartan",
    "Atenolol",
    "Bisoprolol",
    "Furosemide",
    "Spironolactone",
    "Warfarin",
    "Rivaroxaban",
    "Apixaban",
    "Levothyroxine",
    # Respiratory / allergy
    "Salbutamol",
    "Albuterol",
    "Ventolin",
    "Budesonide",
    "Montelukast",
    "Cetirizine",
    "Loratadine",
    # Labs and imaging (abbreviations + names)
    "CBC",
    "Complete Blood Count",
    "LFT",
    "Liver Function Test",
    "KFT",
    "RFT",
    "Renal Function Test",
    "TFT",
    "Thyroid Function Test",
    "HbA1c",
    "Hemoglobin A1c",
    "CRP",
    "ESR",
    "Lipid Profile",
    "D-Dimer",
    "Troponin",
    "BNP",
    "PT",
    "INR",
    "aPTT",
    "MRI",
    "CT",
    "Ultrasound",
    "X-ray",
    "ECG",
    "EKG",
)


def _clinical_translation_context() -> StructuredContext:
    return StructuredContext(
        general=[
            StructuredContextGeneralItem(key="domain", value="Healthcare"),
            StructuredContextGeneralItem(
                key="topic",
                value="Clinical consultation, examination, and medical documentation",
            ),
            StructuredContextGeneralItem(
                key="intent",
                value="Accurate English clinical transcript with faithful medication and lab terminology",
            ),
            StructuredContextGeneralItem(
                key="instructions",
                value=(
                    "Translate to English for clinical documentation. Preserve medication "
                    "brand names and standard drug names in English (for example Panadol, "
                    "Augmentin); do not substitute vague phrases such as pain pill, headache "
                    "tablet, or antibiotic tablet when a specific drug name is intended. "
                    "Keep conventional laboratory and imaging terms and abbreviations "
                    "(CBC, LFT, HbA1c, MRI). Output clear medical English, not paraphrased "
                    "lay descriptions of drugs or tests."
                ),
            ),
        ],
        text=_CLINICAL_CONTEXT_TEXT
    )


def _text_from_soniox_transcript(
    transcript: TranscriptionTranscript,
    *,
    translate_to_english: bool,
) -> str:
    """Prefer English translation tokens when translation is enabled; else use aggregate text."""
    if translate_to_english and transcript.tokens:
        translated = "".join(
            t.text for t in transcript.tokens if t.translation_status == "translation"
        ).strip()
        if translated:
            return translated
    return (transcript.text or "").strip()


def _transcribe_file_sync(
    file_path: str,
    language: str,
    *,
    translate_to_english: bool,
) -> dict[str, Any]:
    if not settings.SONIOX_API_KEY:
        raise ValueError("SONIOX_API_KEY is not configured")

    client = SonioxClient(api_key=settings.SONIOX_API_KEY)
    lang = (language or "").strip().lower()
    model = settings.SONIOX_STT_MODEL

    if translate_to_english:
        config = CreateTranscriptionConfig(
            model=model,
            translation=TranslationConfig(type="one_way", target_language="en"),
            enable_language_identification=True,
            language_hints=["en", "ur", "hi", "es"],
            context=_clinical_translation_context(),
        )
    elif lang:
        config = CreateTranscriptionConfig(model=model, language_hints=[lang])
    else:
        config = CreateTranscriptionConfig(model=model)

    transcription = client.stt.transcribe(
        file=file_path,
        filename=os.path.basename(file_path),
        config=config,
    )
    transcription_id = getattr(transcription, "id", None)
    try:
        client.stt.wait(
            transcription.id,
            timeout_sec=settings.SONIOX_STT_WAIT_TIMEOUT_SEC,
        )
        completed = client.stt.get(transcription.id)
        audio_duration_sec: float | None = None
        audio_duration_ms = getattr(completed, "audio_duration_ms", None)
        if audio_duration_ms is not None:
            try:
                audio_duration_sec = float(audio_duration_ms) / 1000.0
            except (TypeError, ValueError):
                audio_duration_sec = None
        transcript = client.stt.get_transcript(transcription.id)
        text = _text_from_soniox_transcript(
            transcript,
            translate_to_english=translate_to_english,
        )
        if not text:
            raise ValueError("Soniox returned an empty transcript")
        transcription_tokens, translation_tokens = count_soniox_tokens(
            getattr(transcript, "tokens", None)
        )
        return {
            "text": text,
            "transcription_id": transcription_id,
            "transcription_tokens": transcription_tokens,
            "translation_tokens": translation_tokens,
            "audio_duration_sec": audio_duration_sec,
        }
    finally:
        try:
            client.stt.destroy(transcription.id)
        except Exception:
            pass


async def transcribe_audio_file(
    file_path: str,
    language: str = "en",
    *,
    translate_to_english: bool = False,
) -> str:
    """Upload a local audio file to Soniox, run async STT, return plain text."""
    started = time.perf_counter()
    success = False
    error_message: str | None = None
    result: dict[str, Any] | None = None
    audio_duration_sec, audio_file_size_bytes = audio_file_metrics(file_path)
    try:
        result = await asyncio.to_thread(
            _transcribe_file_sync,
            file_path,
            language,
            translate_to_english=translate_to_english,
        )
        success = True
        return str(result.get("text") or "").strip()
    except Exception as exc:
        error_message = str(exc)
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000
        if result and result.get("audio_duration_sec") is not None:
            audio_duration_sec = result["audio_duration_sec"]
        await record_stt_usage(
            provider="soniox",
            model=settings.SONIOX_STT_MODEL,
            duration_ms=duration_ms,
            success=success,
            audio_duration_sec=audio_duration_sec,
            audio_file_size_bytes=audio_file_size_bytes,
            transcription_tokens=(result or {}).get("transcription_tokens"),
            translation_tokens=(result or {}).get("translation_tokens"),
            translate_to_english=translate_to_english,
            language=language,
            error_message=error_message,
            provider_request_id=(result or {}).get("transcription_id"),
        )
