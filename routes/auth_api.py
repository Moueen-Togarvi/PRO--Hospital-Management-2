import os
import random
import string
from datetime import datetime, timedelta

import jwt
from bson.objectid import ObjectId
from flask import jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash


def register_auth_api_routes(
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
):
    otp_store = {}

    @app.route('/api/auth/login', methods=['POST'])
    @limiter.limit("5 per minute")
    def login():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.get_json(silent=True) or {})
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        user = mongo.db.users.find_one({"username": username, "deleted_at": {"$exists": False}})

        if user and user.get('password') and check_password_hash(user['password'], password):
            user_id = str(user['_id'])
            role = user['role']

            if role in ['Admin', 'Doctor', 'Psychologist'] and os.getenv('MFA_ENABLED', 'false').lower() == 'true':
                session['mfa_user_id'] = user_id
                session['mfa_pending'] = True

                phone = str(user.get('phone') or user.get('contactNo') or '').strip()
                if phone:
                    otp = ''.join(random.choices(string.digits, k=6))
                    expires_at = datetime.now() + timedelta(minutes=5)
                    otp_store[user_id] = {'otp': otp, 'expires_at': expires_at}
                    task_queue.enqueue(
                        'services.whatsapp.send_otp',
                        phone_number=phone,
                        otp_code=otp,
                        username=user.get('username', '')
                    )

                return jsonify({
                    "mfa_required": True,
                    "user_id": user_id,
                    "message": "MFA code sent to your registered WhatsApp"
                }), 200

            session['user_id'] = user_id
            session['username'] = user['username']
            session['role'] = user['role']

            access_token = jwt.encode({
                'user_id': user_id,
                'role': user['role'],
                'exp': datetime.utcnow() + timedelta(minutes=15)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

            refresh_token = jwt.encode({
                'user_id': user_id,
                'exp': datetime.utcnow() + timedelta(days=7)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

            response = jsonify({
                "message": "Login successful",
                "username": user['username'],
                "role": user['role'],
                "name": user.get('name', user['username']),
                "user_id": user_id,
                "access_token": access_token
            })
            response.set_cookie('refresh_token', refresh_token, httponly=True, secure=True, samesite='Strict')
            return response

        return jsonify({"error": "Invalid credentials"}), 401

    @app.route('/api/auth/refresh', methods=['POST'])
    def refresh_token():
        refresh_token_value = request.cookies.get('refresh_token')
        if not refresh_token_value:
            return jsonify({"error": "No refresh token provided"}), 401

        try:
            payload = jwt.decode(refresh_token_value, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
            user_id = payload.get('user_id')

            user = mongo.db.users.find_one({"_id": ObjectId(user_id), "deleted_at": {"$exists": False}})
            if not user:
                return jsonify({"error": "User not found"}), 401

            new_access_token = jwt.encode({
                'user_id': user_id,
                'role': user['role'],
                'exp': datetime.utcnow() + timedelta(minutes=15)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

            return jsonify({"access_token": new_access_token})
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Refresh token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid refresh token"}), 401

    @app.route('/api/auth/forgot', methods=['POST'])
    def forgot_password():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json or {})
        username = data.get('username')
        email = normalize_email(data.get('email'))

        if not username or not email:
            return jsonify({"error": "Username and email are required"}), 400

        if not app.config.get("GMAIL_USER") or not app.config.get("GMAIL_APP_PASSWORD"):
            return jsonify({"error": "Email service not configured"}), 500

        user = mongo.db.users.find_one({"username": username})
        if not user:
            return jsonify({"error": "No account found for that username."}), 404

        registered_email = normalize_email(user.get('email'))
        if not registered_email:
            return jsonify({"error": "No email is set for this account. Contact an admin."}), 400

        if registered_email != email:
            return jsonify({"error": "Username and email do not match our records."}), 400

        token = serializer.dumps({"user_id": str(user['_id']), "email": registered_email}, salt="password-reset")
        sent = send_password_reset_email(registered_email, user.get('name', user['username']), token)
        if not sent:
            return jsonify({"error": "Could not send reset email. Please try again or contact support."}), 500

        return jsonify({"message": "Reset email sent to your registered address."})

    @app.route('/api/auth/reset', methods=['POST'])
    def reset_password():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json or {})
        token = data.get('token')
        new_password = data.get('new_password')

        if not token or not new_password:
            return jsonify({"error": "Token and new password are required"}), 400

        try:
            payload = serializer.loads(
                token,
                salt="password-reset",
                max_age=app.config.get("PASSWORD_RESET_EXPIRY_MINUTES", 30) * 60
            )
        except Exception as error:
            error_name = type(error).__name__
            if error_name == "SignatureExpired":
                return jsonify({"error": "Reset link expired"}), 400
            return jsonify({"error": "Invalid reset token"}), 400

        user_id = payload.get('user_id')
        email = normalize_email(payload.get('email'))
        if not user_id:
            return jsonify({"error": "Invalid reset token"}), 400

        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user or (email and normalize_email(user.get('email')) != email):
            return jsonify({"error": "Invalid reset token"}), 400

        new_password_hash = generate_password_hash(new_password)
        mongo.db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'password': new_password_hash}})
        return jsonify({"message": "Password has been reset successfully"})

    @app.route('/api/auth/logout', methods=['POST'])
    def logout():
        session.pop('user_id', None)
        session.pop('username', None)
        session.pop('role', None)
        session.pop('mfa_user_id', None)
        session.pop('mfa_pending', None)
        return jsonify({"message": "Logged out"})

    @app.route('/api/auth/session', methods=['GET'])
    def check_session():
        if 'user_id' in session:
            return jsonify({
                "is_logged_in": True,
                "username": session.get('username'),
                "role": session.get('role'),
                "user_id": session.get('user_id')
            })
        return jsonify({"is_logged_in": False})

    @app.route('/api/users/change_password', methods=['POST'])
    @login_required
    def change_password():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        user_id = session['user_id']

        try:
            user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            if not user or not check_password_hash(user['password'], data['old_password']):
                return jsonify({"error": "Invalid old password"}), 401

            new_password_hash = generate_password_hash(data['new_password'])
            mongo.db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'password': new_password_hash}})
            return jsonify({"message": "Password updated successfully"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/auth/mfa/request', methods=['POST'])
    def mfa_request_otp():
        if os.getenv('MFA_ENABLED', 'false').lower() != 'true':
            return jsonify({'message': 'MFA is not enabled'}), 200
        if not check_db():
            return jsonify({'error': 'Database error'}), 500

        try:
            user_id = get_current_user_id()
            if not user_id:
                return jsonify({'error': 'Not authenticated'}), 401
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            if not user:
                return jsonify({'error': 'User not found'}), 404
            phone = str(user.get('phone') or user.get('contactNo') or '').strip()
            if not phone:
                return jsonify({'error': 'No phone number on file for MFA'}), 400

            otp = ''.join(random.choices(string.digits, k=6))
            expires_at = datetime.now() + timedelta(minutes=5)
            otp_store[user_id] = {'otp': otp, 'expires_at': expires_at}

            task_queue.enqueue(
                'services.whatsapp.send_otp',
                phone_number=phone,
                otp_code=otp,
                username=user.get('username', '')
            )
            return jsonify({'message': 'OTP sent via WhatsApp', 'expires_in': 300})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/auth/mfa/verify', methods=['POST'])
    def mfa_verify_otp():
        if os.getenv('MFA_ENABLED', 'false').lower() != 'true':
            return jsonify({'verified': True, 'message': 'MFA not enabled - auto-verified'}), 200

        try:
            data = clean_input_data(request.json or {})
            user_id = get_current_user_id() or session.get('mfa_user_id')
            submitted_otp = data.get('otp', '')
            if not user_id:
                return jsonify({'error': 'Not authenticated'}), 401

            record = otp_store.get(user_id)
            if not record:
                return jsonify({'error': 'No OTP requested or already used'}), 400
            if datetime.now() > record['expires_at']:
                otp_store.pop(user_id, None)
                return jsonify({'error': 'OTP expired'}), 400
            if submitted_otp != record['otp']:
                return jsonify({'error': 'Invalid OTP'}), 401

            user = mongo.db.users.find_one({'_id': ObjectId(user_id), 'deleted_at': {'$exists': False}})
            if not user:
                otp_store.pop(user_id, None)
                return jsonify({'error': 'User not found'}), 404

            otp_store.pop(user_id, None)
            session.pop('mfa_pending', None)
            session.pop('mfa_user_id', None)
            session['user_id'] = user_id
            session['username'] = user['username']
            session['role'] = user['role']

            access_token = jwt.encode({
                'user_id': user_id,
                'role': user['role'],
                'exp': datetime.utcnow() + timedelta(minutes=15)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

            refresh_token = jwt.encode({
                'user_id': user_id,
                'exp': datetime.utcnow() + timedelta(days=7)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

            response = jsonify({
                "verified": True,
                "message": "MFA verified",
                "username": user['username'],
                "role": user['role'],
                "name": user.get('name', user['username']),
                "user_id": user_id,
                "access_token": access_token
            })
            response.set_cookie('refresh_token', refresh_token, httponly=True, secure=True, samesite='Strict')
            return response
        except Exception as error:
            return jsonify({'error': str(error)}), 500
