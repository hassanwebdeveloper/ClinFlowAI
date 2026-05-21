import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)

RESET_SUBJECT = "Reset your ClinFlowAI password"


async def send_reset_email(to_email: str, doctor_name: str, token: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP not configured; skipping reset email to %s", to_email)
        return

    base = settings.FRONTEND_BASE_URL.rstrip("/")
    link = f"{base}/reset-password?token={token}"
    display_name = (doctor_name or "").strip() or "there"
    expire_hours = max(1, settings.PASSWORD_RESET_TOKEN_EXPIRE_SECONDS // 3600)

    text = f"""Hi {display_name},

You requested a password reset for your ClinFlowAI account.

Open this link to set a new password (expires in {expire_hours} hour(s)):
{link}

If you did not request this, you can ignore this email.

— ClinFlowAI
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = RESET_SUBJECT
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_USE_TLS,
    )
