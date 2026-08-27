"""
RQ Worker — PRO System v2.0
Handles all background tasks: WhatsApp dispatch, PDF billing, daily reports.

Run with:
  python worker.py
"""
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
from services.encryption import decrypt_data

logging.basicConfig(level=logging.INFO, format='%(asctime)s [Worker] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


# ── Task: Send Billing ────────────────────────────────────────────────────────

def task_send_billing(patient_id: str, phone_number: str, month_year: str):
    """
    Generate billing PDF for a patient and send via WhatsApp.
    Queued by the monthly_billing scheduler job.
    """
    from db import Mongo, ObjectId
    from utils import patient_financial_summary

    db = Mongo().db

    try:
        patient = db.patients.find_one({'_id': ObjectId(patient_id)})
        if not patient:
            logger.warning(f"[task_send_billing] Patient {patient_id} not found")
            return False

        canteen_agg = list(db.canteen_sales.aggregate([
            {'$match': {'patient_id': ObjectId(patient_id)}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]))
        canteen_total = canteen_agg[0]['total'] if canteen_agg else 0
        financial = patient_financial_summary(patient, canteen_total, month_year=month_year)
        balance_due = financial['balance_due']

        # Serialize patient for template
        patient_data = {
            '_id': str(patient['_id']),
            'name': decrypt_data(patient.get('name', '')),
            'fatherName': patient.get('fatherName', ''),
            'cnic': decrypt_data(patient.get('cnic', '')),
            'contactNo': decrypt_data(patient.get('contactNo', '')),
            'address': patient.get('address', ''),
            'admissionDate': str(patient.get('admissionDate', '')),
        }

        # Generate PDF
        from services.pdf_engine import generate_billing_pdf
        from services.pdf_storage import store_pdf

        pdf_bytes, err = generate_billing_pdf(patient_data, financial)
        pdf_url = ""
        if pdf_bytes and not err:
            fname = f"bill_{patient_id}_{datetime.now().strftime('%Y%m')}.pdf"
            pdf_url, store_err = store_pdf(pdf_bytes, fname)
            if store_err:
                logger.warning(f"[task_send_billing] PDF store error: {store_err}")
        else:
            logger.warning(f"[task_send_billing] PDF gen error: {err}")

        # Send WhatsApp
        from services.whatsapp import send_billing_message
        success = send_billing_message(
            phone_number=phone_number,
            patient_name=decrypt_data(patient.get('name', '')),
            month_year=month_year,
            total_amount=balance_due,
            pdf_url=pdf_url
        )

        logger.info(f"[task_send_billing] {'✅' if success else '❌'} {patient.get('name')} → {phone_number}")
        return success

    except Exception as e:
        logger.error(f"[task_send_billing] Error for {patient_id}: {e}")
        return False


# ── Task: Send Daily Report ───────────────────────────────────────────────────

def task_send_daily_report(patient_id: str, phone_number: str, report_date: str):
    """
    Fetch today's daily report for a patient and send summary to family via WhatsApp.
    Queued by the daily_report scheduler job.
    """
    from db import Mongo, ObjectId

    db = Mongo().db

    try:
        patient = db.patients.find_one({'_id': ObjectId(patient_id)}, {'name': 1})
        if not patient:
            return False

        # Try new daily_reports collection first, then legacy
        report = db.daily_reports.find_one(
            {'patient_id': patient_id},
            sort=[('date', -1)]
        )

        if not report:
            logger.info(f"[task_send_daily_report] No report for {patient_id} on {report_date}")
            return False

        report_data = {
            'vitals': report.get('vitals', 'N/A'),
            'mood': report.get('mood', 'N/A'),
            'diet_status': report.get('diet_status', 'N/A'),
            'notes': report.get('notes', ''),
        }

        from services.whatsapp import send_daily_report_summary
        success = send_daily_report_summary(
            phone_number=phone_number,
            patient_name=decrypt_data(patient.get('name', '')),
            report_data=report_data
        )

        logger.info(f"[task_send_daily_report] {'✅' if success else '❌'} {patient.get('name')} → {phone_number}")
        return success

    except Exception as e:
        logger.error(f"[task_send_daily_report] Error for {patient_id}: {e}")
        return False


# ── Generic WhatsApp Task (legacy compatibility) ──────────────────────────────

def send_whatsapp_message(phone_number: str, message_type: str, payload: dict):
    """Compatibility shim — forwards to the new whatsapp service."""
    from services.whatsapp import send_whatsapp_message as _send
    return _send(phone_number, message_type, payload)


# ── Worker Entry Point ────────────────────────────────────────────────────────

if __name__ == '__main__':
    import redis
    from rq import Worker, Queue

    listen = ['default']
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    conn = redis.from_url(redis_url)

    print("🚀 PRO Worker started — listening on queue: default")
    worker = Worker([Queue(q, connection=conn) for q in listen], connection=conn)
    worker.work()
