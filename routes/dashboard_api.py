from datetime import datetime, timedelta
import io

import pandas as pd
from flask import jsonify, request, send_file, session
from utils import safe_int_amount


def register_dashboard_api_routes(
    app,
    mongo,
    check_db,
    calculate_prorated_fee,
    decrypt_data,
    login_required,
    role_required,
):
    @app.route('/api/dashboard', methods=['GET'])
    @login_required
    def get_dashboard_metrics():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        today = datetime.now()
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if today.month == 12:
            end_of_month = today.replace(year=today.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            end_of_month = today.replace(month=today.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)

        try:
            total_patients = mongo.db.patients.count_documents({'isDischarged': {'$ne': True}})
            admissions_this_month = mongo.db.patients.count_documents({
                'admissionDate': {'$gte': start_of_month.isoformat(), '$lt': end_of_month.isoformat()}
            })
            discharges_this_month = mongo.db.patients.count_documents({
                'isDischarged': True,
                'dischargeDate': {'$gte': start_of_month.isoformat(), '$lt': end_of_month.isoformat()}
            })

            all_canteen_sales = list(mongo.db.canteen_sales.find())
            canteen_map = {}

            for sale in all_canteen_sales:
                pid = str(sale.get('patient_id', ''))
                amount = int(sale.get('amount', 0))
                if pid:
                    canteen_map[pid] = canteen_map.get(pid, 0) + amount

            active_patients = list(mongo.db.patients.find({'isDischarged': {'$ne': True}}))
            total_expected_balance = 0

            for patient in active_patients:
                try:
                    pid = str(patient['_id'])
                    admission_date = patient.get('admissionDate')
                    days_elapsed = 0
                    if admission_date:
                        try:
                            if isinstance(admission_date, str):
                                admission_dt = datetime.fromisoformat(admission_date.replace('Z', '+00:00'))
                            else:
                                admission_dt = admission_date
                            days_diff = (datetime.now() - admission_dt).days
                            days_elapsed = max(0, days_diff)
                        except Exception:
                            pass

                    fee_str = patient.get('monthlyFee', '0') or '0'
                    fee = calculate_prorated_fee(fee_str, days_elapsed)
                    canteen = canteen_map.get(pid, 0)
                    laundry = patient.get('laundryAmount', 0) if patient.get('laundryStatus', False) else 0
                    received = safe_int_amount(patient.get('receivedAmount'))
                    balance = fee + canteen + laundry - received
                    total_expected_balance += max(0, balance)
                except (ValueError, TypeError) as error:
                    print(f"Dashboard calculation error for patient {patient.get('name')}: {error}")

            pipeline_month = [
                {'$match': {'date': {'$gte': start_of_month, '$lt': end_of_month}}},
                {'$group': {'_id': None, 'total_sales': {'$sum': '$amount'}}}
            ]
            canteen_month_res = list(mongo.db.canteen_sales.aggregate(pipeline_month))
            total_canteen_sales_this_month = canteen_month_res[0]['total_sales'] if canteen_month_res else 0

            pipeline_expenses = [
                {'$match': {
                    'type': 'outgoing',
                    'date': {'$gte': start_of_month, '$lt': end_of_month}
                }},
                {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
            ]
            expenses_res = list(mongo.db.expenses.aggregate(pipeline_expenses))
            total_expenses_this_month = expenses_res[0]['total'] if expenses_res else 0

            today_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start + timedelta(days=1)
            total_psych_sessions_today = mongo.db.psych_sessions.count_documents({
                'date': {'$gte': today_start, '$lt': today_end}
            })
            active_ipd = mongo.db.ipd_admissions.count_documents({
                'deleted_at': {'$exists': False},
                'status': 'Admitted',
            })
            free_beds = mongo.db.beds.count_documents({
                'deleted_at': {'$exists': False},
                'status': 'Available',
            })
            occupied_beds = mongo.db.beds.count_documents({
                'deleted_at': {'$exists': False},
                'status': 'Occupied',
            })

            return jsonify({
                'totalPatients': total_patients,
                'admissionsThisMonth': admissions_this_month,
                'dischargesThisMonth': discharges_this_month,
                'totalExpectedBalance': total_expected_balance,
                'totalCanteenSalesThisMonth': total_canteen_sales_this_month,
                'totalExpensesThisMonth': total_expenses_this_month,
                'totalPsychSessionsToday': total_psych_sessions_today,
                'activeIpd': active_ipd,
                'freeBeds': free_beds,
                'occupiedBeds': occupied_beds,
            })
        except Exception as error:
            print(f"DB Metric Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/debug/dashboard', methods=['GET'])
    @login_required
    def debug_dashboard():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        today = datetime.now()
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        try:
            patients = list(mongo.db.patients.find({'isDischarged': {'$ne': True}}))
            patient_data = []
            for patient in patients:
                try:
                    fee = int(patient.get('monthlyFee', '0').replace(',', ''))
                    patient_data.append({
                        'name': decrypt_data(patient.get('name')),
                        'monthlyFee_raw': patient.get('monthlyFee'),
                        'monthlyFee_parsed': fee
                    })
                except ValueError:
                    patient_data.append({
                        'name': decrypt_data(patient.get('name')),
                        'monthlyFee_raw': patient.get('monthlyFee'),
                        'monthlyFee_parsed': 'ERROR'
                    })

            canteen_pipeline = [
                {'$match': {'date': {'$gte': start_of_month}}},
                {'$group': {'_id': None, 'total': {'$sum': '$amount'}, 'count': {'$sum': 1}}}
            ]
            canteen_data = list(mongo.db.canteen_sales.aggregate(canteen_pipeline))
            all_canteen = list(mongo.db.canteen_sales.find().sort('date', -1).limit(5))
            canteen_sample = [{
                'date': str(canteen.get('date')),
                'amount': canteen.get('amount'),
                'item': canteen.get('item')
            } for canteen in all_canteen]

            return jsonify({
                'currentMonth': f"{today.year}-{today.month:02d}",
                'startOfMonth': str(start_of_month),
                'totalPatients': len(patients),
                'patientsWithFees': patient_data,
                'canteenThisMonth': canteen_data,
                'canteenSample': canteen_sample
            })
        except Exception as error:
            print(f"Debug error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/dashboard/admissions', methods=['GET'])
    @login_required
    def get_month_admissions():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        today = datetime.now()
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        try:
            cursor = mongo.db.patients.find({'created_at': {'$gte': start_of_month}})
            admissions = []
            for patient in cursor:
                admissions.append({
                    'id': str(patient.get('_id')),
                    'name': decrypt_data(patient.get('name', '')),
                    'admissionDate': patient.get('admissionDate', ''),
                    'created_at': patient.get('created_at').isoformat() if patient.get('created_at') else ''
                })
            return jsonify(admissions)
        except Exception as error:
            print(f"Admissions list error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/export', methods=['POST'])
    @role_required(['Admin', 'Doctor', 'Psychologist'])
    def export_patients():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            req_data = request.get_json() or {}
            selected_fields = req_data.get('fields', 'all')
            current_user = session.get('user') or {}
            is_admin = current_user.get('role') == 'Admin'
            print(f"Export request from user: {current_user.get('username')}, is_admin: {is_admin}")

            patients_list = list(mongo.db.patients.find())
            print(f"Found {len(patients_list)} patients")

            if not patients_list:
                return jsonify({"error": "No patients found"}), 404

            export_data = []
            for patient in patients_list:
                row = {
                    'name': decrypt_data(patient.get('name', '')),
                    'fatherName': patient.get('fatherName', ''),
                    'admissionDate': patient.get('admissionDate', ''),
                    'idNo': patient.get('idNo', '') if is_admin else '',
                    'age': patient.get('age', ''),
                    'cnic': decrypt_data(patient.get('cnic', '')) if is_admin else '',
                    'contactNo': decrypt_data(patient.get('contactNo', '')) if is_admin else '',
                    'address': patient.get('address', '') if is_admin else '',
                    'complaint': patient.get('complaint', ''),
                    'guardianName': decrypt_data(patient.get('guardianName', '')) if is_admin else '',
                    'relation': patient.get('relation', '') if is_admin else '',
                    'drugProblem': patient.get('drugProblem', ''),
                    'maritalStatus': patient.get('maritalStatus', ''),
                    'prevAdmissions': patient.get('prevAdmissions', ''),
                    'monthlyFee': patient.get('monthlyFee', '') if is_admin else '',
                    'monthlyAllowance': patient.get('monthlyAllowance', '') if is_admin else '',
                    'created_at': patient.get('created_at', '')
                }
                export_data.append(row)

            print(f"Prepared {len(export_data)} rows for export")
            df = pd.DataFrame(export_data)
            print(f"Created DataFrame with columns: {list(df.columns)}")

            if isinstance(selected_fields, list) and selected_fields:
                valid_fields = [field for field in selected_fields if field in df.columns]
                if valid_fields:
                    df = df[valid_fields]

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Patients')
                worksheet = writer.sheets['Patients']
                worksheet.page_setup.paperSize = 9
                worksheet.page_setup.orientation = 'landscape'
                worksheet.page_setup.fitToWidth = 1
                worksheet.page_setup.fitToHeight = 0
                worksheet.print_options.horizontalCentered = True
                worksheet.page_margins.left = 0.5
                worksheet.page_margins.right = 0.5
                worksheet.page_margins.top = 0.75
                worksheet.page_margins.bottom = 0.75

            output.seek(0)
            print("Excel file created successfully")

            return send_file(
                output,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name='patients_export.xlsx'
            )
        except ImportError as error:
            print(f"ImportError in export: {error}")
            return jsonify({"error": "Missing 'openpyxl' library"}), 500
        except Exception as error:
            print(f"Error in export: {type(error).__name__}: {str(error)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"{type(error).__name__}: {str(error)}"}), 500
