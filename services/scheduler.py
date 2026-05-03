"""
APScheduler Cron Jobs — PRO System v2.0

Jobs:
  - monthly_billing  : 1st & 5th of every month at 09:00
  - daily_report     : Every day at 17:00

Both jobs are queued via Redis/RQ so the HTTP server stays non-blocking.
"""
import os
import logging
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# ── Job Functions (these run inside APScheduler, then dispatch to RQ) ─────────

def run_billing_job():
    """
    Monthly Billing Cron — 1st & 5th of every month at 09:00.
    Generates PDF bills for all active patients and sends via WhatsApp.
    """
    try:
        import redis
        from rq import Queue
        from pymongo import MongoClient

        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/hospital_management')

        conn = redis.from_url(redis_url)
        task_queue = Queue(connection=conn)
        db = MongoClient(mongo_uri).get_default_database()

        now = datetime.now()
        month_year = now.strftime('%B %Y')

        # Fetch all active patients with a guardian phone number
        patients = list(db.patients.find({
            'isDischarged': {'$ne': True},
            'deleted_at': {'$exists': False}
        }))

        queued = 0
        for patient in patients:
            phone = patient.get('contactNo') or patient.get('guardianPhone') or ''
            phone = str(phone).strip()
            if not phone:
                continue

            # Queue a billing task for this patient
            task_queue.enqueue(
                'worker.task_send_billing',
                patient_id=str(patient['_id']),
                phone_number=phone,
                month_year=month_year,
                job_timeout=120
            )
            queued += 1

        logger.info(f"[Scheduler] Billing job: queued {queued} tasks for {month_year}")
        print(f"[Scheduler] ✅ Monthly billing dispatched for {queued} patients ({month_year})")

    except Exception as e:
        logger.error(f"[Scheduler] Billing job failed: {e}")
        print(f"[Scheduler] ❌ Billing job error: {e}")


def run_daily_report_job():
    """
    Daily Report Cron — Every day at 17:00.
    Aggregates today's reports and sends WhatsApp summaries to family users.
    """
    try:
        import redis
        from rq import Queue
        from pymongo import MongoClient

        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/hospital_management')

        conn = redis.from_url(redis_url)
        task_queue = Queue(connection=conn)
        db = MongoClient(mongo_uri).get_default_database()

        today = datetime.now().date().isoformat()

        # Fetch all family users who have linked patients
        family_users = list(db.users.find({
            'role': 'Family',
            'deleted_at': {'$exists': False},
            'patient_ids': {'$exists': True, '$ne': []}
        }))

        queued = 0
        for fuser in family_users:
            phone = fuser.get('phone') or ''
            if not phone:
                continue
            for pid in fuser.get('patient_ids', []):
                task_queue.enqueue(
                    'worker.task_send_daily_report',
                    patient_id=str(pid),
                    phone_number=str(phone).strip(),
                    report_date=today,
                    job_timeout=60
                )
                queued += 1

        logger.info(f"[Scheduler] Daily report job: queued {queued} tasks for {today}")
        print(f"[Scheduler] ✅ Daily reports dispatched for {queued} patient-family pairs")

    except Exception as e:
        logger.error(f"[Scheduler] Daily report job failed: {e}")
        print(f"[Scheduler] ❌ Daily report job error: {e}")


# ── Scheduler Factory ─────────────────────────────────────────────────────────

def create_scheduler():
    """
    Create and configure an APScheduler BackgroundScheduler.
    Call start() on the returned scheduler to activate jobs.
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(timezone='Asia/Karachi')

    # Monthly billing — 1st and 5th at 09:00 PKT
    scheduler.add_job(
        func=run_billing_job,
        trigger=CronTrigger(day='1,5', hour=9, minute=0),
        id='monthly_billing',
        name='Monthly Billing Dispatch',
        replace_existing=True,
        misfire_grace_time=3600  # Allow 1h of leeway if server was down
    )

    # Daily report — every day at 17:00 PKT
    scheduler.add_job(
        func=run_daily_report_job,
        trigger=CronTrigger(hour=17, minute=0),
        id='daily_report',
        name='Daily Report Dispatch',
        replace_existing=True,
        misfire_grace_time=1800
    )

    return scheduler
