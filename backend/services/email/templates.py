import re
from typing import Dict, Any, Tuple, List
from config import APP_BASE_URL

# ─── Brand Theme Colors & Styles ──────────────────────────────────────────────
PRIMARY_COBALT = "#2563EB"
PRIMARY_COBALT_HOVER = "#1D4ED8"
BG_DARK = "#0B0F19"
CARD_BG = "#111827"
BORDER_COLOR = "#1F2937"
TEXT_WHITE = "#F9FAFB"
TEXT_MUTED = "#9CA3AF"
TEXT_SUB = "#6B7280"
CARD_INNER = "#1E293B"

def wrap_email_html(title: str, preheader: str, body_html: str, action_button: Dict[str, str] = None, footer_note: str = None) -> str:
    """
    Wrap email content in a table-based, inline-CSS, mobile-safe container.
    Tested for compatibility across Apple Mail, Gmail, Outlook, and mobile clients.
    """
    btn_html = ""
    if action_button and action_button.get("url") and action_button.get("label"):
        btn_html = f"""
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; margin-bottom: 24px;">
            <tr>
                <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                            <td align="center" style="border-radius: 8px; background-color: {PRIMARY_COBALT};">
                                <a href="{action_button['url']}" target="_blank" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; display: inline-block; letter-spacing: 0.2px;">
                                    {action_button['label']} &rarr;
                                </a>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        """

    footer_text = footer_note or "You are receiving this email because of your Brandflux account."

    return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>{title}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, a {{ font-family: Arial, Helvetica, sans-serif !important; }}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: {BG_DARK}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: none;">
    <!-- Preheader text (invisible preview) -->
    <span style="display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
        {preheader}
    </span>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: {BG_DARK}; min-height: 100vh; padding: 32px 12px;">
        <tr>
            <td align="center" valign="top">
                <!-- 600px Max Container -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: {CARD_BG}; border: 1px solid {BORDER_COLOR}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);">
                    <!-- Brand Cobalt Header Banner -->
                    <tr>
                        <td style="background-color: {PRIMARY_COBALT}; padding: 22px 32px; text-align: left;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td>
                                        <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase;">
                                            ⚡ Brandflux
                                        </span>
                                    </td>
                                    <td align="right">
                                        <span style="font-size: 11px; font-weight: 700; color: #DBEAFE; background-color: rgba(255, 255, 255, 0.15); padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                                            Autonomous AI
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main Email Content Body -->
                    <tr>
                        <td style="padding: 36px 32px 28px 32px; text-align: left;">
                            <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: {TEXT_WHITE}; line-height: 1.3;">
                                {title}
                            </h1>
                            <div style="font-size: 15px; line-height: 1.6; color: {TEXT_MUTED};">
                                {body_html}
                            </div>
                            {btn_html}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: {BG_DARK}; border-top: 1px solid {BORDER_COLOR}; text-align: center;">
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: {TEXT_SUB}; line-height: 1.5;">
                                {footer_text}
                            </p>
                            <p style="margin: 0; font-size: 11px; color: {TEXT_SUB};">
                                &copy; Brandflux AI &bull; <a href="{APP_BASE_URL}/settings" style="color: {PRIMARY_COBALT}; text-decoration: none;">Notification Settings</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


def extract_links(html: str) -> List[Dict[str, str]]:
    """Extract all href links with their anchor text from HTML."""
    links = []
    pattern = re.compile(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
    for match in pattern.finditer(html):
        href = match.group(1).strip()
        text = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        if href and not href.startswith("#"):
            links.append({"url": href, "text": text or href})
    return links


# ─── Template Builders ────────────────────────────────────────────────────────

def render_verify_email(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: verify_email
    data: { "verification_url": str, "full_name": str }
    """
    full_name = data.get("full_name") or "there"
    url = data.get("verification_url", f"{APP_BASE_URL}/verify")
    subject = "Verify your email for Brandflux"
    preheader = "Confirm your email address to activate your Brandflux account."

    body_html = f"""
    <p>Hi {full_name},</p>
    <p>Thanks for creating an account with Brandflux. Please verify your email address to activate your account and start generating brand-aligned social content.</p>
    <div style="background-color: {CARD_INNER}; border: 1px solid {BORDER_COLOR}; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
        <span style="font-size: 13px; color: {TEXT_MUTED};">
            🔒 This verification link is single-use and valid for <strong>24 hours</strong>.
        </span>
    </div>
    """

    action_btn = {
        "label": "Verify Email Address",
        "url": url
    }

    html = wrap_email_html(
        title="Verify your email address",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn,
        footer_note="If you did not sign up for Brandflux, you can safely ignore this email."
    )

    plain = f"""Hi {full_name},

Thanks for creating an account with Brandflux! Please verify your email to activate your account:
{url}

This link is single-use and expires in 24 hours.

- The Brandflux Team
"""
    return subject, html, plain


def render_welcome(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: welcome (Sent once after verification)
    data: { "full_name": str, "create_post_url": str }
    """
    full_name = data.get("full_name") or "there"
    url = data.get("create_post_url", f"{APP_BASE_URL}/session")
    subject = "Welcome to Brandflux — 3 steps to get started"
    preheader = "Your AI-powered social media engine is ready."

    body_html = f"""
    <p>Hi {full_name},</p>
    <p>Your email is verified and your Brandflux workspace is ready! Here are 3 quick steps to publish your first content:</p>

    <div style="margin: 24px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td width="36" valign="top" style="padding-bottom: 16px;">
                    <span style="background-color: {PRIMARY_COBALT}; color: #ffffff; width: 26px; height: 26px; border-radius: 50%; display: inline-block; text-align: center; line-height: 26px; font-weight: bold; font-size: 13px;">1</span>
                </td>
                <td style="padding-bottom: 16px; padding-left: 10px;">
                    <strong style="color: {TEXT_WHITE}; font-size: 15px;">Connect your social accounts</strong><br />
                    <span style="color: {TEXT_MUTED}; font-size: 13px;">Connect your Facebook Page, Instagram, or LinkedIn in Settings so you can publish directly.</span>
                </td>
            </tr>
            <tr>
                <td width="36" valign="top" style="padding-bottom: 16px;">
                    <span style="background-color: {PRIMARY_COBALT}; color: #ffffff; width: 26px; height: 26px; border-radius: 50%; display: inline-block; text-align: center; line-height: 26px; font-weight: bold; font-size: 13px;">2</span>
                </td>
                <td style="padding-bottom: 16px; padding-left: 10px;">
                    <strong style="color: {TEXT_WHITE}; font-size: 15px;">Review your Brand Identity</strong><br />
                    <span style="color: {TEXT_MUTED}; font-size: 13px;">Check your extracted colors, logos, and tone of voice in Brand Studio to keep all generated images on-brand.</span>
                </td>
            </tr>
            <tr>
                <td width="36" valign="top">
                    <span style="background-color: {PRIMARY_COBALT}; color: #ffffff; width: 26px; height: 26px; border-radius: 50%; display: inline-block; text-align: center; line-height: 26px; font-weight: bold; font-size: 13px;">3</span>
                </td>
                <td style="padding-left: 10px;">
                    <strong style="color: {TEXT_WHITE}; font-size: 15px;">Generate & post content</strong><br />
                    <span style="color: {TEXT_MUTED}; font-size: 13px;">Create multi-platform content with tailored captions and high-converting visual variants in seconds.</span>
                </td>
            </tr>
        </table>
    </div>
    """

    action_btn = {
        "label": "Create your first post",
        "url": url
    }

    html = wrap_email_html(
        title="Welcome to Brandflux",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Hi {full_name},

Welcome to Brandflux! Your workspace is ready.

3 quick steps to get started:
1. Connect your social channels in Settings (Facebook, Instagram, LinkedIn).
2. Review your Brand Identity in Brand Studio.
3. Create your first post with AI tailored images and captions.

Start now: {url}

- The Brandflux Team
"""
    return subject, html, plain


def render_autopilot_checkin(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: autopilot_checkin (Per-run check-in)
    data: { "brand_name": str, "checkin_url": str, "generic_url": str, "special_url": str, "skip_url": str, "platforms": list }
    """
    brand_name = data.get("brand_name") or "your brand"
    generic_url = data.get("generic_url", f"{APP_BASE_URL}/ideas")
    special_url = data.get("special_url", f"{APP_BASE_URL}/ideas?special=1")
    skip_url = data.get("skip_url", f"{APP_BASE_URL}/ideas?skip=1")
    platforms = data.get("platforms", ["Facebook", "Instagram", "LinkedIn"])
    platforms_str = ", ".join(platforms)

    subject = f"Autopilot Check-in for {brand_name}: Generic or Special post today?"
    preheader = f"Decide today's content direction for {brand_name}."

    body_html = f"""
    <p>Good morning! It's time for today's Autopilot posting check-in for <strong>{brand_name}</strong>.</p>
    <p>Selected platforms: <strong style="color: {TEXT_WHITE};">{platforms_str}</strong></p>
    <p>Choose an option below to guide today's generation:</p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
        <tr>
            <td style="padding: 10px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td align="center" style="border-radius: 8px; background-color: {PRIMARY_COBALT};">
                            <a href="{generic_url}" target="_blank" style="display: block; padding: 12px 20px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                                🎯 Generate Generic Post
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td align="center" style="border-radius: 8px; background-color: {CARD_INNER}; border: 1px solid {BORDER_COLOR};">
                            <a href="{special_url}" target="_blank" style="display: block; padding: 12px 20px; font-size: 14px; font-weight: 600; color: {TEXT_WHITE}; text-decoration: none; border-radius: 8px;">
                                ✨ Add Special Offer or Message
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 10px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td align="center" style="border-radius: 8px; background-color: transparent; border: 1px dashed {BORDER_COLOR};">
                            <a href="{skip_url}" target="_blank" style="display: block; padding: 10px 20px; font-size: 13px; font-weight: 500; color: {TEXT_MUTED}; text-decoration: none; border-radius: 8px;">
                                ⏸️ Skip Today
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    <p style="font-size: 13px; color: {TEXT_SUB};">If you do not respond, Autopilot will safely default to skipping today without posting.</p>
    """

    html = wrap_email_html(
        title="Autopilot Daily Check-in",
        preheader=preheader,
        body_html=body_html,
        footer_note="You can adjust your Autopilot schedule lead time in Settings."
    )

    plain = f"""Autopilot Check-in for {brand_name}
Target platforms: {platforms_str}

Options for today:
1. Generic Post: {generic_url}
2. Special Announcement: {special_url}
3. Skip Today: {skip_url}

- The Brandflux Autopilot Team
"""
    return subject, html, plain


def render_autopilot_post_ready(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: autopilot_post_ready
    data: { "brand_name": str, "review_url": str, "title": str, "preview_caption": str }
    """
    brand_name = data.get("brand_name") or "your brand"
    review_url = data.get("review_url", f"{APP_BASE_URL}/ideas")
    post_title = data.get("title", "Daily Content")
    caption_preview = data.get("preview_caption", "A tailored update for your followers.")

    subject = f"Your post for {brand_name} is ready for review"
    preheader = f"Review and approve today's post: {post_title}"

    body_html = f"""
    <p>Autopilot has generated a new post for <strong>{brand_name}</strong> and it is waiting for your approval.</p>

    <div style="background-color: {CARD_INNER}; border: 1px solid {BORDER_COLOR}; border-radius: 10px; padding: 18px; margin: 20px 0;">
        <span style="font-size: 12px; font-weight: 700; color: {PRIMARY_COBALT}; text-transform: uppercase; letter-spacing: 0.5px;">Post Theme</span>
        <h3 style="margin: 4px 0 10px 0; color: {TEXT_WHITE}; font-size: 16px;">{post_title}</h3>
        <p style="margin: 0; font-size: 14px; color: {TEXT_MUTED}; font-style: italic; line-height: 1.5;">
            &ldquo;{caption_preview}&rdquo;
        </p>
    </div>

    <p>Open the approval screen to pick your preferred image variant, fine-tune captions per platform, or approve for posting.</p>
    """

    action_btn = {
        "label": "Review & Approve Post",
        "url": review_url
    }

    html = wrap_email_html(
        title="Your post is ready for review",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Your post for {brand_name} is ready for review!
Theme: {post_title}

Preview:
"{caption_preview}"

Review and approve here: {review_url}
"""
    return subject, html, plain


def render_autopilot_result(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: autopilot_result
    data: { "brand_name": str, "status": "success" | "failed", "platform": str, "permalink": str, "error": str, "retry_url": str }
    """
    brand_name = data.get("brand_name") or "your brand"
    is_success = data.get("status") == "success"
    platform = data.get("platform", "Social").capitalize()
    permalink = data.get("permalink")
    error = data.get("error", "An unexpected platform error occurred.")
    retry_url = data.get("retry_url", f"{APP_BASE_URL}/ideas")

    if is_success:
        subject = f"Published successfully to {platform}: {brand_name}"
        preheader = f"Your post is live on {platform}."
        body_html = f"""
        <p>Great news! Your post for <strong>{brand_name}</strong> was published live to <strong>{platform}</strong>.</p>
        <div style="background-color: {CARD_INNER}; border: 1px solid #059669; border-radius: 10px; padding: 16px; margin: 20px 0;">
            <span style="color: #34D399; font-weight: 600; font-size: 14px;">✅ Verified Live on Platform</span><br />
            <span style="color: {TEXT_MUTED}; font-size: 13px;">Post ID and permalink verified via the platform API.</span>
        </div>
        """
        action_btn = {
            "label": f"View Live on {platform}",
            "url": permalink or APP_BASE_URL
        }
    else:
        subject = f"Action needed: Publishing to {platform} failed for {brand_name}"
        preheader = f"Your scheduled post could not be published to {platform}."
        body_html = f"""
        <p>Your post for <strong>{brand_name}</strong> could not be published to <strong>{platform}</strong>.</p>
        <div style="background-color: {CARD_INNER}; border: 1px solid #DC2626; border-radius: 10px; padding: 16px; margin: 20px 0;">
            <span style="color: #F87171; font-weight: 600; font-size: 14px;">❌ Reason for failure:</span><br />
            <span style="color: {TEXT_WHITE}; font-size: 13px; font-family: monospace;">{error}</span>
        </div>
        <p>You can retry publishing directly with one click or edit the post in Content History.</p>
        """
        action_btn = {
            "label": "Retry Publishing",
            "url": retry_url
        }

    html = wrap_email_html(
        title=f"Publishing {'Success' if is_success else 'Alert'}",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Publishing {'Success' if is_success else 'Failure'} - {platform} for {brand_name}
{f'View live post: {permalink}' if is_success else f'Error: {error}\nRetry: {retry_url}'}
"""
    return subject, html, plain


def render_autopilot_missed_run(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: autopilot_missed_run
    """
    brand_name = data.get("brand_name") or "your brand"
    dashboard_url = data.get("dashboard_url", f"{APP_BASE_URL}/dashboard")
    subject = f"Autopilot check-in passed for {brand_name}"
    preheader = "We skipped today's run because no response was received."

    body_html = f"""
    <p>Hi there,</p>
    <p>Today's Autopilot posting window for <strong>{brand_name}</strong> has closed without an approved post. In accordance with your guardrails, we did not auto-publish unverified content.</p>
    <p>You can still generate or schedule a post at any time from your dashboard.</p>
    """

    action_btn = {
        "label": "Open Dashboard",
        "url": dashboard_url
    }

    html = wrap_email_html(
        title="Check-in window closed",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Autopilot check-in closed for {brand_name}.
We skipped today's run to protect your brand. You can post manually anytime: {dashboard_url}
"""
    return subject, html, plain


def render_password_reset(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: password_reset
    data: { "reset_url": str, "full_name": str }
    """
    full_name = data.get("full_name") or "there"
    reset_url = data.get("reset_url", f"{APP_BASE_URL}/login")
    subject = "Reset your Brandflux password"
    preheader = "Click the link to reset your account password."

    body_html = f"""
    <p>Hi {full_name},</p>
    <p>We received a request to reset your Brandflux password. Click the button below to choose a new password:</p>
    <div style="background-color: {CARD_INNER}; border: 1px solid {BORDER_COLOR}; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
        <span style="font-size: 13px; color: {TEXT_MUTED};">
            🔒 This password reset link is single-use and expires in <strong>24 hours</strong>.
        </span>
    </div>
    <p style="font-size: 13px; color: {TEXT_SUB};">If you didn't request a password reset, you can safely ignore this email.</p>
    """

    action_btn = {
        "label": "Reset Password",
        "url": reset_url
    }

    html = wrap_email_html(
        title="Password Reset Request",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Hi {full_name},

Reset your password here: {reset_url}
This link expires in 24 hours.

- The Brandflux Team
"""
    return subject, html, plain


def render_reconnect_needed(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: reconnect_needed
    data: { "platform": str, "account_name": str, "reconnect_url": str }
    """
    platform = data.get("platform", "Social Platform").capitalize()
    account_name = data.get("account_name", "")
    reconnect_url = data.get("reconnect_url", f"{APP_BASE_URL}/settings?tab=connected")

    subject = f"Action Required: Reconnect your {platform} account"
    preheader = f"Authentication expired for {platform} ({account_name})."

    body_html = f"""
    <p>The connection to your <strong>{platform}</strong> account {f'({account_name})' if account_name else ''} needs attention.</p>
    <div style="background-color: {CARD_INNER}; border: 1px solid #F59E0B; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <span style="color: #FBBF24; font-weight: 600; font-size: 14px;">⚠️ Reconnection Required</span><br />
        <span style="color: {TEXT_MUTED}; font-size: 13px;">Your token has expired or permissions were updated. Scheduled posts will pause until reconnected.</span>
    </div>
    <p>Click below to reconnect in one click.</p>
    """

    action_btn = {
        "label": f"Reconnect {platform}",
        "url": reconnect_url
    }

    html = wrap_email_html(
        title="Account Reconnection Required",
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn
    )

    plain = f"""Action Required: Reconnect your {platform} account ({account_name}).
Scheduled posts will pause until reconnected. Reconnect here: {reconnect_url}
"""
    return subject, html, plain


def render_admin_alert(data: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Template: admin_alert
    data: { "alert_title": str, "alert_message": str, "admin_url": str }
    """
    alert_title = data.get("alert_title", "System Notification")
    alert_message = data.get("alert_message", "A system event requires your attention.")
    admin_url = data.get("admin_url", f"{APP_BASE_URL}/admin")

    subject = f"[ALERT] {alert_title}"
    preheader = f"Admin notice: {alert_title}"

    body_html = f"""
    <div style="background-color: {CARD_INNER}; border: 1px solid #DC2626; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <span style="color: #F87171; font-weight: 700; font-size: 14px;">⚡ System Event Details:</span>
        <p style="margin: 8px 0 0 0; color: {TEXT_WHITE}; font-size: 13px; line-height: 1.5;">
            {alert_message}
        </p>
    </div>
    """

    action_btn = {
        "label": "Open Admin Portal",
        "url": admin_url
    }

    html = wrap_email_html(
        title=alert_title,
        preheader=preheader,
        body_html=body_html,
        action_button=action_btn,
        footer_note="Confidential internal system notification."
    )

    plain = f"""[ALERT] {alert_title}
{alert_message}

Admin portal: {admin_url}
"""
    return subject, html, plain


# Registry of templates
TEMPLATE_REGISTRY = {
    "verify_email": render_verify_email,
    "welcome": render_welcome,
    "autopilot_checkin": render_autopilot_checkin,
    "autopilot_post_ready": render_autopilot_post_ready,
    "autopilot_result": render_autopilot_result,
    "autopilot_missed_run": render_autopilot_missed_run,
    "password_reset": render_password_reset,
    "reconnect_needed": render_reconnect_needed,
    "admin_alert": render_admin_alert,
}

def render_template(template_name: str, data: Dict[str, Any]) -> Tuple[str, str, str]:
    """Render template to (subject, full_html, plain_text)."""
    renderer = TEMPLATE_REGISTRY.get(template_name)
    if not renderer:
        raise ValueError(f"Unknown email template: '{template_name}'. Available: {list(TEMPLATE_REGISTRY.keys())}")
    return renderer(data)

