from flask import Flask, request, jsonify, session, url_for
from flask_pymongo import PyMongo
from bson.objectid import ObjectId
from datetime import datetime
from werkzeug.security import generate_password_hash
from itsdangerous import URLSafeTimedSerializer
from email.message import EmailMessage
import smtplib
import ssl
import os
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from flask_cors import CORS
import jwt
import redis
from rq import Queue
load_dotenv()
from routes.admission_page import register_admission_page_routes
from routes.accounts_page import register_account_page_routes
from routes.auth_api import register_auth_api_routes
from routes.attendance_page import register_attendance_page_routes
from routes.canteen_api import register_canteen_api_routes
from routes.canteen_page import register_canteen_page_routes
from routes.clinical_api import register_clinical_api_routes
from routes.communications_api import register_communications_api_routes
from routes.dashboard_api import register_dashboard_api_routes
from routes.expenses_page import register_expense_page_routes
from routes.export_page import register_export_page_routes
from routes.family_api import register_family_api_routes
from routes.family_dashboard_page import register_family_dashboard_page_routes
from routes.finance_api import register_finance_api_routes
from routes.monthly_overheads_page import register_monthly_overheads_page_routes
from routes.overheads_api import register_overheads_api_routes
from routes.overheads_page import register_overheads_page_routes
from routes.manual_discharge_page import register_manual_discharge_page_routes
from routes.patients_api import register_patient_api_routes
from routes.patients_page import register_patient_page_routes
from routes.pages import register_page_routes
from routes.prescription_page import register_prescription_page_routes
from routes.psych_sessions_page import register_psych_sessions_page_routes
from routes.reports_api import register_reports_api_routes
from routes.reports_page import register_report_page_routes
from routes.staff_dashboard_page import register_staff_dashboard_page_routes
from routes.team_page import register_team_page_routes
from routes.utility_bills_page import register_utility_bills_page_routes
from routes.users_api import register_user_api_routes
from routes.users_page import register_user_page_routes
from routes.system_api import register_system_api_routes
from services.encryption import encrypt_data, decrypt_data

app = Flask(__name__)
CORS(app)
Talisman(app, content_security_policy=None, force_https=False)  # Disabled force_https for local development
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# --- CONFIGURATION ---
mongo_uri = os.environ.get("MONGO_URI")
if mongo_uri:
    mongo_uri = mongo_uri.strip()
    # Handle accidental label inclusion (e.g., "MONGO_URI: mongodb+srv://...")
    if mongo_uri.lower().startswith("mongo_uri:"):
        mongo_uri = mongo_uri[10:].strip()
    elif mongo_uri.lower().startswith("mongodb:"):
        # This is already a valid scheme, skip
        pass
    elif ":" in mongo_uri and not mongo_uri.startswith("mongodb"):
        # If there's a colon but it doesn't look like a scheme, it might be a label we missed
        parts = mongo_uri.split(":", 1)
        if len(parts) > 1 and "mongodb" in parts[1].lower():
            mongo_uri = parts[1].strip()
else:
    # Fallback for local dev if .env is missing, but Render will need this set
    print("WARNING: MONGO_URI environment variable is not set. Database connection will fail.")
    mongo_uri = "mongodb://localhost:27017/hospital_management" 
app.config["MONGO_URI"] = mongo_uri

secret_key = os.environ.get("SECRET_KEY", "06e4b4738ab81f94277a7216b5e79fb24b339f28a6a131391d8d6f8f0a295dc1")
app.config["SECRET_KEY"] = secret_key
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", secret_key)
app.config["GMAIL_USER"] = os.environ.get("GMAIL_USER")
app.config["GMAIL_APP_PASSWORD"] = os.environ.get("GMAIL_APP_PASSWORD")
app.config["PASSWORD_RESET_EXPIRY_MINUTES"] = int(os.environ.get("PASSWORD_RESET_EXPIRY_MINUTES", "30"))

try:
    mongo = PyMongo(app)
    # Trigger a simple operation to verify connection
    with app.app_context():
        # Using a timeout to ensure startup doesn't hang indefinitely
        mongo.cx.admin.command('ping')
    print("SUCCESS: Connected to MongoDB.")
except Exception as e:
    print(f"CRITICAL: MongoDB initialization failed: {type(e).__name__} - {e}")
    mongo = None

redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
redis_conn = redis.from_url(redis_url)
task_queue = Queue(connection=redis_conn)

serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])

# --- HELPER: DATABASE CHECK & INITIAL SETUP ---
def check_db():
    if mongo is None or mongo.db is None:
        print("Database connection failed or not initialized.")
        return False
    return True

def clean_input_data(data):
    """Strip trailing and leading spaces from string values in a dictionary."""
    if not isinstance(data, dict):
        return data
    
    cleaned = {}
    for key, value in data.items():
        if isinstance(value, str):
            cleaned[key] = value.strip()
        elif isinstance(value, dict):
            cleaned[key] = clean_input_data(value)
        elif isinstance(value, list):
            cleaned[key] = [clean_input_data(item) if isinstance(item, dict) else item.strip() if isinstance(item, str) else item for item in value]
        else:
            cleaned[key] = value
    return cleaned

def ensure_initial_admin():
    """Checks for and creates the default admin user 'ImranSaab' on first run."""
    if check_db():
        if mongo.db.users.count_documents({}) == 0:
            # Create ImranSaab as the Admin
            admin_user = {
                'username': 'ImranSaab',
                'password': generate_password_hash('password123'),
                'role': 'Admin',
                'name': 'Imran Khan (Admin)',
                'email': os.environ.get('ADMIN_EMAIL', 'admin@example.com').strip().lower(),
                'created_at': datetime.now()
            }
            mongo.db.users.insert_one(admin_user)
            print("Initial Admin user 'ImranSaab' created.")

def create_indices():
    """Ensure essential database indices exist for performance."""
    if check_db():
        try:
            # Users index
            mongo.db.users.create_index([("username", 1)], unique=True)
            
            # Patients indices
            mongo.db.patients.create_index([("admissionDate", -1)])
            mongo.db.patients.create_index([("isDischarged", 1)])
            
            # Canteen Sales indices
            mongo.db.canteen_sales.create_index([("patient_id", 1)])
            mongo.db.canteen_sales.create_index([("date", -1)])
            
            # Expenses indices
            mongo.db.expenses.create_index([("date", -1)])
            mongo.db.expenses.create_index([("category", 1)])
            
            # Daily Reports indices
            mongo.db.daily_reports.create_index([("patient_id", 1), ("date", -1)])
            
            print("Database indices verified/created.")
        except Exception as e:
            print(f"Error creating indices: {e}")

# Run initial setup outside of request context
with app.app_context():
    ensure_initial_admin()
    create_indices()

# ── APScheduler (only in main process, not werkzeug reloader child) ───────────
_scheduler = None
if os.environ.get('SCHEDULER_ENABLED', 'true').lower() == 'true':
    _is_reloader_child = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    # In production (gunicorn) WERKZEUG_RUN_MAIN is not set — always start
    # In dev (flask debug) only start in the child process that serves requests
    if _is_reloader_child or not app.debug:
        try:
            from services.scheduler import create_scheduler
            _scheduler = create_scheduler()
            _scheduler.start()
            print("[Scheduler] ✅ APScheduler started (billing: 1st/5th 09:00 | reports: 17:00 PKT)")
        except Exception as _se:
            print(f"[Scheduler] ⚠️  Could not start scheduler: {_se}")


def normalize_email(value):
    return value.strip().lower() if isinstance(value, str) else value


def send_password_reset_email(to_email, username, token):
    """Send a password reset email using Gmail SMTP credentials."""
    gmail_user = app.config.get("GMAIL_USER")
    gmail_pass = app.config.get("GMAIL_APP_PASSWORD")

    if not gmail_user or not gmail_pass:
        print("Gmail credentials missing; cannot send password reset email.")
        return False

    base_url = url_for('index', _external=True)
    connector = '&' if '?' in base_url else '?'
    reset_link = f"{base_url}{connector}reset_token={token}"
    expires_in = app.config.get("PASSWORD_RESET_EXPIRY_MINUTES", 30)

    message = EmailMessage()
    message["Subject"] = "Reset your PRO account password"
    message["From"] = gmail_user
    message["To"] = to_email
    message.set_content(
        f"Hello {username},\n\n"
        "We received a request to reset your password. "
        f"Use the link below to set a new password (valid for {expires_in} minutes).\n\n"
        f"{reset_link}\n\n"
        "If you did not request this, you can safely ignore this email."
    )

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(gmail_user, gmail_pass)
            server.send_message(message)
        return True
    except Exception as e:
        print(f"Failed to send reset email: {e}")
        return False


def get_current_user_id():
    """Helper to get user ID from JWT header or fallback to session."""
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
            return payload.get('user_id')
        except jwt.ExpiredSignatureError:
            return None # Requires refresh
        except jwt.InvalidTokenError:
            return None
    # Fallback to session
    return session.get('user_id')

def login_required(f):
    def wrapper(*args, **kwargs):
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401
        # Set user_id in kwargs or context if needed, for now we rely on get_current_user_id inside routes
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

def role_required(roles):
    def decorator(f):
        @login_required
        def wrapper(*args, **kwargs):
            if not check_db(): return jsonify({"error": "Database not initialized"}), 500
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            
            # Diagnostic print for debugging 403s
            current_role = user.get('role') if user else 'None'
            print(f"[RBAC Debug] User: {user.get('username') if user else 'Unknown'}, Role: {current_role}, Required: {roles}")
            
            # Exclude deleted users
            if user and not user.get('deleted_at') and current_role in roles:
                return f(*args, **kwargs)
            
            return jsonify({"error": "Access Denied", "debug_role": current_role}), 403
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

def calculate_prorated_fee(monthly_fee, days_elapsed):
    """
    Calculate prorated fee based purely on days elapsed.
    Formula: (monthly_fee / 30) * days_elapsed.
    This ensures patients are charged fairly per day based on their set monthly fee,
    calculating properly for both short stays and long stays.
    """
    try:
        # Parse monthly_fee to handle string values with commas
        if isinstance(monthly_fee, str):
            monthly_fee = int(monthly_fee.replace(',', '') or '0')
        else:
            monthly_fee = int(monthly_fee or 0)
        
        per_day_rate = monthly_fee / 30.0
        return int(per_day_rate * max(days_elapsed, 1))  # At least 1 day charge
    except (ValueError, TypeError):
        return 0


# ============================================================
# FINANCIAL SYSTEM LOGIC OVERVIEW:
# ============================================================
# 
# The system tracks patient finances through multiple components:
#
# 1. PATIENT CHARGES (Calculated):
#    - Monthly Fee: Stored per patient, prorated after 90 days
#    - Canteen Sales: Aggregated from canteen_sales collection
#    - Laundry: One-time charge added at discharge (if laundryStatus=True)
#    
# 2. PAYMENTS (Tracked):
#    - receivedAmount: Cumulative payments stored in patient record
#    - Payment History: Individual payments logged in expenses collection
#      (type='incoming', category='Patient Fee', auto=True)
#
# 3. BALANCE CALCULATION:
#    Balance Due = (Fee + Canteen + Laundry) - Received Amount
#
# 4. DASHBOARD METRICS:
#    - Total Expected Balance: Sum of all positive balances from active patients
#    - This shows total money owed to the facility
#
# 5. EXPENSES TRACKING:
#    - Manual Income: Recorded in expenses (type='incoming')  
#    - Manual Outgoing: Recorded in expenses (type='outgoing')
#    - Patient payments are auto-recorded but NOT double-counted in summaries
#
# 6. OVERHEADS TRACKING:
#    - Monthly daily expense tracking (kitchen, canteen, others, advances, income)
#    - Canteen column auto-syncs with canteen_sales collection
#    - Shows daily profit/loss calculations
#
# 7. DATA CONSISTENCY:
#    - Canteen totals: Aggregated from canteen_sales using patient_id
#    - Payments: receivedAmount must match sum of payment history
#    - All financial fields stored as strings with commas, parsed as integers
# ============================================================

page_context = register_page_routes(app, mongo, ObjectId)
register_auth_api_routes(
    app,
    mongo,
    limiter,
    serializer,
    task_queue,
    check_db,
    clean_input_data,
    normalize_email,
    send_password_reset_email,
    get_current_user_id,
    login_required,
)
register_admission_page_routes(app, page_context)
register_account_page_routes(app, page_context)
register_attendance_page_routes(app, page_context)
register_canteen_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    role_required,
)
register_canteen_page_routes(app, page_context)
register_clinical_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    login_required,
    role_required,
)
register_communications_api_routes(
    app,
    mongo,
    task_queue,
    check_db,
    clean_input_data,
    get_current_user_id,
    login_required,
    role_required,
)
register_dashboard_api_routes(
    app,
    mongo,
    check_db,
    calculate_prorated_fee,
    decrypt_data,
    login_required,
    role_required,
)
register_expense_page_routes(app, page_context)
register_export_page_routes(app, page_context)
register_family_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    login_required,
    role_required,
    get_current_user_id,
)
register_family_dashboard_page_routes(app, page_context)
register_finance_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    login_required,
    role_required,
    calculate_prorated_fee,
    get_current_user_id,
)
register_monthly_overheads_page_routes(app, page_context)
register_overheads_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    login_required,
    role_required,
)
register_overheads_page_routes(app, page_context)
register_manual_discharge_page_routes(app, page_context)
register_patient_api_routes(
    app,
    mongo,
    task_queue,
    check_db,
    clean_input_data,
    encrypt_data,
    decrypt_data,
    login_required,
    role_required,
)
register_patient_page_routes(app, page_context)
register_prescription_page_routes(app, page_context)
register_psych_sessions_page_routes(app, page_context)
register_reports_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    login_required,
    role_required,
)
register_report_page_routes(app, page_context)
register_staff_dashboard_page_routes(app, page_context)
register_team_page_routes(app, page_context)
register_utility_bills_page_routes(app, page_context)
register_user_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    normalize_email,
    role_required,
)
register_user_page_routes(app, page_context)
register_system_api_routes(
    app,
    mongo,
    _scheduler,
    check_db,
    get_current_user_id,
    login_required,
    role_required,
)
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
