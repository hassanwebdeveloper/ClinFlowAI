"""Async file-based speech-to-text via Soniox.

Transcription: https://soniox.com/docs/stt/SDKs/python-SDK/async-transcription
Translation: https://soniox.com/docs/stt/async/async-translation — translated text lives on
tokens with translation_status == \"translation\"; transcript.text is the source-language text.
"""

from __future__ import annotations

import asyncio
import os

from soniox import SonioxClient
from soniox.types import CreateTranscriptionConfig, TranslationConfig, TranscriptionTranscript

from app.core.config import settings


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
) -> str:
    if not settings.SONIOX_API_KEY:
        raise ValueError("SONIOX_API_KEY is not configured")

    client = SonioxClient(api_key=settings.SONIOX_API_KEY)
    lang = (language or "").strip().lower()
    model = settings.SONIOX_STT_MODEL

    # Match async translation guide: model + options on CreateTranscriptionConfig, then create job.
    # https://soniox.com/docs/stt/async/async-translation
    if translate_to_english:
        config = CreateTranscriptionConfig(
            model=model,
            translation=TranslationConfig(type="one_way", target_language="en"),
            enable_language_identification=True,
            language_hints=["en", "ur", "hi", "es"],
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
    try:
        client.stt.wait(
            transcription.id,
            timeout_sec=settings.SONIOX_STT_WAIT_TIMEOUT_SEC,
        )
        transcript = client.stt.get_transcript(transcription.id)
        text = _text_from_soniox_transcript(
            transcript,
            translate_to_english=translate_to_english,
        )
        if not text:
            raise ValueError("Soniox returned an empty transcript")
        return text
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
    return await asyncio.to_thread(
        _transcribe_file_sync,
        file_path,
        language,
        translate_to_english=translate_to_english,
    )
