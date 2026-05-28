import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)

RESET_SUBJECT = "Reset your ClinFlowAI password"
ACCESS_REQUEST_SUBJECT = "New ClinFlowAI access request"
REQUEST_SUBMITTED_SUBJECT = "We received your ClinFlowAI access request"
REQUEST_APPROVED_SUBJECT = "Your ClinFlowAI access request was approved"
REQUEST_REJECTED_SUBJECT = "Update on your ClinFlowAI access request"


def _render_email_shell(title: str, intro: str, body_html: str, cta_label: str | None = None, cta_url: str | None = None) -> str:
    cta_html = ""
    if cta_label and cta_url:
        safe_label = escape(cta_label)
        safe_url = escape(cta_url, quote=True)
        cta_html = (
            f'<a href="{safe_url}" style="display:inline-block;background:#2563eb;color:#ffffff;'
            "text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;margin-top:16px;\">"
            f"{safe_label}</a>"
        )

    return f"""\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:24px 28px;">
                <div style="font-size:20px;font-weight:700;color:#ffffff;">ClinFlowAI</div>
                <div style="margin-top:6px;font-size:13px;color:#bfdbfe;">Clinical workflow platform</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h2 style="margin:0 0 10px 0;font-size:22px;line-height:1.35;color:#0f172a;">{escape(title)}</h2>
                <p style="margin:0 0 14px 0;font-size:14px;color:#334155;line-height:1.65;">{escape(intro)}</p>
                <div style="font-size:14px;color:#1e293b;line-height:1.7;">{body_html}</div>
                {cta_html}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                This is an automated email from ClinFlowAI.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


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
    html = _render_email_shell(
        title="Reset your password",
        intro=f"Hi {display_name}, we received a request to reset your ClinFlowAI password.",
        body_html=(
            f"<p style='margin:0;'>This secure link expires in <strong>{expire_hours} hour(s)</strong>.</p>"
            "<p style='margin:12px 0 0 0;'>If you did not request this, you can safely ignore this email.</p>"
        ),
        cta_label="Set new password",
        cta_url=link,
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = RESET_SUBJECT
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_USE_TLS,
    )


async def send_access_request_email(
    requester_email: str,
    review_token: str,
    requester_name: str,
    country: str,
    city: str,
    specialty: str,
    years_of_experience: int,
    practice_name: str | None,
    license_number: str | None,
) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP is not configured")
    if not settings.ACCESS_REQUEST_EMAIL:
        raise RuntimeError("ACCESS_REQUEST_EMAIL is not configured")

    review_base_raw = settings.ACCESS_REQUEST_REVIEW_BASE_URL.strip()
    if review_base_raw.startswith("http://") or review_base_raw.startswith("https://"):
        review_base = review_base_raw.rstrip("/")
    else:
        review_path = review_base_raw if review_base_raw.startswith("/") else f"/{review_base_raw}"
        review_base = f"{settings.FRONTEND_BASE_URL.rstrip('/')}{review_path}"
    review_link = f"{review_base}?token={review_token}"

    text = f"""New access request received for ClinFlowAI.

Name: {requester_name}
Email: {requester_email}
Country: {country}
City: {city}
Specialty: {specialty}
Years of Experience: {years_of_experience}
Practice/Clinic: {(practice_name or '').strip() or 'N/A'}
License Number: {(license_number or '').strip() or 'N/A'}
Review request: {review_link}

Please review and approve manually.
"""
    html = _render_email_shell(
        title="New access request",
        intro="A new clinician has requested access to ClinFlowAI.",
        body_html=(
            "<div style='background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;'>"
            f"<div><strong>Name:</strong> {escape(requester_name)}</div>"
            f"<div><strong>Email:</strong> {escape(requester_email)}</div>"
            f"<div><strong>Country:</strong> {escape(country)}</div>"
            f"<div><strong>City:</strong> {escape(city)}</div>"
            f"<div><strong>Specialty:</strong> {escape(specialty)}</div>"
            f"<div><strong>Years of Experience:</strong> {years_of_experience}</div>"
            f"<div><strong>Practice/Clinic:</strong> {escape((practice_name or '').strip() or 'N/A')}</div>"
            f"<div><strong>License Number:</strong> {escape((license_number or '').strip() or 'N/A')}</div>"
            "</div>"
        ),
        cta_label="Review access request",
        cta_url=review_link,
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = ACCESS_REQUEST_SUBJECT
    msg["From"] = settings.SMTP_FROM
    msg["To"] = settings.ACCESS_REQUEST_EMAIL
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_USE_TLS,
    )


async def send_request_submitted_email(to_email: str, doctor_name: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP is not configured")
    display_name = (doctor_name or "").strip() or "there"
    text = f"""Hi {display_name},

We received your ClinFlowAI access request.

Our team will review it and email you once a decision is made.

— ClinFlowAI
"""
    html = _render_email_shell(
        title="Request received",
        intro=f"Hi {display_name}, your ClinFlowAI access request has been submitted.",
        body_html="<p style='margin:0;'>Our team will review your details and email you once a decision is made.</p>",
    )
    msg = MIMEMultipart("alternative")
    msg["Subject"] = REQUEST_SUBMITTED_SUBJECT
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_USE_TLS,
    )


async def send_request_decision_email(
    to_email: str,
    doctor_name: str,
    approved: bool,
    set_password_link: str | None = None,
) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP is not configured")
    display_name = (doctor_name or "").strip() or "there"
    if approved:
        text = f"""Hi {display_name},

Your ClinFlowAI access request has been approved.

Set your password using this secure link:
{set_password_link}

— ClinFlowAI
"""
        html = _render_email_shell(
            title="Access approved",
            intro=f"Hi {display_name}, your access request has been approved.",
            body_html="<p style='margin:0;'>Welcome to ClinFlowAI. Set your password to activate your account.</p>",
            cta_label="Set your password",
            cta_url=set_password_link,
        )
        subject = REQUEST_APPROVED_SUBJECT
    else:
        text = f"""Hi {display_name},

Thank you for your interest in ClinFlowAI.

After review, we are unable to approve your access request at this time.

— ClinFlowAI
"""
        html = _render_email_shell(
            title="Request update",
            intro=f"Hi {display_name}, thank you for your interest in ClinFlowAI.",
            body_html="<p style='margin:0;'>After review, we are unable to approve your access request at this time.</p>",
        )
        subject = REQUEST_REJECTED_SUBJECT

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_USE_TLS,
    )
