import hmac
import os
import random
import string
import uuid
from datetime import datetime, timedelta

import jwt
from db import ObjectId
from flask import jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

OTP_TTL_SECONDS = 300
REFRESH_TOKEN_DAYS = 7


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
    redis_conn,
):
    def _otp_key(user_id):
        return f"otp:{user_id}"

    def store_otp(user_id, otp):
        redis_conn.setex(_otp_key(user_id), OTP_TTL_SECONDS, otp)

    def get_otp(user_id):
        value = redis_conn.get(_otp_key(user_id))
        return value.decode() if value else None

    def clear_otp(user_id):
        redis_conn.delete(_otp_key(user_id))

    def _refresh_key(jti):
        return f"refresh_token:{jti}"

    def issue_tokens(user_id, role):
        access_token = jwt.encode({
            'user_id': user_id,
            'role': role,
            'exp': datetime.utcnow() + timedelta(minutes=15)
        }, app.config['JWT_SECRET_KEY'], algorithm='HS256')

        jti = str(uuid.uuid4())
        refresh_token = jwt.encode({
            'user_id': user_id,
            'jti': jti,
            'exp': datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS)
        }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
        redis_conn.setex(_refresh_key(jti), timedelta(days=REFRESH_TOKEN_DAYS), user_id)

        return access_token, refresh_token

    def set_refresh_cookie(response, refresh_token):
        response.set_cookie(
            'refresh_token', refresh_token,
            httponly=True, secure=app.config.get('SESSION_COOKIE_SECURE', True), samesite='Strict',
            max_age=REFRESH_TOKEN_DAYS * 24 * 3600,
        )

    def serialize_account_user(user):
        return {
            "user_id": str(user.get("_id", "")),
            "username": user.get("username", ""),
            "name": user.get("name") or user.get("username", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
        }

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

        normalized_login_email = normalize_email(username)
        user = mongo.db.users.find_one({
            "$or": [
                {"username": username},
                {"email": normalized_login_email},
            ],
            "deleted_at": {"$exists": False},
        })

        if user and user.get('password') and check_password_hash(user['password'], password):
            user_id = str(user['_id'])
            role = user['role']

            if role in ['Admin', 'Doctor', 'Psychologist'] and os.getenv('MFA_ENABLED', 'false').lower() == 'true':
                session['mfa_user_id'] = user_id
                session['mfa_pending'] = True

                phone = str(user.get('phone') or user.get('contactNo') or '').strip()
                if phone:
                    otp = ''.join(random.choices(string.digits, k=6))
                    store_otp(user_id, otp)
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

            access_token, refresh_token = issue_tokens(user_id, user['role'])

            response = jsonify({
                "message": "Login successful",
                "username": user['username'],
                "role": user['role'],
                "name": user.get('name', user['username']),
                "user_id": user_id,
                "access_token": access_token
            })
            set_refresh_cookie(response, refresh_token)
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
            jti = payload.get('jti')

            if not jti or not redis_conn.get(_refresh_key(jti)):
                return jsonify({"error": "Refresh token revoked or invalid"}), 401

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
    @limiter.limit("5 per hour")
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
    @limiter.limit("10 per hour")
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
        refresh_token_value = request.cookies.get('refresh_token')
        if refresh_token_value:
            try:
                payload = jwt.decode(
                    refresh_token_value, app.config['JWT_SECRET_KEY'],
                    algorithms=['HS256'], options={"verify_exp": False},
                )
                jti = payload.get('jti')
                if jti:
                    redis_conn.delete(_refresh_key(jti))
            except jwt.InvalidTokenError:
                pass

        session.pop('user_id', None)
        session.pop('username', None)
        session.pop('role', None)
        session.pop('mfa_user_id', None)
        session.pop('mfa_pending', None)
        response = jsonify({"message": "Logged out"})
        response.set_cookie('refresh_token', '', expires=0, httponly=True, samesite='Strict')
        return response

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

    @app.route('/api/auth/profile', methods=['GET'])
    @login_required
    def get_account_profile():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        user_id = get_current_user_id()
        try:
            user = mongo.db.users.find_one({
                "_id": ObjectId(user_id),
                "deleted_at": {"$exists": False},
            })
        except Exception:
            user = None

        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({"profile": serialize_account_user(user)})

    @app.route('/api/auth/profile', methods=['PUT'])
    @login_required
    def update_account_profile():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.get_json(silent=True) or {})
        user_id = get_current_user_id()

        try:
            user_object_id = ObjectId(user_id)
            user = mongo.db.users.find_one({
                "_id": user_object_id,
                "deleted_at": {"$exists": False},
            })
        except Exception:
            user = None

        if not user:
            return jsonify({"error": "User not found"}), 404

        username = (data.get("username") or "").strip()
        name = (data.get("name") or username).strip()
        email = normalize_email(data.get("email"))
        current_password = data.get("current_password") or ""
        new_password = data.get("new_password") or ""

        if not username or not name or not email:
            return jsonify({"error": "Name, username, and email are required"}), 400

        duplicate_username = mongo.db.users.find_one({
            "_id": {"$ne": user_object_id},
            "username": username,
            "deleted_at": {"$exists": False},
        })
        if duplicate_username:
            return jsonify({"error": "Username already exists"}), 409

        duplicate_email = mongo.db.users.find_one({
            "_id": {"$ne": user_object_id},
            "email": email,
            "deleted_at": {"$exists": False},
        })
        if duplicate_email:
            return jsonify({"error": "Email already exists"}), 409

        update_fields = {
            "username": username,
            "name": name,
            "email": email,
            "updated_at": datetime.utcnow(),
        }

        if user.get("username") == "ImranSaab" or user.get("is_primary_admin"):
            update_fields["is_primary_admin"] = True

        if new_password:
            if len(new_password) < 6:
                return jsonify({"error": "New password must be at least 6 characters"}), 400
            if not current_password:
                return jsonify({"error": "Current password is required to change password"}), 400
            if not user.get("password") or not check_password_hash(user["password"], current_password):
                return jsonify({"error": "Current password is incorrect"}), 401
            update_fields["password"] = generate_password_hash(new_password)

        mongo.db.users.update_one({"_id": user_object_id}, {"$set": update_fields})
        updated_user = mongo.db.users.find_one({"_id": user_object_id})
        session["username"] = updated_user.get("username", username)
        session["role"] = updated_user.get("role", session.get("role"))
        return jsonify({
            "message": "Account updated successfully",
            "profile": serialize_account_user(updated_user),
        })

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
    @limiter.limit("5 per minute")
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
            store_otp(user_id, otp)

            task_queue.enqueue(
                'services.whatsapp.send_otp',
                phone_number=phone,
                otp_code=otp,
                username=user.get('username', '')
            )
            return jsonify({'message': 'OTP sent via WhatsApp', 'expires_in': OTP_TTL_SECONDS})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/auth/mfa/verify', methods=['POST'])
    @limiter.limit("10 per 5 minutes")
    def mfa_verify_otp():
        if os.getenv('MFA_ENABLED', 'false').lower() != 'true':
            return jsonify({'verified': True, 'message': 'MFA not enabled - auto-verified'}), 200

        try:
            data = clean_input_data(request.json or {})
            user_id = get_current_user_id() or session.get('mfa_user_id')
            submitted_otp = str(data.get('otp', ''))
            if not user_id:
                return jsonify({'error': 'Not authenticated'}), 401

            actual_otp = get_otp(user_id)
            if not actual_otp:
                return jsonify({'error': 'No OTP requested, already used, or expired'}), 400
            if not hmac.compare_digest(submitted_otp, actual_otp):
                return jsonify({'error': 'Invalid OTP'}), 401

            user = mongo.db.users.find_one({'_id': ObjectId(user_id), 'deleted_at': {'$exists': False}})
            if not user:
                clear_otp(user_id)
                return jsonify({'error': 'User not found'}), 404

            clear_otp(user_id)
            session.pop('mfa_pending', None)
            session.pop('mfa_user_id', None)
            session['user_id'] = user_id
            session['username'] = user['username']
            session['role'] = user['role']

            access_token, refresh_token = issue_tokens(user_id, user['role'])

            response = jsonify({
                "verified": True,
                "message": "MFA verified",
                "username": user['username'],
                "role": user['role'],
                "name": user.get('name', user['username']),
                "user_id": user_id,
                "access_token": access_token
            })
            set_refresh_cookie(response, refresh_token)
            return response
        except Exception as error:
            return jsonify({'error': str(error)}), 500
