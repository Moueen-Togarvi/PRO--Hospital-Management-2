import os
from datetime import datetime, timedelta
from flask import Flask
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv
from bson.objectid import ObjectId
import random

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config["MONGO_URI"] = os.environ.get("MONGO_URI")
mongo = PyMongo(app)

def seed_db():
    print("Starting database seed...")
    
    # 1. Users
    print("Seeding Users...")
    mongo.db.users.drop()
    users = [
        {
            'username': 'ImranSaab',
            'password': generate_password_hash('password123'),
            'role': 'Admin',
            'name': 'Imran Khan (Admin)',
            'email': 'admin@pro.com',
            'created_at': datetime.now()
        },
        {
            'username': 'DrSmith',
            'password': generate_password_hash('password123'),
            'role': 'Doctor',
            'name': 'Dr. John Smith',
            'email': 'doctor@pro.com',
            'created_at': datetime.now()
        },
        {
            'username': 'NurseJoy',
            'password': generate_password_hash('password123'),
            'role': 'General Staff',
            'name': 'Nurse Joy',
            'email': 'nurse@pro.com',
            'created_at': datetime.now()
        },
        {
             'username': 'CanteenGuy',
             'password': generate_password_hash('password123'),
             'role': 'Canteen',
             'name': 'Chef Gordon',
             'email': 'canteen@pro.com',
             'created_at': datetime.now()
        }
    ]
    mongo.db.users.insert_many(users)
    print(f"Inserted {len(users)} users.")

    # 2. Patients
    print("Seeding Patients...")
    mongo.db.patients.drop()
    
    # Helper to generate random date within last 60 days
    def random_date(days_ago=60):
        return datetime.now() - timedelta(days=random.randint(0, days_ago))

    patients = [
        {
            'name': 'Ali Khan',
            'fatherName': 'Ahmed Khan',
            'age': '24',
            'cnic': '35202-1234567-1',
            'contactNo': '0300-1234567',
            'address': 'House 123, Street 4, Lahore',
            'admissionDate': random_date(90).isoformat(),
            'monthlyFee': '45000',
            'monthlyAllowance': '5000',
            'drug': 'Heroin',
            'status': 'Active',
            'isDischarged': False,
            'laundryStatus': True,
            'laundryAmount': 3500,
            'receivedAmount': '15000',
            'guardianName': 'Ahmed Khan',
            'relation': 'Father',
            'created_at': datetime.now()
        },
        {
            'name': 'Bilal Ahmed',
            'fatherName': 'Rehman Ahmed',
            'age': '32',
            'cnic': '35202-7654321-9',
            'contactNo': '0321-7654321',
            'address': 'Flat 5B, Gulberg, Lahore',
            'admissionDate': random_date(30).isoformat(),
            'monthlyFee': '50000',
            'monthlyAllowance': '10000',
            'drug': 'Ice (Crystal Meth)',
            'status': 'Active',
             'isDischarged': False,
            'laundryStatus': False,
            'laundryAmount': 0,
            'receivedAmount': '50000',
            'guardianName': 'Rehman Ahmed',
            'relation': 'Brother',
            'created_at': datetime.now()
        },
         {
            'name': 'Chaudhry Bashir',
            'fatherName': 'Chaudhry Nazeer',
            'age': '45',
            'cnic': '35202-1111111-1',
            'contactNo': '0333-1111111',
            'address': 'Village 45GB, Faisalabad',
            'admissionDate': random_date(120).isoformat(),
            'dischargeDate': random_date(10).isoformat(),
            'monthlyFee': '35000',
            'monthlyAllowance': '3000',
            'drug': 'Opium',
            'status': 'Discharged',
            'isDischarged': True,
            'laundryStatus': True,
            'laundryAmount': 3500,
            'receivedAmount': '100000',
            'guardianName': 'Chaudhry Nazeer',
            'relation': 'Father',
            'created_at': datetime.now()
        }
    ]
    
    # Store IDs for relationships
    patient_ids = []
    for p in patients:
        res = mongo.db.patients.insert_one(p)
        patient_ids.append(res.inserted_id)
        
    print(f"Inserted {len(patients)} patients.")

    # 3. Canteen Sales
    print("Seeding Canteen Sales...")
    mongo.db.canteen_sales.drop()
    
    canteen_items = [
        {'item': 'Tea', 'price': 50},
        {'item': 'Biscuits', 'price': 30},
        {'item': 'Juice', 'price': 100},
        {'item': 'Sandwich', 'price': 150},
        {'item': 'Cigarettes', 'price': 500}
    ]
    
    sales = []
    # Generate 50 random sales
    for _ in range(50):
        patient_id = random.choice(patient_ids)
        product = random.choice(canteen_items)
        sale_date = random_date(30)
        
        sales.append({
            'patient_id': patient_id,
            'item': product['item'],
            'amount': product['price'],
            'date': sale_date,
            'recorded_by': 'CanteenGuy'
        })
        
    mongo.db.canteen_sales.insert_many(sales)
    print(f"Inserted {len(sales)} canteen sales records.")

    print("Database seeding completed successfully!")

if __name__ == "__main__":
    with app.app_context():
        seed_db()
