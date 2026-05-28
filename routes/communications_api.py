from datetime import datetime

from bson.objectid import ObjectId
from flask import jsonify, request, session


def register_communications_api_routes(
    app,
    mongo,
    task_queue,
    check_db,
    clean_input_data,
    get_current_user_id,
    login_required,
    role_required,
):
    @app.route('/api/whatsapp/logs', methods=['GET'])
    @role_required(['Admin'])
    def get_whatsapp_logs():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            limit = int(request.args.get('limit', 50))
            msg_type = request.args.get('type')
            query = {}
            if msg_type:
                query['message_type'] = msg_type
            logs = list(mongo.db.whatsapp_logs.find(query).sort('sent_at', -1).limit(limit))
            for log in logs:
                log['_id'] = str(log['_id'])
                log['sent_at'] = log['sent_at'].isoformat() if log.get('sent_at') else ''
            return jsonify(logs)
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/whatsapp/trigger-billing', methods=['POST'])
    @role_required(['Admin'])
    def trigger_billing_manually():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            data = request.json or {}
            patient_id = data.get('patient_id')
            now = datetime.now()
            month_year = now.strftime('%B %Y')

            if patient_id:
                patient = mongo.db.patients.find_one({'_id': ObjectId(patient_id)})
                if not patient:
                    return jsonify({'error': 'Patient not found'}), 404
                phone = str(patient.get('contactNo') or patient.get('guardianPhone') or '').strip()
                if not phone:
                    return jsonify({'error': 'No phone number for patient'}), 400
                task_queue.enqueue(
                    'worker.task_send_billing',
                    patient_id=patient_id,
                    phone_number=phone,
                    month_year=month_year,
                )
                return jsonify({'message': f'Billing queued for {patient.get("name")}', 'queued': 1})

            patients = list(mongo.db.patients.find({'isDischarged': {'$ne': True}, 'deleted_at': {'$exists': False}}))
            queued = 0
            for patient in patients:
                phone = str(patient.get('contactNo') or patient.get('guardianPhone') or '').strip()
                if phone:
                    task_queue.enqueue(
                        'worker.task_send_billing',
                        patient_id=str(patient['_id']),
                        phone_number=phone,
                        month_year=month_year,
                    )
                    queued += 1
            return jsonify({'message': f'Billing queued for {queued} patients', 'queued': queued})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/whatsapp/trigger-daily-report', methods=['POST'])
    @role_required(['Admin'])
    def trigger_daily_report_manually():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            today = datetime.now().date().isoformat()
            family_users = list(mongo.db.users.find({
                'role': 'Family',
                'deleted_at': {'$exists': False},
                'patient_ids': {'$exists': True, '$ne': []}
            }))
            queued = 0
            for family_user in family_users:
                phone = str(family_user.get('phone') or '').strip()
                if not phone:
                    continue
                for patient_id in family_user.get('patient_ids', []):
                    task_queue.enqueue(
                        'worker.task_send_daily_report',
                        patient_id=str(patient_id),
                        phone_number=phone,
                        report_date=today,
                    )
                    queued += 1
            return jsonify({'message': f'Daily reports queued for {queued} patient-family pairs', 'queued': queued})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/whatsapp/send-alert', methods=['POST'])
    @role_required(['Admin'])
    def send_whatsapp_alert():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            data = clean_input_data(request.json or {})
            phone = data.get('phone', '').strip()
            message = data.get('message', '').strip()
            if not phone or not message:
                return jsonify({'error': 'phone and message are required'}), 400
            task_queue.enqueue(
                'services.whatsapp.send_admin_alert',
                phone_number=phone,
                alert_message=message,
            )
            return jsonify({'message': 'Alert queued'})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/meetings', methods=['GET'])
    @login_required
    def list_meetings():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            if not user:
                return jsonify({'error': 'User not found'}), 404

            query = {}
            if user.get('role') == 'Family':
                query['family_user_id'] = user_id

            status_filter = request.args.get('status')
            if status_filter:
                query['status'] = status_filter

            meetings = list(mongo.db.meetings.find(query).sort('created_at', -1))
            for meeting in meetings:
                meeting['_id'] = str(meeting['_id'])
                meeting['created_at'] = meeting['created_at'].isoformat() if meeting.get('created_at') else ''
                meeting['confirmed_date'] = meeting['confirmed_date'].isoformat() if meeting.get('confirmed_date') else None
            return jsonify(meetings)
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/meetings', methods=['POST'])
    @role_required(['Family'])
    def request_meeting():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            if not user:
                return jsonify({'error': 'User not found'}), 404

            data = clean_input_data(request.json or {})
            patient_id = data.get('patient_id', '')
            meeting_type = data.get('type', 'physical')
            requested_date = data.get('requested_date', '')
            note = data.get('note', '')

            if not patient_id or not requested_date:
                return jsonify({'error': 'patient_id and requested_date are required'}), 400

            authorized_ids = [str(pid) for pid in user.get('patient_ids', [])]
            if patient_id not in authorized_ids:
                return jsonify({'error': 'Access denied to this patient'}), 403

            try:
                req_dt = datetime.fromisoformat(requested_date.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid date format'}), 400

            patient = mongo.db.patients.find_one({'_id': ObjectId(patient_id)}, {'name': 1})
            meeting = {
                'patient_id': patient_id,
                'patient_name': patient.get('name', '') if patient else '',
                'family_user_id': user_id,
                'family_name': user.get('name', user.get('username', '')),
                'type': meeting_type,
                'requested_date': req_dt,
                'status': 'pending',
                'admin_note': '',
                'confirmed_date': None,
                'note': note,
                'created_at': datetime.now()
            }
            result = mongo.db.meetings.insert_one(meeting)

            admin = mongo.db.users.find_one({
                '$or': [
                    {'is_primary_admin': True},
                    {'username': 'ImranSaab'},
                    {'role': 'Admin'},
                ],
                'deleted_at': {'$exists': False},
            }, {'phone': 1})
            admin_phone = admin.get('phone', '') if admin else ''
            if admin_phone:
                alert_msg = (
                    f"📅 New meeting request from {meeting['family_name']} "
                    f"for {meeting['patient_name']} on "
                    f"{req_dt.strftime('%d %b %Y')} ({meeting_type})."
                )
                task_queue.enqueue(
                    'services.whatsapp.send_admin_alert',
                    phone_number=admin_phone,
                    alert_message=alert_msg,
                )

            return jsonify({'message': 'Meeting requested', 'id': str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/meetings/<id>', methods=['PUT'])
    @role_required(['Admin'])
    def update_meeting(id):
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            data = clean_input_data(request.json or {})
            new_status = data.get('status', 'accepted')
            admin_note = data.get('admin_note', '')
            confirmed_date_str = data.get('confirmed_date', '')

            confirmed_date = None
            if confirmed_date_str:
                try:
                    confirmed_date = datetime.fromisoformat(confirmed_date_str.replace('Z', '+00:00'))
                except ValueError:
                    return jsonify({'error': 'Invalid confirmed_date format'}), 400

            meeting = mongo.db.meetings.find_one({'_id': ObjectId(id)})
            if not meeting:
                return jsonify({'error': 'Meeting not found'}), 404

            update_data = {
                'status': new_status,
                'admin_note': admin_note,
                'confirmed_date': confirmed_date,
                'updated_by': session.get('username', ''),
                'updated_at': datetime.now()
            }
            mongo.db.meetings.update_one({'_id': ObjectId(id)}, {'$set': update_data})

            family_user = mongo.db.users.find_one({'_id': ObjectId(meeting['family_user_id'])}, {'phone': 1, 'name': 1})
            family_phone = family_user.get('phone', '') if family_user else ''
            if family_phone:
                status_text = {
                    'accepted': '✅ Confirmed',
                    'rescheduled': '🔄 Rescheduled',
                    'rejected': '❌ Declined'
                }.get(new_status, new_status)
                date_str = (
                    confirmed_date.strftime('%d %b %Y, %I:%M %p')
                    if confirmed_date
                    else meeting.get('requested_date', '').strftime('%d %b %Y')
                    if meeting.get('requested_date')
                    else ''
                )
                alert = (
                    f"{status_text}: Your meeting request for *{meeting.get('patient_name')}* "
                    f"has been {new_status}.\n"
                )
                if date_str:
                    alert += f"📅 Date: {date_str}\n"
                if admin_note:
                    alert += f"📝 Note: {admin_note}"
                task_queue.enqueue(
                    'services.whatsapp.send_admin_alert',
                    phone_number=family_phone,
                    alert_message=alert,
                )

            return jsonify({'message': f'Meeting {new_status}'})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/meetings/<id>', methods=['DELETE'])
    @login_required
    def cancel_meeting(id):
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            meeting = mongo.db.meetings.find_one({'_id': ObjectId(id)})
            if not meeting:
                return jsonify({'error': 'Meeting not found'}), 404
            if user.get('role') == 'Family' and meeting.get('family_user_id') != user_id:
                return jsonify({'error': 'Access denied'}), 403
            mongo.db.meetings.update_one({'_id': ObjectId(id)}, {'$set': {'deleted_at': datetime.now()}})
            return jsonify({'message': 'Meeting cancelled (soft-deleted)'})
        except Exception as error:
            return jsonify({'error': str(error)}), 500
