from datetime import datetime

from db import ObjectId
from flask import jsonify, request, session
from utils import patient_financial_summary


def register_family_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    login_required,
    role_required,
    get_current_user_id,
):
    @app.route('/api/daily_reports', methods=['POST'])
    @role_required(['Admin', 'Doctor', 'Psychologist'])
    def create_daily_report():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)
            required_fields = ['patient_id', 'vitals', 'mood', 'diet_status']
            if not all(key in data for key in required_fields):
                return jsonify({"error": "Missing required fields"}), 400

            report = {
                'patient_id': data['patient_id'],
                'date': datetime.now(),
                'vitals': data['vitals'],
                'mood': data['mood'],
                'diet_status': data['diet_status'],
                'notes': data.get('notes', ''),
                'created_by': session.get('username', get_current_user_id())
            }

            result = mongo.db.daily_reports.insert_one(report)
            return jsonify({"message": "Daily report submitted", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/daily_reports/<patient_id>', methods=['GET'])
    @login_required
    def get_daily_reports(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            if user and user.get('role') == 'Family':
                patient_ids = [str(pid) for pid in user.get('patient_ids', [])]
                if str(patient_id) not in patient_ids:
                    return jsonify({"error": "Unauthorized access to patient data"}), 403

            reports_cursor = mongo.db.daily_reports.find({"patient_id": str(patient_id)}).sort("date", -1)
            reports = [{**report, '_id': str(report['_id']), 'date': str(report['date'])} for report in reports_cursor]
            return jsonify(reports), 200
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/family/dashboard', methods=['GET'])
    @role_required(['Family'])
    def family_dashboard():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500

        try:
            user_id = get_current_user_id()
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})

            patient_ids = user.get('patient_ids', [])
            patients = list(mongo.db.patients.find({'_id': {'$in': patient_ids}, 'deleted_at': {'$exists': False}}))

            results = []
            for patient in patients:
                patient_id = str(patient['_id'])
                patient['name'] = decrypt_data(patient.get('name', ''))

                latest_report = mongo.db.daily_reports.find_one(
                    {'patient_id': patient_id},
                    sort=[('date', -1)]
                )
                if latest_report:
                    latest_report['_id'] = str(latest_report['_id'])
                    latest_report['date'] = str(latest_report['date'])

                recent_reports = list(mongo.db.daily_reports.find(
                    {'patient_id': patient_id},
                    sort=[('date', -1)]
                ).limit(7))
                mood_chart = []
                for report in reversed(recent_reports):
                    mood_chart.append({
                        'date': report.get('date').strftime('%m/%d') if report.get('date') else '',
                        'mood': report.get('behavior', 'Neutral')
                    })

                notes = list(mongo.db.patient_records.find(
                    {'patient_id': ObjectId(patient_id), 'type': 'session_note', 'deleted_at': {'$exists': False}},
                    sort=[('date', -1)]
                ).limit(3))
                for note in notes:
                    note['_id'] = str(note['_id'])
                    note['patient_id'] = str(note['patient_id'])

                meetings = list(mongo.db.meetings.find({
                    'patient_id': patient_id,
                    'status': {'$in': ['accepted', 'pending', 'rescheduled']},
                    'deleted_at': {'$exists': False}
                }).sort('requested_date', 1).limit(5))
                for meeting in meetings:
                    meeting['_id'] = str(meeting['_id'])

                financial_summary = {}
                try:
                    canteen_agg = list(mongo.db.canteen_sales.aggregate([
                        {'$match': {'patient_id': ObjectId(patient_id)}},
                        {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
                    ]))
                    canteen_total = canteen_agg[0]['total'] if canteen_agg else 0
                    financial_summary = patient_financial_summary(patient, canteen_total)
                except Exception as error:
                    print(f"Family financial calc error: {error}")

                results.append({
                    'patient': {
                        '_id': patient_id,
                        'name': patient['name'],
                        'admissionDate': patient.get('admissionDate'),
                        'isDischarged': patient.get('isDischarged', False)
                    },
                    'latest_report': latest_report,
                    'mood_chart': mood_chart,
                    'session_notes': notes,
                    'upcoming_meetings': meetings,
                    'financial_summary': financial_summary,
                    'bill_preview_url': f"/api/patients/{patient_id}/bill/preview"
                })

            return jsonify(results)
        except Exception as error:
            print(f"Family Dashboard Error: {error}")
            return jsonify({'error': str(error)}), 500
