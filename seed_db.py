import os
from pymongo import MongoClient
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv
import random

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/hospital_management")

def seed():
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    
    print(f"Seeding database: {db.name}")

    # 1. Clear existing data
    collections = [
        "users", "patients", "canteen_sales", "expenses", "psych_sessions", 
        "patient_records", "employees", "attendance", "overheads", 
        "utility_bills", "old_balances", "daily_reports", "call_meeting_tracker",
        "emergency_alerts", "report_config", "manual_discharge_receipts"
    ]
    for coll in collections:
        db[coll].delete_many({})

    # 2. Seed Users
    admin_password = generate_password_hash("password123")
    users = [
        {"username": "ImranSaab", "password": admin_password, "role": "Admin", "name": "Imran Khan (Admin)", "email": "admin@example.com", "created_at": datetime.now()},
        {"username": "doctor1", "password": generate_password_hash("doctor123"), "role": "Doctor", "name": "Dr. Smith", "email": "doctor@example.com", "created_at": datetime.now()},
        {"username": "psych1", "password": generate_password_hash("psych123"), "role": "Psychologist", "name": "Dr. Jane Doe", "email": "psych@example.com", "created_at": datetime.now()},
        {"username": "staff1", "password": generate_password_hash("staff123"), "role": "Staff", "name": "Staff Member", "email": "staff@example.com", "created_at": datetime.now()}
    ]
    db.users.insert_many(users)
    print("Users seeded.")

    # 3. Seed Patients
    patients_data = [
        {
            "name": "Ali Ahmed", "admissionDate": (datetime.now() - timedelta(days=45)).isoformat(),
            "monthlyFee": "25,000", "monthlyAllowance": "3,000", "receivedAmount": "30,000",
            "drug": "Heroin", "isDischarged": False, "created_at": datetime.now() - timedelta(days=45),
            "laundryStatus": True, "laundryAmount": 3500, "gender": "Male", "age": "28", "phone": "0300-1234567"
        },
        {
            "name": "Usman Khan", "admissionDate": (datetime.now() - timedelta(days=10)).isoformat(),
            "monthlyFee": "30,000", "monthlyAllowance": "5,000", "receivedAmount": "10,000",
            "drug": "Ice", "isDischarged": False, "created_at": datetime.now() - timedelta(days=10),
            "laundryStatus": False, "laundryAmount": 0, "gender": "Male", "age": "24", "phone": "0321-7654321"
        },
        {
            "name": "Zubair Qureshi", "admissionDate": (datetime.now() - timedelta(days=100)).isoformat(),
            "dischargeDate": (datetime.now() - timedelta(days=5)).isoformat(),
            "monthlyFee": "20,000", "monthlyAllowance": "2,000", "receivedAmount": "65,000",
            "drug": "Alcohol", "isDischarged": True, "created_at": datetime.now() - timedelta(days=100),
            "laundryStatus": True, "laundryAmount": 3500, "gender": "Male", "age": "35", "phone": "0333-9876543"
        }
    ]
    patient_ids = db.patients.insert_many(patients_data).inserted_ids
    print(f"Patients seeded: {len(patient_ids)}")

    # 4. Seed Employees
    employees_data = [
        {"name": "Muhammad Rizwan", "role": "Security", "salary": 25000, "advance": 0, "created_at": datetime.now()},
        {"name": "Abdul Hafeez", "role": "Kitchen Staff", "salary": 20000, "advance": 500, "advance_month": datetime.now().month, "advance_year": datetime.now().year, "created_at": datetime.now()},
        {"name": "Sajid Mahmood", "role": "Sweeper", "salary": 18000, "advance": 0, "created_at": datetime.now()}
    ]
    employee_ids = db.employees.insert_many(employees_data).inserted_ids
    print(f"Employees seeded: {len(employee_ids)}")

    # 5. Seed Attendance
    now = datetime.now()
    attendance_data = []
    for emp_id in employee_ids:
        days = {str(d): "P" for d in range(1, now.day + 1)}
        attendance_data.append({
            "employee_id": emp_id,
            "month": now.month,
            "year": now.year,
            "days": days
        })
    db.attendance.insert_many(attendance_data)
    print("Attendance seeded.")

    # 6. Seed Overheads
    overheads_data = []
    for d in range(1, now.day + 1):
        overheads_data.append({
            "date": now.replace(day=d).strftime("%Y-%m-%d"),
            "month": now.month,
            "year": now.year,
            "kitchen": random.randint(500, 2000),
            "others": random.randint(100, 500),
            "pay_advance": 0,
            "income": random.randint(0, 1000)
        })
    db.overheads.insert_many(overheads_data)
    print("Overheads seeded.")

    # 7. Seed Expenses
    expenses_data = [
        {"type": "outgoing", "amount": 5000, "category": "Kitchen", "note": "Weekly Grocery", "date": datetime.now() - timedelta(days=3), "recorded_by": "ImranSaab"},
        {"type": "outgoing", "amount": 2000, "category": "Electricity", "note": "Bill payment", "date": datetime.now() - timedelta(days=10), "recorded_by": "ImranSaab"},
        {"type": "incoming", "amount": 10000, "category": "Donation", "note": "Anonymous donor", "date": datetime.now() - timedelta(days=15), "recorded_by": "ImranSaab"},
        {"type": "incoming", "amount": 25000, "category": "Patient Fee", "note": "Fee for Ali Ahmed", "patient_id": str(patient_ids[0]), "date": datetime.now() - timedelta(days=5), "recorded_by": "ImranSaab"}
    ]
    db.expenses.insert_many(expenses_data)
    print("Expenses seeded.")

    # 8. Seed Canteen Sales
    canteen_sales = [
        {"patient_id": str(patient_ids[0]), "amount": 150, "item": "Tea", "date": datetime.now() - timedelta(days=1), "recorded_by": "ImranSaab"},
        {"patient_id": str(patient_ids[0]), "amount": 500, "item": "Lunch", "date": datetime.now() - timedelta(days=2), "recorded_by": "ImranSaab"},
        {"patient_id": str(patient_ids[1]), "amount": 200, "item": "Cigarettes", "date": datetime.now() - timedelta(days=1), "recorded_by": "ImranSaab"}
    ]
    db.canteen_sales.insert_many(canteen_sales)
    print("Canteen sales seeded.")

    # 9. Seed Psych Sessions
    psych_sessions = [
        {"patient_id": str(patient_ids[0]), "date": datetime.now() - timedelta(days=1), "notes": "Patient showing progress.", "conducted_by": "psych1"},
        {"patient_id": str(patient_ids[1]), "date": datetime.now(), "notes": "Initial assessment done.", "conducted_by": "psych1"}
    ]
    db.psych_sessions.insert_many(psych_sessions)
    print("Psych sessions seeded.")

    # 10. Seed Patient Records
    patient_records = [
        {"patient_id": patient_ids[0], "type": "session_note", "text": "Patient is responding well to therapy.", "date": datetime.now() - timedelta(days=10), "recorded_by": "psych1"},
        {"patient_id": patient_ids[0], "type": "medical_record", "text": "Blood pressure normal.", "date": datetime.now() - timedelta(days=5), "recorded_by": "doctor1"}
    ]
    db.patient_records.insert_many(patient_records)
    print("Patient records seeded.")

    # 11. Seed Utility Bills
    utility_bills = [
        {"type": "Electricity", "amount": 15000, "month": now.month, "year": now.year, "status": "Paid", "date": datetime.now() - timedelta(days=5)},
        {"type": "Gas", "amount": 4000, "month": now.month, "year": now.year, "status": "Pending", "date": datetime.now() - timedelta(days=2)}
    ]
    db.utility_bills.insert_many(utility_bills)
    print("Utility bills seeded.")

    print("\n--- All Collections Seeded Successfully ---")

if __name__ == "__main__":
    seed()
