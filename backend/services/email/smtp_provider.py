import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import make_msgid, formatdate
from typing import Dict, Any, Optional

from services.email.base import EmailProvider

logger = logging.getLogger("email.smtp")

def get_active_smtp_config() -> Dict[str, Any]:
    """
    Fetch active SMTP configuration from database SystemSetting,
    falling back to environment variables.
    """
    from database import SessionLocal
    from models.models import SystemSetting

    config = {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com").strip(),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", "").strip(),
        "password": os.getenv("SMTP_PASSWORD", "").strip(),
        "from_email": os.getenv("SMTP_FROM_EMAIL", os.getenv("EMAIL_FROM", "notifications@brandflux.ai")).strip(),
        "from_name": os.getenv("SMTP_FROM_NAME", os.getenv("EMAIL_FROM_NAME", "Brandflux")).strip(),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").strip().lower() in ("true", "1", "yes"),
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").strip().lower() in ("true", "1", "yes"),
        "admin_notification_email": os.getenv("ADMIN_NOTIFICATION_EMAIL", "info@tntinnov.com").strip(),
    }

    try:
        db = SessionLocal()
        setting = db.query(SystemSetting).filter(SystemSetting.key == "smtp_settings").first()
        if setting and isinstance(setting.value, dict):
            val = setting.value
            if val.get("host"): config["host"] = str(val["host"]).strip()
            if val.get("port"): config["port"] = int(val["port"])
            if "user" in val and val["user"] is not None: config["user"] = str(val["user"]).strip()
            if "password" in val and val["password"] is not None: config["password"] = str(val["password"]).strip()
            if val.get("from_email"): config["from_email"] = str(val["from_email"]).strip()
            if val.get("from_name"): config["from_name"] = str(val["from_name"]).strip()
            if "use_tls" in val: config["use_tls"] = bool(val["use_tls"])
            if "use_ssl" in val: config["use_ssl"] = bool(val["use_ssl"])
            if val.get("admin_notification_email"): config["admin_notification_email"] = str(val["admin_notification_email"]).strip()
        db.close()
    except Exception as e:
        logger.warning(f"Could not load smtp_settings from DB: {e}")

    return config


class SMTPEmailProvider(EmailProvider):
    """
    SMTP Email Provider:
    - Sends outgoing transactional emails via standard SMTP server (e.g. Gmail, Outlook, cPanel, Amazon SES).
    - Fully configurable via Admin Portal or environment variables.
    - Handles HTML + Plaintext alternatives.
    """

    async def send(
        self,
        recipient: str,
        subject: str,
        template: str,
        full_html: str,
        plain_text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        config = get_active_smtp_config()
        host = config.get("host")
        port = config.get("port", 587)
        user = config.get("user")
        password = config.get("password")
        from_email = config.get("from_email") or "notifications@brandflux.ai"
        from_name = config.get("from_name") or "Brandflux"
        use_ssl = config.get("use_ssl", False)
        use_tls = config.get("use_tls", True)

        if not host:
            err_msg = "SMTP host is not configured. Configure SMTP in Admin Portal or backend/.env"
            logger.warning(err_msg)
            return {
                "status": "failed",
                "provider": "smtp",
                "external_id": None,
                "error": err_msg
            }

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = recipient
        msg["Date"] = formatdate(localtime=True)
        msg_id = make_msgid(domain=host if "." in host else "brandflux.ai")
        msg["Message-ID"] = msg_id

        # Plain text and HTML parts
        msg.attach(MIMEText(plain_text or "", "plain", "utf-8"))
        msg.attach(MIMEText(full_html or "", "html", "utf-8"))

        try:
            if use_ssl or port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                server = smtplib.SMTP(host, port, timeout=15)
                if use_tls:
                    server.starttls()

            if user and password:
                server.login(user, password)

            server.sendmail(from_email, [recipient], msg.as_string())
            server.quit()

            logger.info(f"[EMAIL SENT (SMTP)] To: {recipient} | Template: {template} | MsgID: {msg_id}")
            return {
                "status": "sent",
                "provider": "smtp",
                "external_id": msg_id,
                "error": None
            }
        except smtplib.SMTPAuthenticationError as auth_err:
            err_msg = f"SMTP Authentication failed: {auth_err}"
            logger.error(err_msg)
            return {
                "status": "failed",
                "provider": "smtp",
                "external_id": None,
                "error": err_msg
            }
        except Exception as e:
            err_msg = f"SMTP sending exception: {str(e)}"
            logger.error(err_msg)
            return {
                "status": "failed",
                "provider": "smtp",
                "external_id": None,
                "error": err_msg
            }

