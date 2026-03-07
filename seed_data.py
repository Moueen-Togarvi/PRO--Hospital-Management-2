import argparse
import os
import random
from collections import defaultdict
from datetime import datetime, timedelta
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash


load_dotenv()

app = Flask(__name__)
app.config["MONGO_URI"] = os.environ.get("MONGO_URI")
mongo = PyMongo(app)

SEED_TAG_DEFAULT = "bulk-demo-v1"
PATIENT_COUNT_DEFAULT = 40
RNG_SEED_DEFAULT = 20260307

SEED_COLLECTIONS = [
    "users",
    "patients",
    "canteen_sales",
    "expenses",
    "employees",
    "utility_bills",
    "psych_sessions",
    "old_balances",
    "manual_discharge_receipts",
    "attendance",
    "emergency_alerts",
    "call_meeting_tracker",
    "overheads",
]

PATIENT_FIRST_NAMES = [
    "Ali",
    "Bilal",
    "Usman",
    "Hamza",
    "Saad",
    "Zain",
    "Ahsan",
    "Farhan",
    "Omar",
    "Faisal",
    "Taha",
    "Shahzaib",
    "Umair",
    "Danish",
    "Jawad",
    "Adeel",
    "Kamran",
    "Sami",
    "Talha",
    "Rizwan",
]

PATIENT_LAST_NAMES = [
    "Khan",
    "Ahmed",
    "Shah",
    "Butt",
    "Malik",
    "Sheikh",
    "Qureshi",
    "Rana",
    "Nawaz",
    "Anwar",
    "Saeed",
    "Iqbal",
    "Javed",
    "Rauf",
    "Mughal",
    "Hashmi",
    "Abbasi",
    "Waheed",
    "Siddiqui",
    "Farooq",
]

GUARDIAN_NAMES = [
    "Ahmed",
    "Rashid",
    "Imran",
    "Khalid",
    "Nadeem",
    "Tariq",
    "Sajid",
    "Arshad",
    "Shahid",
    "Younas",
    "Salman",
    "Waqas",
]

CITIES = [
    "Lahore",
    "Karachi",
    "Faisalabad",
    "Rawalpindi",
    "Multan",
    "Sialkot",
    "Gujranwala",
    "Bahawalpur",
]

AREAS = [
    "Johar Town",
    "Model Town",
    "Gulberg",
    "DHA",
    "Bahria Town",
    "Samanabad",
    "Township",
    "Garden East",
    "Satellite Town",
    "Cantt",
]

STREETS = [
    "Street 4",
    "Street 7",
    "Block A",
    "Block C",
    "Lane 2",
    "Lane 5",
    "Main Boulevard",
    "Market Road",
]

DRUGS = [
    "Heroin",
    "Ice",
    "Hashish",
    "Opium",
    "Alcohol",
    "Pills",
    "Crystal Meth",
    "Charas",
]

RELATIONS = ["Father", "Brother", "Uncle", "Mother", "Cousin"]

EMPLOYEE_TEMPLATES = [
    ("Hassan Raza", "Accountant", 52000, "9 AM - 6 PM"),
    ("Noman Siddiq", "Receptionist", 38000, "8 AM - 4 PM"),
    ("Amina Tariq", "Nurse", 47000, "8 AM - 8 PM"),
    ("Sadaf Noor", "Nurse", 47000, "8 PM - 8 AM"),
    ("Waseem Akhtar", "Supervisor", 58000, "10 AM - 6 PM"),
    ("Adeel Iqbal", "Cleaner", 30000, "7 AM - 3 PM"),
    ("Shahid Mehmood", "Cook", 36000, "6 AM - 2 PM"),
    ("Jaweria Khan", "Psych Assistant", 42000, "10 AM - 5 PM"),
    ("Naeem Abbas", "Security Guard", 34000, "8 PM - 8 AM"),
    ("Usama Farid", "Ward Boy", 32000, "9 AM - 5 PM"),
    ("Sana Malik", "Counselor", 56000, "11 AM - 7 PM"),
    ("Rauf Alam", "Pharmacy Assistant", 41000, "9 AM - 5 PM"),
]

MANUAL_EXPENSES = [
    ("Kitchen", "outgoing", "Vegetables and milk"),
    ("Kitchen", "outgoing", "Daily grocery restock"),
    ("Maintenance", "outgoing", "Water motor repair"),
    ("Transport", "outgoing", "Patient transfer fuel"),
    ("Medicine Purchase", "outgoing", "Emergency medicine stock"),
    ("Donation", "incoming", "Support from family donor"),
    ("Consultation", "incoming", "Walk-in counseling income"),
    ("Laundry Supplies", "outgoing", "Detergent and cleaning stock"),
]

UTILITY_BILLS = [
    ("Electricity", "LESCO"),
    ("Gas", "SNGPL"),
    ("Internet", "PTCL"),
    ("Water", "WASA"),
    ("Rent", "Property Owner"),
    ("Maintenance", "Building Services"),
]

CANTEEN_ITEMS = [
    "Tea",
    "Juice",
    "Fruit",
    "Biscuits",
    "Meal Box",
    "Cold Drink",
    "Snacks",
    "Egg Sandwich",
]

PSYCH_TITLES = [
    "Relapse Prevention",
    "Family Adjustment",
    "Sleep Pattern Review",
    "Motivation and Goals",
    "Anger Management",
    "Routine Stabilization",
    "Craving Control",
    "Confidence Building",
]

ALERT_NOTES = [
    "Low blood pressure observation required.",
    "Withdrawal symptoms increased overnight.",
    "Patient reported chest discomfort.",
    "Mood instability reported by duty staff.",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Seed bulk demo data for the PRO System.")
    parser.add_argument("--patients", type=int, default=PATIENT_COUNT_DEFAULT, help="Number of demo patients to create.")
    parser.add_argument("--tag", default=SEED_TAG_DEFAULT, help="Seed tag used to identify and replace this demo batch.")
    parser.add_argument("--seed", type=int, default=RNG_SEED_DEFAULT, help="Random seed for reproducible data.")
    return parser.parse_args()


def make_svg_data_uri(title, amount, accent):
    svg = f"""
    <svg xmlns='http://www.w3.org/2000/svg' width='720' height='400'>
      <rect width='100%' height='100%' fill='{accent}' />
      <rect x='24' y='24' width='672' height='352' rx='20' fill='white' opacity='0.92' />
      <text x='48' y='110' font-size='34' font-family='Arial, sans-serif' font-weight='700' fill='#0f172a'>{title}</text>
      <text x='48' y='170' font-size='52' font-family='Arial, sans-serif' font-weight='700' fill='#0b7454'>PKR {amount:,}</text>
      <text x='48' y='230' font-size='24' font-family='Arial, sans-serif' fill='#475569'>Online payment proof</text>
    </svg>
    """.strip()
    return f"data:image/svg+xml;charset=utf-8,{quote(svg)}"


def format_phone(index):
    return f"03{(index % 5) + 10}{(1200000 + index * 731) % 10000000:07d}"


def format_cnic(index):
    return f"{35200 + (index % 90):05d}-{1000000 + index * 97:07d}-{(index % 9) + 1}"


def random_datetime_between(rng, start_dt, end_dt):
    if end_dt <= start_dt:
        return start_dt
    total_seconds = int((end_dt - start_dt).total_seconds())
    return start_dt + timedelta(seconds=rng.randint(0, total_seconds))


def month_start(dt):
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def clear_previous_seed(tag):
    print(f"Removing existing demo data for tag: {tag}")
    for collection_name in SEED_COLLECTIONS:
        deleted = mongo.db[collection_name].delete_many({"seed_tag": tag}).deleted_count
        print(f"  - {collection_name}: removed {deleted}")


def insert_demo_users(now, tag):
    print("Seeding demo users...")
    docs = [
        {
            "username": "demo.admin",
            "password": generate_password_hash("password123"),
            "role": "Admin",
            "name": "Demo Admin",
            "email": "demo.admin@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
        {
            "username": "demo.doctor",
            "password": generate_password_hash("password123"),
            "role": "Doctor",
            "name": "Dr. Hina Saleem",
            "email": "demo.doctor@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
        {
            "username": "demo.psych.1",
            "password": generate_password_hash("password123"),
            "role": "Psychologist",
            "name": "Dr. Areeba Malik",
            "email": "demo.psych1@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
        {
            "username": "demo.psych.2",
            "password": generate_password_hash("password123"),
            "role": "Psychologist",
            "name": "Dr. Salman Aziz",
            "email": "demo.psych2@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
        {
            "username": "demo.canteen",
            "password": generate_password_hash("password123"),
            "role": "Canteen",
            "name": "Demo Canteen",
            "email": "demo.canteen@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
        {
            "username": "demo.staff",
            "password": generate_password_hash("password123"),
            "role": "General Staff",
            "name": "Demo Staff",
            "email": "demo.staff@pro.test",
            "created_at": now,
            "seed_tag": tag,
        },
    ]
    result = mongo.db.users.insert_many(docs)
    user_ids = {doc["username"]: inserted_id for doc, inserted_id in zip(docs, result.inserted_ids)}
    print(f"  - inserted {len(docs)} users")
    return user_ids


def insert_demo_employees(now, tag, rng):
    print("Seeding employees...")
    docs = []
    for index, (name, designation, pay, duty_timings) in enumerate(EMPLOYEE_TEMPLATES):
        join_date = (now - timedelta(days=45 + index * 18)).date().isoformat()
        docs.append(
            {
                "name": name,
                "designation": designation,
                "pay": str(pay),
                "advance": str(rng.choice([0, 0, 5000, 7000, 10000])),
                "duty_timings": duty_timings,
                "date_of_joining": join_date,
                "cnic": format_cnic(300 + index),
                "phone": format_phone(600 + index),
                "advance_month": now.month,
                "advance_year": now.year,
                "created_at": now,
                "seed_tag": tag,
            }
        )
    result = mongo.db.employees.insert_many(docs)
    employees = []
    for doc, inserted_id in zip(docs, result.inserted_ids):
        doc = {**doc, "_id": inserted_id}
        employees.append(doc)
    print(f"  - inserted {len(employees)} employees")
    return employees


def build_patient_doc(index, today, rng, tag):
    name = f"{PATIENT_FIRST_NAMES[index % len(PATIENT_FIRST_NAMES)]} {PATIENT_LAST_NAMES[(index * 3) % len(PATIENT_LAST_NAMES)]}"
    guardian = f"{GUARDIAN_NAMES[index % len(GUARDIAN_NAMES)]} {PATIENT_LAST_NAMES[(index * 5 + 2) % len(PATIENT_LAST_NAMES)]}"
    city = CITIES[index % len(CITIES)]
    area = AREAS[(index * 2) % len(AREAS)]
    street = STREETS[(index * 3) % len(STREETS)]
    admission_days_ago = rng.randint(6, 170)
    admission_date = (today - timedelta(days=admission_days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
    is_discharged = (index + 1) % 5 == 0
    discharge_date = None
    if is_discharged:
        discharge_days_ago = rng.randint(1, max(1, admission_days_ago - 1))
        discharge_date = (today - timedelta(days=discharge_days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
        if discharge_date <= admission_date:
            discharge_date = admission_date + timedelta(days=1)

    monthly_fee = rng.choice([32000, 35000, 38000, 42000, 45000, 50000, 55000, 60000])
    allowance = rng.choice([3000, 4000, 5000, 6000, 8000, 10000])
    laundry_status = rng.random() < 0.35

    return {
        "name": name,
        "fatherName": guardian,
        "guardianName": guardian,
        "relation": RELATIONS[index % len(RELATIONS)],
        "age": str(rng.randint(19, 58)),
        "cnic": format_cnic(index + 1),
        "contactNo": format_phone(index + 1),
        "address": f"House {140 + index}, {street}, {area}, {city}",
        "area": f"{area}, {city}",
        "admissionDate": admission_date.date().isoformat(),
        "dischargeDate": discharge_date.date().isoformat() if discharge_date else "",
        "monthlyFee": str(monthly_fee),
        "monthlyAllowance": str(allowance),
        "drug": DRUGS[index % len(DRUGS)],
        "status": "Discharged" if is_discharged else "Active",
        "isDischarged": is_discharged,
        "laundryStatus": laundry_status,
        "laundryAmount": 3500 if laundry_status else 0,
        "receivedAmount": "0",
        "notes": [],
        "photo1": "",
        "photo2": "",
        "photo3": "",
        "created_at": admission_date + timedelta(hours=9),
        "seed_tag": tag,
    }


def insert_demo_patients(patient_count, today, rng, tag):
    print(f"Seeding {patient_count} patients...")
    docs = [build_patient_doc(index, today, rng, tag) for index in range(patient_count)]
    result = mongo.db.patients.insert_many(docs)
    patients = []
    for doc, inserted_id in zip(docs, result.inserted_ids):
        patients.append({**doc, "_id": inserted_id})
    discharged_count = sum(1 for patient in patients if patient["isDischarged"])
    print(f"  - inserted {len(patients)} patients ({discharged_count} discharged)")
    return patients


def insert_patient_payments(patients, today, rng, tag):
    print("Seeding patient payment records...")
    payments = []
    received_totals = {}
    for index, patient in enumerate(patients):
        patient_id = str(patient["_id"])
        patient_name = patient["name"]
        admission_dt = datetime.fromisoformat(patient["admissionDate"])
        max_dt = today
        if patient.get("dischargeDate"):
            max_dt = min(today, datetime.fromisoformat(patient["dischargeDate"]) + timedelta(hours=12))

        monthly_fee = int(patient["monthlyFee"])
        initial_amount = rng.randint(max(12000, monthly_fee // 3), monthly_fee + 6000)
        initial_amount = (initial_amount // 1000) * 1000
        payments.append(
            {
                "type": "incoming",
                "amount": initial_amount,
                "category": "Patient Fee",
                "note": f"Initial Advance from {patient_name} (Admission)",
                "payment_method": "Cash/Initial",
                "patient_id": patient_id,
                "screenshot": "",
                "date": admission_dt + timedelta(hours=10),
                "recorded_by": "demo.admin",
                "auto": True,
                "created_at": admission_dt + timedelta(hours=10),
                "seed_tag": tag,
            }
        )

        total_received = initial_amount
        extra_count = rng.randint(1, 3)
        for payment_index in range(extra_count):
            payment_date = random_datetime_between(rng, admission_dt + timedelta(days=1), max_dt)
            amount = rng.randint(8000, monthly_fee + 10000)
            amount = max(5000, (amount // 1000) * 1000)
            method = rng.choice(["Cash", "Cash", "Online"])
            screenshot = (
                make_svg_data_uri(f"{patient_name} Transfer", amount, "#bfdbfe")
                if method == "Online"
                else ""
            )
            payments.append(
                {
                    "type": "incoming",
                    "amount": amount,
                    "category": "Patient Fee",
                    "note": f"Payment from {patient_name} via {method}",
                    "payment_method": method,
                    "patient_id": patient_id,
                    "screenshot": screenshot,
                    "date": payment_date,
                    "recorded_by": "demo.admin" if payment_index % 2 == 0 else "demo.staff",
                    "auto": True,
                    "created_at": payment_date,
                    "seed_tag": tag,
                }
            )
            total_received += amount

        received_totals[patient_id] = total_received
        mongo.db.patients.update_one({"_id": patient["_id"]}, {"$set": {"receivedAmount": str(total_received)}})

    if payments:
        mongo.db.expenses.insert_many(payments)
    print(f"  - inserted {len(payments)} payment records")
    return received_totals


def insert_canteen_sales(patients, today, rng, tag):
    print("Seeding canteen sales...")
    sales = []
    totals_by_patient = defaultdict(int)
    totals_by_date = defaultdict(int)
    for index, patient in enumerate(patients):
        patient_id = patient["_id"]
        admission_dt = datetime.fromisoformat(patient["admissionDate"]) + timedelta(hours=8)
        max_dt = today
        if patient.get("dischargeDate"):
            max_dt = min(today, datetime.fromisoformat(patient["dischargeDate"]) + timedelta(hours=18))

        entry_count = rng.randint(3, 8)
        for entry_index in range(entry_count):
            sale_date = random_datetime_between(rng, admission_dt, max_dt)
            amount = rng.choice([120, 180, 220, 250, 300, 450, 550, 700, 950])
            item = CANTEEN_ITEMS[(index + entry_index) % len(CANTEEN_ITEMS)]
            entry_type = "daily" if entry_index % 3 else "other"
            sales.append(
                {
                    "patient_id": patient_id,
                    "item": item,
                    "amount": amount,
                    "entry_type": entry_type,
                    "date": sale_date,
                    "recorded_by": "demo.canteen",
                    "created_at": sale_date,
                    "seed_tag": tag,
                }
            )
            totals_by_patient[str(patient_id)] += amount
            totals_by_date[sale_date.strftime("%Y-%m-%d")] += amount

    if sales:
        mongo.db.canteen_sales.insert_many(sales)
    print(f"  - inserted {len(sales)} canteen sales rows")
    return totals_by_patient, totals_by_date


def insert_manual_expenses(today, rng, tag):
    print("Seeding manual expenses...")
    docs = []
    for index in range(18):
        category, flow_type, note = MANUAL_EXPENSES[index % len(MANUAL_EXPENSES)]
        amount = rng.randint(2000, 22000)
        amount = max(1500, (amount // 500) * 500)
        entry_date = today - timedelta(days=rng.randint(0, 35), hours=rng.randint(0, 18))
        docs.append(
            {
                "type": flow_type,
                "amount": amount,
                "category": category,
                "note": note,
                "date": entry_date,
                "recorded_by": "demo.admin",
                "created_at": entry_date,
                "auto": False,
                "seed_tag": tag,
            }
        )
    mongo.db.expenses.insert_many(docs)
    print(f"  - inserted {len(docs)} manual expense rows")


def insert_utility_bills(today, rng, tag):
    print("Seeding utility bills...")
    docs = []
    for index, (bill_type, provider) in enumerate(UTILITY_BILLS):
        docs.append(
            {
                "type": bill_type,
                "provider": provider,
                "amount": rng.randint(12000, 85000),
                "due_date": (today.date() + timedelta(days=3 + index * 2)).isoformat(),
                "ref_no": f"{bill_type[:3].upper()}-{today.year}-{100 + index}",
                "created_at": today - timedelta(days=index),
                "seed_tag": tag,
            }
        )
    mongo.db.utility_bills.insert_many(docs)
    print(f"  - inserted {len(docs)} utility bills")


def insert_old_balances(today, rng, tag):
    print("Seeding old balances...")
    docs = []
    for index in range(12):
        amount = rng.randint(10000, 90000)
        created_at = today - timedelta(days=rng.randint(1, 24))
        docs.append(
            {
                "name": f"Recovery Case {index + 1}",
                "amount": amount,
                "commitment_date": (today.date() + timedelta(days=5 + index)).isoformat(),
                "last_call_date": (today.date() - timedelta(days=rng.randint(1, 8))).isoformat(),
                "note": rng.choice(
                    [
                        "Family promised payment next week.",
                        "Pending cheque clearance.",
                        "Awaiting final confirmation from guardian.",
                        "Partial amount expected soon.",
                    ]
                ),
                "month": today.month,
                "year": today.year,
                "created_at": created_at,
                "added_by": "demo.admin",
                "seed_tag": tag,
            }
        )
    mongo.db.old_balances.insert_many(docs)
    print(f"  - inserted {len(docs)} old balance rows")


def insert_call_meeting_tracker(patients, today, rng, tag):
    print("Seeding call/meeting tracker...")
    docs = []
    current_day_limit = max(1, today.day)
    for index, patient in enumerate(patients[:18]):
        docs.append(
            {
                "name": patient["name"],
                "day": rng.randint(1, current_day_limit),
                "month": today.month,
                "year": today.year,
                "type": "Meeting" if index % 2 == 0 else "Call",
                "status": "Meeting" if index % 2 == 0 else "Call",
                "date_of_admission": patient["admissionDate"],
                "recorded_by": "demo.admin",
                "created_at": today - timedelta(hours=index),
                "seed_tag": tag,
            }
        )
    mongo.db.call_meeting_tracker.insert_many(docs)
    print(f"  - inserted {len(docs)} call/meeting records")


def insert_psych_sessions(patients, user_ids, today, rng, tag):
    print("Seeding psych sessions...")
    psychologist_ids = [str(user_ids["demo.psych.1"]), str(user_ids["demo.psych.2"])]
    active_patient_ids = [str(patient["_id"]) for patient in patients if not patient["isDischarged"]]
    docs = []
    for index in range(10):
        session_date = (today + timedelta(days=index % 10)).replace(hour=0, minute=0, second=0, microsecond=0)
        selected_patients = rng.sample(active_patient_ids, k=min(len(active_patient_ids), rng.randint(2, 5)))
        doc = {
            "psychologist_id": psychologist_ids[index % len(psychologist_ids)],
            "date": session_date,
            "time_slot": f"{10 + (index % 4)}:00 - {11 + (index % 4)}:00",
            "patient_ids": selected_patients,
            "title": PSYCH_TITLES[index % len(PSYCH_TITLES)],
            "created_by": "demo.admin",
            "created_at": today - timedelta(days=1, hours=index),
            "seed_tag": tag,
        }
        if index % 2 == 0:
            doc["note"] = "Issue: Anxiety and cravings\nIntervention: Grounding and trigger review\nResponse: Patient remained engaged and cooperative."
            doc["note_detail"] = {
                "issue": "Anxiety and cravings",
                "intervention": "Grounding and trigger review",
                "response": "Patient remained engaged and cooperative",
            }
            doc["note_author"] = "demo.psych.1" if index % 4 == 0 else "demo.psych.2"
            doc["note_at"] = session_date + timedelta(hours=12)
        docs.append(doc)
    mongo.db.psych_sessions.insert_many(docs)
    print(f"  - inserted {len(docs)} psych sessions")


def insert_manual_discharge_receipts(patients, received_totals, canteen_totals, today, rng, tag):
    print("Seeding manual discharge receipts...")
    docs = []
    discharged_patients = [patient for patient in patients if patient["isDischarged"]]
    for patient in discharged_patients[:8]:
        admission_dt = datetime.fromisoformat(patient["admissionDate"])
        discharge_dt = datetime.fromisoformat(patient["dischargeDate"])
        stay_days = max((discharge_dt - admission_dt).days, 1)
        monthly_fee = int(patient["monthlyFee"])
        fee_amount = int(round((monthly_fee / 30.0) * stay_days))
        rehab_next = rng.choice([0, 0, monthly_fee])
        test_amount = rng.choice([0, 2500, 4000, 6000])
        laundry_amount = int(patient.get("laundryAmount", 0))
        barbar_amount = rng.choice([0, 800, 1200])
        medicine_amount = rng.choice([0, 1800, 2500, 4200])
        other_amount = rng.choice([0, 1200, 2400])
        canteen_amount = canteen_totals.get(str(patient["_id"]), 0)
        received_amount = received_totals.get(str(patient["_id"]), 0)
        gross_total = (
            fee_amount
            + rehab_next
            + test_amount
            + canteen_amount
            + laundry_amount
            + barbar_amount
            + medicine_amount
            + other_amount
        )
        docs.append(
            {
                "patient_id": patient["_id"],
                "patient_name": patient["name"],
                "father_name": patient["fatherName"],
                "age": patient["age"],
                "cnic": patient["cnic"],
                "contact_no": patient["contactNo"],
                "area": patient["area"],
                "address": patient["address"],
                "admission_date": patient["admissionDate"],
                "discharge_date": patient["dischargeDate"],
                "stay_days": stay_days,
                "monthly_fee": monthly_fee,
                "fee_amount": fee_amount,
                "rehab_next_month_amount": rehab_next,
                "test_amount": test_amount,
                "canteen_amount": canteen_amount,
                "laundry_amount": laundry_amount,
                "barbar_amount": barbar_amount,
                "medicine_amount": medicine_amount,
                "other_amount": other_amount,
                "received_amount": received_amount,
                "net_balance": gross_total - received_amount,
                "notes": "Demo discharge receipt for testing.",
                "created_by": "demo.admin",
                "updated_by": "demo.admin",
                "created_at": discharge_dt + timedelta(hours=11),
                "updated_at": discharge_dt + timedelta(hours=11),
                "seed_tag": tag,
            }
        )
    if docs:
        mongo.db.manual_discharge_receipts.insert_many(docs)
    print(f"  - inserted {len(docs)} manual discharge receipts")


def insert_attendance(employees, today, rng, tag):
    print("Seeding attendance...")
    docs = []
    for employee in employees:
        days = {}
        for day in range(1, today.day + 1):
            roll = rng.random()
            if roll < 0.82:
                days[str(day)] = "P"
            elif roll < 0.92:
                days[str(day)] = "A"
        docs.append(
            {
                "employee_id": str(employee["_id"]),
                "year": today.year,
                "month": today.month,
                "days": days,
                "seed_tag": tag,
            }
        )
    mongo.db.attendance.insert_many(docs)
    print(f"  - inserted {len(docs)} attendance records")


def insert_emergency_alerts(patients, today, tag):
    print("Seeding emergency alerts...")
    docs = []
    for index, patient in enumerate(patients[:4]):
        docs.append(
            {
                "patient_name": patient["name"],
                "note": ALERT_NOTES[index % len(ALERT_NOTES)],
                "severity": "critical" if index % 2 == 0 else "warning",
                "added_by": "demo.staff",
                "status": "active",
                "created_at": today - timedelta(minutes=35 * (index + 1)),
                "seed_tag": tag,
            }
        )
    mongo.db.emergency_alerts.insert_many(docs)
    print(f"  - inserted {len(docs)} emergency alerts")


def insert_overheads(today, employees, canteen_totals_by_date, rng, tag):
    print("Seeding monthly overheads...")
    start = month_start(today)
    docs = []
    employee_names = [employee["name"] for employee in employees]
    for day_offset in range((today - start).days + 1):
        entry_dt = start + timedelta(days=day_offset)
        date_key = entry_dt.strftime("%Y-%m-%d")
        kitchen = rng.randint(4000, 13000)
        others = rng.randint(1000, 7500)
        pay_advance = rng.choice([0, 0, 0, 3500, 5000, 7000, 9000])
        income = rng.randint(18000, 85000)
        canteen_auto = canteen_totals_by_date.get(date_key, 0)
        docs.append(
            {
                "date": date_key,
                "month": entry_dt.month,
                "year": entry_dt.year,
                "kitchen": float(kitchen),
                "canteen_auto": float(canteen_auto),
                "others": float(others),
                "pay_advance": float(pay_advance),
                "employee_names": ", ".join(rng.sample(employee_names, k=min(2, len(employee_names)))),
                "income": float(income),
                "total_expense": float(kitchen + canteen_auto + others + pay_advance),
                "last_updated": today,
                "seed_tag": tag,
            }
        )
    mongo.db.overheads.insert_many(docs)
    print(f"  - inserted {len(docs)} overhead rows")


def seed_db(patient_count, tag, random_seed):
    if not app.config.get("MONGO_URI"):
        raise RuntimeError("MONGO_URI is not configured. Set it before running the seeder.")

    rng = random.Random(random_seed)
    now = datetime.now()
    today = now.replace(hour=12, minute=0, second=0, microsecond=0)

    print(f"Starting demo seed: tag={tag}, patients={patient_count}, seed={random_seed}")
    clear_previous_seed(tag)

    user_ids = insert_demo_users(now, tag)
    employees = insert_demo_employees(now, tag, rng)
    patients = insert_demo_patients(patient_count, today, rng, tag)
    received_totals = insert_patient_payments(patients, today, rng, tag)
    canteen_totals, canteen_totals_by_date = insert_canteen_sales(patients, today, rng, tag)
    insert_manual_expenses(today, rng, tag)
    insert_utility_bills(today, rng, tag)
    insert_old_balances(today, rng, tag)
    insert_call_meeting_tracker(patients, today, rng, tag)
    insert_psych_sessions(patients, user_ids, today, rng, tag)
    insert_manual_discharge_receipts(patients, received_totals, canteen_totals, today, rng, tag)
    insert_attendance(employees, today, rng, tag)
    insert_emergency_alerts(patients, today, tag)
    insert_overheads(today, employees, canteen_totals_by_date, rng, tag)

    print("Demo seed completed successfully.")
    print(f"Login examples: demo.admin / password123, demo.psych.1 / password123")


if __name__ == "__main__":
    args = parse_args()
    with app.app_context():
        seed_db(patient_count=args.patients, tag=args.tag, random_seed=args.seed)
