from datetime import datetime, timedelta

from bson.objectid import ObjectId
from flask import jsonify, request, session


def _parse_iso_date(date_str):
    try:
        return datetime.fromisoformat(date_str)
    except Exception:
        return None


def register_clinical_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    login_required,
    role_required,
):
    @app.route('/api/call_meeting_tracker', methods=['GET'])
    @login_required
    def get_call_meeting_data():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            today = datetime.now()
            year = int(request.args.get('year', today.year))
            month = int(request.args.get('month', today.month))

            records_cursor = mongo.db.call_meeting_tracker.find({
                'year': year,
                'month': month
            }).sort('day', 1)

            records = []
            for record in records_cursor:
                record['_id'] = str(record['_id'])
                record['status'] = record.get('status', record.get('type', 'Tick'))
                records.append(record)

            return jsonify(records)
        except Exception as error:
            print(f"Call/Meeting Fetch Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/call_meeting_tracker', methods=['POST'])
    @role_required(['Admin'])
    def add_call_meeting_entry():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        if not all(key in data for key in ['name', 'day', 'month', 'year', 'date_of_admission']):
            return jsonify({"error": "Missing fields"}), 400

        status_value = data.get('status') or data.get('type') or 'Meeting'
        if status_value not in ['Meeting', 'Call']:
            return jsonify({"error": "Type must be Meeting or Call"}), 400

        try:
            entry = {
                'name': data['name'],
                'day': int(data['day']),
                'month': int(data['month']),
                'year': int(data['year']),
                'type': status_value,
                'status': status_value,
                'date_of_admission': data['date_of_admission'],
                'recorded_by': session.get('username', 'Admin'),
                'created_at': datetime.now()
            }

            existing = mongo.db.call_meeting_tracker.find_one({
                'name': data['name'],
                'day': int(data['day']),
                'month': int(data['month']),
                'year': int(data['year'])
            })

            if existing:
                mongo.db.call_meeting_tracker.update_one({'_id': existing['_id']}, {'$set': entry})
                return jsonify({"message": "Entry updated", "id": str(existing['_id'])}), 200

            result = mongo.db.call_meeting_tracker.insert_one(entry)
            return jsonify({"message": "Entry added", "id": str(result.inserted_id)}), 201
        except Exception as error:
            print(f"Call/Meeting Add Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/call_meeting_tracker/<id>', methods=['DELETE'])
    @role_required(['Admin'])
    def delete_call_meeting_entry(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            result = mongo.db.call_meeting_tracker.delete_one({'_id': ObjectId(id)})
            if result.deleted_count > 0:
                return jsonify({"message": "Entry deleted"}), 200
            return jsonify({"error": "Entry not found"}), 404
        except Exception as error:
            print(f"Call/Meeting Delete Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/call_meeting_tracker/summary/<int:month>/<int:year>', methods=['GET'])
    @login_required
    def get_call_meeting_summary(month, year):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            records_cursor = mongo.db.call_meeting_tracker.find({
                'year': year,
                'month': month
            })

            tick_count = 0
            cross_count = 0
            by_person = {}

            for record in records_cursor:
                record_status = (record.get('status') or record.get('type') or 'Meeting')
                record_status = record_status.capitalize()
                is_meeting = record_status == 'Meeting'
                tick_count += 1 if is_meeting else 0
                cross_count += 0 if is_meeting else 1

                person = record.get('name', 'Unknown')
                if person not in by_person:
                    by_person[person] = {'Meeting': 0, 'Call': 0}
                by_person[person]['Meeting'] = by_person[person].get('Meeting', 0) + (1 if is_meeting else 0)
                by_person[person]['Call'] = by_person[person].get('Call', 0) + (0 if is_meeting else 1)

            return jsonify({
                'totalMeetings': tick_count,
                'totalCalls': cross_count,
                'byPerson': by_person
            })
        except Exception as error:
            print(f"Call/Meeting Summary Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/psych-sessions', methods=['GET'])
    @login_required
    def list_psych_sessions():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        role = session.get('role')
        user_id = session.get('user_id')

        start_str = request.args.get('start')
        end_str = request.args.get('end')
        psychologist_id = request.args.get('psychologistId')

        start_date = _parse_iso_date(start_str) if start_str else None
        end_date = _parse_iso_date(end_str) if end_str else None

        if end_date:
            end_date = end_date + timedelta(days=1)

        query = {}
        if start_date and end_date:
            query['date'] = {'$gte': start_date, '$lt': end_date}
        elif start_date:
            query['date'] = {'$gte': start_date}

        if role == 'Psychologist':
            query['psychologist_id'] = user_id
        elif psychologist_id:
            query['psychologist_id'] = psychologist_id

        try:
            sessions_cursor = mongo.db.psych_sessions.find(query).sort('date', 1)
            sessions = list(sessions_cursor)

            patient_ids = set()
            psych_ids = set()
            for session_doc in sessions:
                for patient_id in session_doc.get('patient_ids', []):
                    patient_ids.add(patient_id)
                if session_doc.get('psychologist_id'):
                    psych_ids.add(session_doc.get('psychologist_id'))

            patient_map = {}
            if patient_ids:
                patients = mongo.db.patients.find({"_id": {"$in": [ObjectId(pid) for pid in patient_ids if ObjectId.is_valid(pid)]}})
                for patient in patients:
                    patient_map[str(patient['_id'])] = decrypt_data(patient.get('name', 'Unknown'))

            psych_map = {}
            if psych_ids:
                users = mongo.db.users.find({"_id": {"$in": [ObjectId(pid) for pid in psych_ids if ObjectId.is_valid(pid)]}})
                for user in users:
                    psych_map[str(user['_id'])] = user.get('name', user.get('username', 'Psych'))

            result = []
            for session_doc in sessions:
                result.append({
                    '_id': str(session_doc['_id']),
                    'psychologist_id': session_doc.get('psychologist_id'),
                    'psychologist_name': psych_map.get(session_doc.get('psychologist_id', ''), session_doc.get('psychologist_id', '')),
                    'date': session_doc.get('date').strftime('%Y-%m-%d') if session_doc.get('date') else '',
                    'time_slot': session_doc.get('time_slot', ''),
                    'patient_ids': session_doc.get('patient_ids', []),
                    'patient_names': [patient_map.get(pid, 'Unknown') for pid in session_doc.get('patient_ids', [])],
                    'title': session_doc.get('title', ''),
                    'note': session_doc.get('note', ''),
                    'note_detail': session_doc.get('note_detail'),
                    'note_author': session_doc.get('note_author', ''),
                    'note_at': session_doc.get('note_at').isoformat() if session_doc.get('note_at') else None
                })

            return jsonify(result)
        except Exception as error:
            print(f"Psych sessions fetch error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/psych-sessions', methods=['POST'])
    @role_required(['Admin'])
    def create_psych_session():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        date_str = data.get('date')
        time_slot = data.get('time_slot', '')
        psychologist_id = data.get('psychologist_id')
        patient_ids = data.get('patient_ids', []) or []
        title = data.get('title', '')

        if not (date_str and psychologist_id and patient_ids):
            return jsonify({"error": "Missing fields"}), 400

        date_val = _parse_iso_date(date_str)
        if not date_val:
            return jsonify({"error": "Invalid date"}), 400

        date_val = date_val.replace(hour=0, minute=0, second=0, microsecond=0)

        try:
            doc = {
                'psychologist_id': psychologist_id,
                'date': date_val,
                'time_slot': time_slot,
                'patient_ids': patient_ids,
                'title': title,
                'created_by': session.get('username'),
                'created_at': datetime.now()
            }

            result = mongo.db.psych_sessions.insert_one(doc)
            return jsonify({"message": "Session created", "id": str(result.inserted_id)})
        except Exception as error:
            print(f"Psych session create error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/psych-sessions/<session_id>/note', methods=['POST'])
    @role_required(['Admin', 'Psychologist'])
    def add_psych_session_note(session_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        note_text = data.get('note', '').strip()
        note_issue = data.get('issue', '').strip()
        note_intervention = data.get('intervention', '').strip()
        note_response = data.get('response', '').strip()

        if not (note_issue and note_intervention and note_response):
            if not note_text:
                return jsonify({"error": "Issue, intervention, and response are required"}), 400
        else:
            note_text = f"Issue: {note_issue}\nIntervention: {note_intervention}\nResponse: {note_response}"

        try:
            session_doc = mongo.db.psych_sessions.find_one({'_id': ObjectId(session_id)})
            if not session_doc:
                return jsonify({"error": "Session not found"}), 404

            if session_doc.get('note'):
                return jsonify({"error": "Note already saved"}), 409

            mongo.db.psych_sessions.update_one(
                {'_id': ObjectId(session_id)},
                {'$set': {
                    'note': note_text,
                    'note_detail': {
                        'issue': note_issue,
                        'intervention': note_intervention,
                        'response': note_response
                    } if note_issue and note_intervention and note_response else None,
                    'note_author': session.get('username'),
                    'note_at': datetime.now()
                }}
            )

            return jsonify({"message": "Note saved"})
        except Exception as error:
            print(f"Psych session note error: {error}")
            return jsonify({"error": str(error)}), 500
