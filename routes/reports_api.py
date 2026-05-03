from datetime import datetime

from bson.objectid import ObjectId
from flask import jsonify, request, session


def register_reports_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    login_required,
    role_required,
):
    @app.route('/api/reports', methods=['GET'])
    @role_required(['Admin', 'Staff', 'Doctor'])
    def get_daily_report():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        date_str = request.args.get('date')
        if not date_str:
            return jsonify({"error": "Date required"}), 400

        try:
            reports = list(mongo.db.daily_reports.find({'date': date_str}))
            for report in reports:
                report['_id'] = str(report['_id'])
                report['patient_id'] = str(report['patient_id'])
            return jsonify(reports)
        except Exception as error:
            print(f"Report Fetch Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/reports/update', methods=['POST'])
    @role_required(['Admin', 'Staff', 'Doctor'])
    def update_daily_report():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        try:
            query = {
                'date': data['date'],
                'patient_id': ObjectId(data['patient_id'])
            }
            update = {
                '$set': {
                    f"schedule.{data['time_slot']}": data['status'],
                    'updated_at': datetime.now(),
                    'updated_by': session.get('username', 'System')
                }
            }
            mongo.db.daily_reports.update_one(query, update, upsert=True)
            return jsonify({"message": "Status updated"}), 200
        except Exception as error:
            print(f"Report Update Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/reports/config', methods=['GET'])
    @login_required
    def get_report_config():
        if not check_db():
            return jsonify({})

        config = mongo.db.report_config.find_one({'_id': 'main_config'})
        if config:
            return jsonify(config)
        return jsonify({})

    @app.route('/api/reports/config', methods=['POST'])
    @role_required(['Admin'])
    def save_report_config():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        try:
            mongo.db.report_config.update_one(
                {'_id': 'main_config'},
                {'$set': {
                    'day_columns': data.get('day_columns'),
                    'night_columns': data.get('night_columns')
                }},
                upsert=True
            )
            return jsonify({"message": "Layout saved"}), 200
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/attendance')
    def get_attendance():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        year = int(request.args.get('year'))
        month = int(request.args.get('month'))

        records = mongo.db.attendance.find({
            "year": year,
            "month": month
        })

        result = {}
        for record in records:
            employee_id = str(record["employee_id"])
            result[employee_id] = record.get("days", {})

        return jsonify(result)

    @app.route('/api/attendance', methods=['POST'])
    def save_attendance():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = request.json
        employee_id = data['empId']
        day = str(data['day'])
        year = int(data['year'])
        month = int(data['month'])
        mark = data['mark']

        query = {
            "employee_id": employee_id,
            "year": year,
            "month": month
        }

        if mark == '':
            mongo.db.attendance.update_one(
                query,
                {"$unset": {f"days.{day}": ""}},
                upsert=True
            )
        else:
            mongo.db.attendance.update_one(
                query,
                {"$set": {f"days.{day}": mark}},
                upsert=True
            )

        return jsonify(success=True)

    @app.route('/api/emergency', methods=['GET'])
    @login_required
    def get_emergency_alerts():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            alerts = list(mongo.db.emergency_alerts.find({'status': {'$ne': 'resolved'}}).sort('created_at', -1))
            for alert in alerts:
                alert['_id'] = str(alert['_id'])
                if alert.get('created_at'):
                    alert['date'] = alert['created_at'].strftime('%d %b, %I:%M %p')
                else:
                    alert['date'] = 'Just now'
            return jsonify(alerts)
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/emergency', methods=['POST'])
    @login_required
    def add_emergency_alert():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = clean_input_data(request.json)
            alert = {
                'patient_name': data.get('patient_name', 'Unknown'),
                'note': data.get('note', ''),
                'severity': data.get('severity', 'critical'),
                'added_by': session.get('username', 'Staff'),
                'status': 'active',
                'created_at': datetime.now()
            }
            mongo.db.emergency_alerts.insert_one(alert)
            return jsonify({"message": "Alert added"}), 201
        except Exception as error:
            print(f"Emergency Save Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/emergency/<id>', methods=['DELETE'])
    @login_required
    def delete_emergency_alert(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            mongo.db.emergency_alerts.update_one(
                {'_id': ObjectId(id)},
                {'$set': {
                    'status': 'resolved',
                    'resolved_at': datetime.now(),
                    'resolved_by': session.get('username', 'Staff')
                }}
            )
            return jsonify({"message": "Alert marked as resolved"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500
