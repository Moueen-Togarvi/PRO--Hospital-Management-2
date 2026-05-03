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
