"""
WhatsApp Automation Service — PRO System v2.0
Supports multiple providers: simulation | meta | twilio | ultrasmsg
Set WHATSAPP_PROVIDER in .env to switch.
"""
import os
import json
import logging
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Database (worker process has its own connection) ──────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/hospital_management')
_client = None
_db = None

def _get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGO_URI)
        _db = _client.get_default_database()
    return _db


# ── Provider Implementations ──────────────────────────────────────────────────

def _send_meta(phone_number: str, message: str) -> dict:
    """Send via Meta Cloud API (Graph API v19.0)."""
    import requests
    token = os.getenv('META_WHATSAPP_TOKEN', '')
    phone_id = os.getenv('META_PHONE_NUMBER_ID', '')
    version = os.getenv('META_API_VERSION', 'v19.0')

    if not token or not phone_id:
        raise ValueError("META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID must be set in .env")

    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "text",
        "text": {"body": message}
    }
    response = requests.post(url, headers=headers, json=payload, timeout=15)
    response.raise_for_status()
    return response.json()


def _send_twilio(phone_number: str, message: str) -> dict:
    """Send via Twilio WhatsApp."""
    from twilio.rest import Client
    sid = os.getenv('TWILIO_ACCOUNT_SID', '')
    token = os.getenv('TWILIO_AUTH_TOKEN', '')
    from_number = os.getenv('TWILIO_WHATSAPP_FROM', '')

    if not all([sid, token, from_number]):
        raise ValueError("Twilio credentials (SID, TOKEN, FROM) must be set in .env")

    client = Client(sid, token)
    msg = client.messages.create(
        body=message,
        from_=f"whatsapp:{from_number}",
        to=f"whatsapp:{phone_number}"
    )
    return {"sid": msg.sid, "status": msg.status}


def _send_ultrasmsg(phone_number: str, message: str) -> dict:
    """Send via UltraMsg."""
    import requests
    instance_id = os.getenv('ULTRAMSG_INSTANCE_ID', '')
    token = os.getenv('ULTRAMSG_TOKEN', '')

    if not instance_id or not token:
        raise ValueError("ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN must be set in .env")

    url = f"https://api.ultramsg.com/{instance_id}/messages/chat"
    payload = {"token": token, "to": phone_number, "body": message}
    response = requests.post(url, data=payload, timeout=15)
    response.raise_for_status()
    return response.json()


def _send_simulation(phone_number: str, message: str) -> dict:
    """Simulation mode — logs the message without sending."""
    logger.info(f"[WhatsApp SIMULATED] To: {phone_number}\n{message}")
    print(f"[WhatsApp SIMULATED] To: {phone_number} | Preview: {message[:80]}...")
    return {"status": "simulated_success", "message_id": f"sim-{datetime.now().timestamp()}"}


# ── Core Dispatcher ───────────────────────────────────────────────────────────

def _dispatch(phone_number: str, message: str) -> tuple[bool, dict]:
    """Route to the correct provider and return (success, response)."""
    provider = os.getenv('WHATSAPP_PROVIDER', 'simulation').lower().strip()

    handlers = {
        'meta': _send_meta,
        'twilio': _send_twilio,
        'ultrasmsg': _send_ultrasmsg,
        'simulation': _send_simulation,
    }

    handler = handlers.get(provider, _send_simulation)
    try:
        response = handler(phone_number, message)
        return True, response
    except Exception as e:
        logger.error(f"[WhatsApp] Send failed via '{provider}': {e}")
        return False, {"error": str(e)}


def _log_to_db(phone_number: str, message_type: str, payload: dict, success: bool, response: dict):
    """Persist every send attempt to whatsapp_logs collection."""
    try:
        db = _get_db()
        db.whatsapp_logs.insert_one({
            "phone_number": phone_number,
            "message_type": message_type,
            "payload": payload,
            "provider": os.getenv('WHATSAPP_PROVIDER', 'simulation'),
            "sent_at": datetime.utcnow(),
            "success": success,
            "provider_response": response
        })
    except Exception as e:
        logger.error(f"[WhatsApp] DB log failed: {e}")


# ── Public API ────────────────────────────────────────────────────────────────

def send_whatsapp_message(phone_number: str, message_type: str, payload: dict) -> bool:
    """
    Generic queueable task. Routes to provider, logs result.

    Args:
        phone_number: Recipient phone (international format, e.g. +923001234567)
        message_type: 'billing' | 'daily_report' | 'alert' | 'welcome' | 'otp'
        payload: Dict with message data (used to build the message body)
    """
    message = _build_message(message_type, payload)
    success, response = _dispatch(phone_number, message)
    _log_to_db(phone_number, message_type, payload, success, response)
    return success


def send_billing_message(phone_number: str, patient_name: str, month_year: str,
                         total_amount: int, pdf_url: str = None) -> bool:
    payload = {
        "patient_name": patient_name,
        "month_year": month_year,
        "total_amount": total_amount,
        "pdf_url": pdf_url
    }
    return send_whatsapp_message(phone_number, "billing", payload)


def send_daily_report_summary(phone_number: str, patient_name: str, report_data: dict) -> bool:
    payload = {"patient_name": patient_name, **report_data}
    return send_whatsapp_message(phone_number, "daily_report", payload)


def send_admin_alert(phone_number: str, alert_message: str) -> bool:
    payload = {"alert": alert_message}
    return send_whatsapp_message(phone_number, "alert", payload)


def send_welcome_message(phone_number: str, family_name: str, patient_name: str,
                         login_url: str, username: str, temp_password: str) -> bool:
    payload = {
        "family_name": family_name,
        "patient_name": patient_name,
        "login_url": login_url,
        "username": username,
        "temp_password": temp_password
    }
    return send_whatsapp_message(phone_number, "welcome", payload)


def send_otp(phone_number: str, otp_code: str, username: str) -> bool:
    payload = {"otp": otp_code, "username": username}
    return send_whatsapp_message(phone_number, "otp", payload)


# ── Message Templates ─────────────────────────────────────────────────────────

def _build_message(message_type: str, payload: dict) -> str:
    """Build the WhatsApp text body from a type + payload."""

    if message_type == "billing":
        patient = payload.get("patient_name", "Patient")
        month = payload.get("month_year", "this month")
        amount = payload.get("total_amount", 0)
        pdf_url = payload.get("pdf_url", "")
        msg = (
            f"🏥 *Pakistan Recovery Oasis*\n\n"
            f"Dear {patient},\n\n"
            f"Your billing statement for *{month}* is ready.\n"
            f"💰 Total Amount Due: *PKR {amount:,}*\n"
        )
        if pdf_url:
            msg += f"\n📄 View/Download Bill:\n{pdf_url}\n"
        msg += (
            "\n_This is an automated message. "
            "Please contact administration for any queries._"
        )
        return msg

    elif message_type == "daily_report":
        patient = payload.get("patient_name", "your patient")
        mood = payload.get("mood", "N/A")
        vitals = payload.get("vitals", "N/A")
        diet = payload.get("diet_status", "N/A")
        notes = payload.get("notes", "")
        msg = (
            f"🏥 *PRO — Daily Patient Update*\n\n"
            f"👤 Patient: *{patient}*\n"
            f"📅 Date: {datetime.now().strftime('%d %b %Y')}\n\n"
            f"😊 Mood: {mood}\n"
            f"❤️ Vitals: {vitals}\n"
            f"🍽️ Diet: {diet}\n"
        )
        if notes:
            msg += f"\n📝 Notes: {notes}\n"
        msg += "\n_Pakistan Recovery Oasis — Automated Daily Report_"
        return msg

    elif message_type == "alert":
        alert = payload.get("alert", "System alert")
        return (
            f"🚨 *PRO System Alert*\n\n"
            f"{alert}\n\n"
            f"_Time: {datetime.now().strftime('%d %b %Y, %I:%M %p')}_"
        )

    elif message_type == "welcome":
        return (
            f"🏥 *Welcome to Pakistan Recovery Oasis Family Portal*\n\n"
            f"Dear *{payload.get('family_name', 'Family')}*,\n\n"
            f"Your loved one *{payload.get('patient_name', '')}* has been admitted.\n"
            f"You can track their progress via the Family Dashboard:\n\n"
            f"🔗 {payload.get('login_url', '')}\n\n"
            f"👤 Username: `{payload.get('username', '')}`\n"
            f"🔑 Password: `{payload.get('temp_password', '')}`\n\n"
            f"_Please change your password after first login._\n"
            f"_PRO Administration_"
        )

    elif message_type == "otp":
        return (
            f"🔐 *PRO System — Login Verification*\n\n"
            f"Hello *{payload.get('username', '')}*,\n\n"
            f"Your one-time login code is:\n\n"
            f"*{payload.get('otp', '------')}*\n\n"
            f"_Valid for 5 minutes. Do not share this code._"
        )

    else:
        return f"[PRO System] Message type '{message_type}': {json.dumps(payload, default=str)}"
