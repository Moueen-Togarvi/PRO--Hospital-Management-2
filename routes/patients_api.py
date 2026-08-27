import random
import string
from datetime import datetime

from db import ObjectId
from flask import jsonify, request, session
from werkzeug.security import generate_password_hash
from utils import safe_int_amount


def serialize_patient_document(patient_doc, decrypt_data):
    if not patient_doc:
        return None

    patient = dict(patient_doc)
    patient_id = str(patient.get('_id'))
    patient['_id'] = patient_id

    patient['name'] = decrypt_data(patient.get('name', ''))
    patient['contactNo'] = decrypt_data(patient.get('contactNo', ''))
    patient['cnic'] = decrypt_data(patient.get('cnic', ''))
    patient['guardianPhone'] = decrypt_data(patient.get('guardianPhone', ''))
    patient['guardianName'] = decrypt_data(patient.get('guardianName', ''))
    patient['monthlyFee'] = patient.get('monthlyFee', '0')
    patient['photo1'] = patient.get('photo1', '')
    patient['photo2'] = patient.get('photo2', '')
    patient['photo3'] = patient.get('photo3', '')
    patient['isDischarged'] = patient.get('isDischarged', False)
    patient['dischargeDate'] = patient.get('dischargeDate')

    return patient


def register_patient_api_routes(
    app,
    mongo,
    task_queue,
    check_db,
    clean_input_data,
    encrypt_data,
    decrypt_data,
    login_required,
    role_required,
):
    def patient_record_query(patient_id, record_id, record_type):
        return {
            '_id': ObjectId(record_id),
            'patient_id': ObjectId(patient_id),
            'type': record_type,
            'deleted_at': {'$exists': False},
        }

    @app.route('/api/patients', methods=['GET'])
    @login_required
    def get_patients():
        if not check_db():
            return jsonify([])

        try:
            patients_cursor = mongo.db.patients.find({"deleted_at": {"$exists": False}})

            canteen_totals_agg = list(mongo.db.canteen_sales.aggregate([
                {'$match': {
                    'deleted_at': {'$exists': False},
                    '$or': [
                        {'entry_type': {'$exists': False}},
                        {'entry_type': {'$ne': 'other'}}
                    ]
                }},
                {'$group': {'_id': '$patient_id', 'total': {'$sum': '$amount'}}}
            ]))
            canteen_totals_map = {str(item['_id']): item['total'] for item in canteen_totals_agg}

            patients = []
            for patient_doc in patients_cursor:
                serialized = serialize_patient_document(patient_doc, decrypt_data)
                if not serialized:
                    continue

                serialized['canteenSpent'] = canteen_totals_map.get(serialized['_id'], 0)
                patients.append(serialized)
            return jsonify(patients)
        except Exception as error:
            print(f"DB Fetch Error: {error}")
            return jsonify([])

    @app.route('/api/patients/<id>', methods=['GET'])
    @login_required
    def get_patient(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            patient_doc = mongo.db.patients.find_one({'_id': ObjectId(id), 'deleted_at': {'$exists': False}})
            if not patient_doc:
                return jsonify({"error": "Patient not found"}), 404

            serialized = serialize_patient_document(patient_doc, decrypt_data)
            if not serialized:
                return jsonify({"error": "Patient not found"}), 404

            canteen_total = list(mongo.db.canteen_sales.aggregate([
                {'$match': {
                    'deleted_at': {'$exists': False},
                    'patient_id': ObjectId(id),
                    '$or': [
                        {'entry_type': {'$exists': False}},
                        {'entry_type': {'$ne': 'other'}}
                    ]
                }},
                {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
            ]))
            serialized['canteenSpent'] = canteen_total[0]['total'] if canteen_total else 0
            return jsonify(serialized)
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients', methods=['POST'])
    @role_required(['Admin', 'Doctor'])
    def add_patient():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)

            original_name = data.get('name', 'Unknown')
            guardian_phone = data.get('guardianPhone') or data.get('contactNo') or ''
            guardian_name = data.get('guardianName', '')

            data['name'] = encrypt_data(original_name)
            if 'contactNo' in data:
                data['contactNo'] = encrypt_data(data['contactNo'])
            if 'cnic' in data:
                data['cnic'] = encrypt_data(data['cnic'])
            if 'guardianPhone' in data:
                data['guardianPhone'] = encrypt_data(data['guardianPhone'])
            if 'guardianName' in data:
                data['guardianName'] = encrypt_data(data['guardianName'])

            data['created_at'] = datetime.now()
            data['notes'] = []
            data['monthlyFee'] = data.get('monthlyFee', '0')
            data['monthlyAllowance'] = data.get('monthlyAllowance', '3000')
            data['receivedAmount'] = data.get('receivedAmount', '0')
            data['drug'] = data.get('drug', '')
            data['photo1'] = data.get('photo1', '')
            data['photo2'] = data.get('photo2', '')
            data['photo3'] = data.get('photo3', '')
            data['isDischarged'] = data.get('isDischarged', False)
            data['dischargeDate'] = data.get('dischargeDate')

            data['laundryStatus'] = data.get('laundryStatus', False)
            if data['laundryStatus']:
                data['laundryAmount'] = int(data.get('laundryAmount', 3500))
            else:
                data['laundryAmount'] = 0

            result = mongo.db.patients.insert_one(data)
            patient_id = str(result.inserted_id)

            if guardian_phone:
                temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
                username = f"family_{original_name.lower().replace(' ', '_')[:10]}_{patient_id[-4:]}"

                family_user = {
                    'username': username,
                    'password': generate_password_hash(temp_password),
                    'role': 'Family',
                    'name': guardian_name or f"{original_name}'s Family",
                    'phone': str(guardian_phone).strip(),
                    'patient_ids': [ObjectId(patient_id)],
                    'created_at': datetime.now(),
                    'temp_password_active': True
                }
                mongo.db.users.insert_one(family_user)

                login_url = request.host_url
                task_queue.enqueue(
                    'services.whatsapp.send_welcome_message',
                    phone_number=str(guardian_phone).strip(),
                    family_name=family_user['name'],
                    patient_name=original_name,
                    login_url=login_url,
                    username=username,
                    temp_password=temp_password
                )

            try:
                initial_received = safe_int_amount(data.get('receivedAmount'))
                if initial_received > 0:
                    mongo.db.expenses.insert_one({
                        'type': 'incoming',
                        'amount': initial_received,
                        'category': 'Patient Fee',
                        'note': f"Initial Advance from {original_name} (Admission)",
                        'payment_method': 'Cash/Initial',
                        'patient_id': patient_id,
                        'date': datetime.now(),
                        'recorded_by': session.get('username', 'Admin'),
                        'auto': True
                    })
            except Exception:
                pass

            return jsonify({"message": "Success", "id": patient_id}), 201
        except Exception as error:
            print(f"DB Insert Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<id>', methods=['PUT'])
    @role_required(['Admin', 'Doctor'])
    def update_patient(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)
            if '_id' in data:
                del data['_id']

            for field in ['name', 'contactNo', 'cnic', 'guardianPhone', 'guardianName']:
                if field in data:
                    data[field] = encrypt_data(data[field]) if data[field] else ''

            mongo.db.patients.update_one({'_id': ObjectId(id)}, {'$set': data})
            return jsonify({"message": "Updated"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<id>', methods=['DELETE'])
    @role_required(['Admin'])
    def delete_patient(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            result = mongo.db.patients.update_one({'_id': ObjectId(id)}, {'$set': {'deleted_at': datetime.utcnow()}})
            if result.modified_count > 0:
                mongo.db.patient_records.update_many({'patient_id': id}, {'$set': {'deleted_at': datetime.utcnow()}})
                return jsonify({"message": "Patient deleted successfully"}), 200
            return jsonify({"error": "Patient not found"}), 404
        except Exception as error:
            print(f"Delete Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/session_note', methods=['POST'])
    @role_required(['Admin', 'Psychologist'])
    def add_session_note(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)
            note = {
                'text': data['text'],
                'type': 'session_note',
                'date': datetime.now(),
                'recorded_by': session.get('username', 'System'),
                'patient_id': ObjectId(patient_id)
            }
            result = mongo.db.patient_records.insert_one(note)
            return jsonify({"message": "Session note added", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/medical_record', methods=['POST'])
    @role_required(['Admin', 'Doctor'])
    def add_medical_record(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)
            record = {
                'title': data['title'],
                'details': data['details'],
                'type': 'medical_record',
                'date': datetime.now(),
                'recorded_by': session.get('username', 'System'),
                'patient_id': ObjectId(patient_id)
            }
            result = mongo.db.patient_records.insert_one(record)
            return jsonify({"message": "Medical record added", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/records', methods=['GET'])
    @login_required
    def get_patient_records(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            records_cursor = mongo.db.patient_records.find({
                'patient_id': ObjectId(patient_id),
                'deleted_at': {'$exists': False},
            }).sort('date', -1)
            records = []
            for record in records_cursor:
                record['_id'] = str(record['_id'])
                record['patient_id'] = str(record['patient_id'])
                if record.get('date') and hasattr(record['date'], 'isoformat'):
                    record['date'] = record['date'].isoformat()
                records.append(record)
            return jsonify(records)
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/session_note/<record_id>', methods=['PUT'])
    @role_required(['Admin', 'Psychologist'])
    def update_session_note(patient_id, record_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json or {})
            text = data.get('text', '')
            if not text:
                return jsonify({"error": "Session note is required"}), 400

            result = mongo.db.patient_records.update_one(
                patient_record_query(patient_id, record_id, 'session_note'),
                {'$set': {
                    'text': text,
                    'updated_at': datetime.utcnow(),
                    'updated_by': session.get('username', 'System'),
                }}
            )
            if result.matched_count == 0:
                return jsonify({"error": "Session note not found"}), 404
            return jsonify({"message": "Session note updated"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/session_note/<record_id>', methods=['DELETE'])
    @role_required(['Admin', 'Psychologist'])
    def delete_session_note(patient_id, record_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            result = mongo.db.patient_records.update_one(
                patient_record_query(patient_id, record_id, 'session_note'),
                {'$set': {
                    'deleted_at': datetime.utcnow(),
                    'deleted_by': session.get('username', 'System'),
                }}
            )
            if result.matched_count == 0:
                return jsonify({"error": "Session note not found"}), 404
            return jsonify({"message": "Session note deleted"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/medical_record/<record_id>', methods=['PUT'])
    @role_required(['Admin', 'Doctor'])
    def update_medical_record(patient_id, record_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json or {})
            title = data.get('title', '')
            details = data.get('details', '')
            if not title and not details:
                return jsonify({"error": "Record title or details are required"}), 400

            result = mongo.db.patient_records.update_one(
                patient_record_query(patient_id, record_id, 'medical_record'),
                {'$set': {
                    'title': title or 'Medical Record',
                    'details': details,
                    'updated_at': datetime.utcnow(),
                    'updated_by': session.get('username', 'System'),
                }}
            )
            if result.matched_count == 0:
                return jsonify({"error": "Medical record not found"}), 404
            return jsonify({"message": "Medical record updated"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/patients/<patient_id>/medical_record/<record_id>', methods=['DELETE'])
    @role_required(['Admin', 'Doctor'])
    def delete_medical_record(patient_id, record_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            result = mongo.db.patient_records.update_one(
                patient_record_query(patient_id, record_id, 'medical_record'),
                {'$set': {
                    'deleted_at': datetime.utcnow(),
                    'deleted_by': session.get('username', 'System'),
                }}
            )
            if result.matched_count == 0:
                return jsonify({"error": "Medical record not found"}), 404
            return jsonify({"message": "Medical record deleted"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500
