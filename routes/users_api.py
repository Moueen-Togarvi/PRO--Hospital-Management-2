from datetime import datetime

from bson.objectid import ObjectId
from flask import jsonify, request
from werkzeug.security import generate_password_hash


def register_user_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    normalize_email,
    role_required,
):
    @app.route('/api/users', methods=['GET'])
    @role_required(['Admin'])
    def get_users():
        if not check_db():
            return jsonify([])

        users_cursor = mongo.db.users.find({"deleted_at": {"$exists": False}}, {'password': 0})
        users = []
        for user_doc in users_cursor:
            user = {**user_doc, '_id': str(user_doc['_id'])}
            if 'patient_ids' in user and isinstance(user['patient_ids'], list):
                user['patient_ids'] = [str(patient_id) for patient_id in user['patient_ids']]
            users.append(user)
        return jsonify(users)

    @app.route('/api/users', methods=['POST'])
    @role_required(['Admin'])
    def create_user():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        if not all(key in data for key in ['username', 'password', 'role', 'name', 'email']):
            return jsonify({"error": "Missing fields"}), 400

        allowed_roles = {
            'Admin', 'Reception', 'Doctor', 'Nurse', 'Lab', 'Radiology',
            'Pharmacy', 'Accountant', 'Psychologist', 'Canteen',
            'General Staff', 'Family'
        }
        if data.get('role') not in allowed_roles:
            return jsonify({"error": "Invalid role"}), 400

        data['email'] = normalize_email(data.get('email'))
        if not data['email']:
            return jsonify({"error": "Valid email required"}), 400

        if mongo.db.users.find_one({"username": data['username']}):
            return jsonify({"error": "Username already exists"}), 409

        if mongo.db.users.find_one({"email": data['email']}):
            return jsonify({"error": "Email already exists"}), 409

        data['password'] = generate_password_hash(data['password'])
        data['created_at'] = datetime.now()

        if data.get('role') == 'Family':
            patient_ids_raw = data.get('patient_ids', [])
            patient_ids = []
            for patient_id in patient_ids_raw:
                try:
                    if mongo.db.patients.find_one({"_id": ObjectId(patient_id)}):
                        patient_ids.append(ObjectId(patient_id))
                except Exception:
                    pass
            data['patient_ids'] = patient_ids

        if data.get('role') == 'General Staff':
            data['day_shift'] = data.get('day_shift', False)
            data['night_shift'] = data.get('night_shift', False)

        try:
            result = mongo.db.users.insert_one(data)
            return jsonify({"message": "User created", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/users/<id>', methods=['PUT'])
    @role_required(['Admin'])
    def update_user(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            if not ObjectId.is_valid(id):
                return jsonify({"error": "Invalid user id"}), 400

            user_id = ObjectId(id)
            existing_user = mongo.db.users.find_one({"_id": user_id, "deleted_at": {"$exists": False}})
            if not existing_user:
                return jsonify({"error": "User not found"}), 404

            data = clean_input_data(request.json or {})
            if not all(key in data for key in ['username', 'role', 'name', 'email']):
                return jsonify({"error": "Missing fields"}), 400

            email = normalize_email(data.get('email'))
            if not email:
                return jsonify({"error": "Valid email required"}), 400

            username = data.get('username', '').strip()
            role = data.get('role', '').strip()
            name = data.get('name', '').strip()

            if not username or not role or not name:
                return jsonify({"error": "Name, username and role are required"}), 400

            allowed_roles = {
                'Admin', 'Reception', 'Doctor', 'Nurse', 'Lab', 'Radiology',
                'Pharmacy', 'Accountant', 'Psychologist', 'Canteen',
                'General Staff', 'Family'
            }
            if role not in allowed_roles:
                return jsonify({"error": "Invalid role"}), 400

            duplicate_username = mongo.db.users.find_one({
                "_id": {"$ne": user_id},
                "username": username,
            })
            if duplicate_username:
                return jsonify({"error": "Username already exists"}), 409

            duplicate_email = mongo.db.users.find_one({
                "_id": {"$ne": user_id},
                "email": email,
            })
            if duplicate_email:
                return jsonify({"error": "Email already exists"}), 409

            update_fields = {
                "name": name,
                "username": username,
                "email": email,
                "role": role,
                "updated_at": datetime.utcnow(),
            }

            if existing_user.get('username') == 'ImranSaab':
                update_fields['username'] = existing_user.get('username')
                update_fields['role'] = 'Admin'

            password = data.get('password', '')
            if password:
                update_fields['password'] = generate_password_hash(password)

            if update_fields.get('role') == 'Family':
                patient_ids = []
                for patient_id in data.get('patient_ids', []):
                    try:
                        if mongo.db.patients.find_one({"_id": ObjectId(patient_id)}):
                            patient_ids.append(ObjectId(patient_id))
                    except Exception:
                        pass
                update_fields['patient_ids'] = patient_ids
            else:
                update_fields['patient_ids'] = []

            if update_fields.get('role') == 'General Staff':
                update_fields['day_shift'] = bool(data.get('day_shift', False))
                update_fields['night_shift'] = bool(data.get('night_shift', False))
            else:
                update_fields['day_shift'] = False
                update_fields['night_shift'] = False

            mongo.db.users.update_one({'_id': user_id}, {'$set': update_fields})
            return jsonify({"message": "User updated"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/users/<id>', methods=['DELETE'])
    @role_required(['Admin'])
    def delete_user(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            user = mongo.db.users.find_one({'_id': ObjectId(id)})
            if user and user.get('username') == 'ImranSaab':
                return jsonify({"error": "Main admin cannot be deleted"}), 403

            mongo.db.users.update_one({'_id': ObjectId(id)}, {'$set': {'deleted_at': datetime.utcnow()}})
            return jsonify({"message": "User deleted"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/users/<id>/patients', methods=['PUT'])
    @role_required(['Admin'])
    def update_user_patients(id):
        if not check_db():
            return jsonify({'error': 'Database error'}), 500

        try:
            data = request.json or {}
            patient_ids = data.get('patient_ids', [])
            object_ids = [ObjectId(patient_id) for patient_id in patient_ids if patient_id]

            mongo.db.users.update_one(
                {'_id': ObjectId(id)},
                {'$set': {'patient_ids': object_ids}}
            )
            return jsonify({'message': 'User patient links updated successfully'})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/users/<id>/shift', methods=['PUT'])
    @role_required(['Admin'])
    def update_user_shift(id):
        if not check_db():
            return jsonify({'error': 'Database error'}), 500

        try:
            data = request.json or {}
            update_fields = {}
            if 'day_shift' in data:
                update_fields['day_shift'] = bool(data['day_shift'])
            if 'night_shift' in data:
                update_fields['night_shift'] = bool(data['night_shift'])

            if update_fields:
                mongo.db.users.update_one({'_id': ObjectId(id)}, {'$set': update_fields})

            return jsonify({'message': 'Shift updated successfully'})
        except Exception as error:
            return jsonify({'error': str(error)}), 500
