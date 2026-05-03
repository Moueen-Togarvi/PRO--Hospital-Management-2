from datetime import datetime

from bson.objectid import ObjectId
from flask import jsonify, request, session


def register_overheads_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    login_required,
    role_required,
):
    @app.route('/api/utility_bills', methods=['GET'])
    @role_required(['Admin'])
    def get_utility_bills():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            month = request.args.get('month', type=int)
            year = request.args.get('year', type=int)

            query = {}
            if month and year:
                search_pattern = f"{year}-{month:02d}-"
                query['due_date'] = {'$regex': f'^{search_pattern}'}

            cursor = mongo.db.utility_bills.find(query).sort('due_date', 1)
            bills = []
            for bill in cursor:
                bills.append({
                    'id': str(bill['_id']),
                    'type': bill.get('type', 'Other'),
                    'provider': bill.get('provider', ''),
                    'amount': bill.get('amount', 0),
                    'due_date': bill.get('due_date'),
                    'ref_no': bill.get('ref_no', ''),
                    'status': 'Unpaid'
                })
            return jsonify(bills)
        except Exception as error:
            print(f"Bills Fetch Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/utility_bills', methods=['POST'])
    @role_required(['Admin'])
    def add_utility_bill():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        try:
            bill = {
                'type': data.get('type', 'Other'),
                'provider': data.get('provider', ''),
                'amount': int(data.get('amount', 0)),
                'due_date': data.get('due_date'),
                'ref_no': data.get('ref_no', ''),
                'created_at': datetime.now()
            }
            result = mongo.db.utility_bills.insert_one(bill)
            return jsonify({"message": "Bill added", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/utility_bills/<id>', methods=['DELETE'])
    @role_required(['Admin'])
    def pay_utility_bill(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            bill = mongo.db.utility_bills.find_one({'_id': ObjectId(id)})
            if bill:
                mongo.db.expenses.insert_one({
                    'type': 'outgoing',
                    'amount': bill['amount'],
                    'category': 'Utility Bill',
                    'note': f"Paid bill for {bill.get('type')} (Ref: {bill.get('ref_no')})",
                    'date': datetime.now(),
                    'recorded_by': session.get('username', 'Admin'),
                    'created_at': datetime.now()
                })

            mongo.db.utility_bills.update_one(
                {'_id': ObjectId(id)},
                {'$set': {'deleted_at': datetime.now(), 'status': 'Paid'}}
            )
            return jsonify({"message": "Bill marked as paid and soft-deleted"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/employees', methods=['GET'])
    @role_required(['Admin'])
    def get_employees():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            month = request.args.get('month', type=int)
            year = request.args.get('year', type=int)

            cursor = mongo.db.employees.find({"deleted_at": {"$exists": False}}).sort('name', 1)
            employees = []
            for employee in cursor:
                advance_value = employee.get('advance', '')
                if month and year:
                    adv_year = employee.get('advance_year')
                    adv_month = employee.get('advance_month')
                    if adv_year == year and adv_month == month:
                        advance_value = employee.get('advance', '')
                    else:
                        advance_value = 0

                employees.append({
                    'id': str(employee['_id']),
                    'name': employee.get('name', ''),
                    'designation': employee.get('designation', ''),
                    'pay': employee.get('pay', ''),
                    'advance': advance_value,
                    'duty_timings': employee.get('duty_timings', ''),
                    'date_of_joining': employee.get('date_of_joining', ''),
                    'cnic': employee.get('cnic', ''),
                    'phone': employee.get('phone', '')
                })
            return jsonify(employees)
        except Exception as error:
            print(f"Employee Fetch Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/employees', methods=['POST'])
    @role_required(['Admin'])
    def add_employee():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        try:
            current = datetime.now()
            advance_month = int(data.get('month') or current.month)
            advance_year = int(data.get('year') or current.year)
            employee = {
                'name': data.get('name'),
                'designation': data.get('designation'),
                'pay': data.get('pay', ''),
                'advance': data.get('advance', ''),
                'duty_timings': data.get('duty_timings', ''),
                'date_of_joining': data.get('date_of_joining', ''),
                'cnic': data.get('cnic', ''),
                'phone': data.get('phone', ''),
                'advance_month': advance_month,
                'advance_year': advance_year,
                'created_at': current
            }
            result = mongo.db.employees.insert_one(employee)
            return jsonify({"message": "Employee added", "id": str(result.inserted_id)}), 201
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/employees/<id>', methods=['PUT'])
    @role_required(['Admin'])
    def update_employee(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        month = request.args.get('month', type=int)
        year = request.args.get('year', type=int)
        if '_id' in data:
            del data['_id']
        if month and year and 'advance' in data:
            data['advance_month'] = month
            data['advance_year'] = year

        try:
            mongo.db.employees.update_one({'_id': ObjectId(id)}, {'$set': data})
            return jsonify({"message": "Employee updated"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/employees/<id>', methods=['DELETE'])
    @role_required(['Admin'])
    def delete_employee(id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            mongo.db.employees.update_one({'_id': ObjectId(id)}, {'$set': {'deleted_at': datetime.now()}})
            return jsonify({"message": "Employee soft-deleted"})
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/inventory/stats/<int:month>/<int:year>', methods=['GET'])
    @login_required
    def get_inventory_stats(month, year):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            month_start = datetime(year, month, 1)
            if month == 12:
                month_end = datetime(year + 1, 1, 1)
            else:
                month_end = datetime(year, month + 1, 1)

            def parse_date(raw):
                if not raw:
                    return None
                if isinstance(raw, datetime):
                    return raw.replace(tzinfo=None)
                try:
                    return datetime.fromisoformat(str(raw).replace('Z', '+00:00')).replace(tzinfo=None)
                except Exception:
                    try:
                        return datetime.strptime(str(raw)[:10], '%Y-%m-%d')
                    except Exception:
                        return None

            all_patients = list(mongo.db.patients.find({}, {
                'admissionDate': 1,
                'isDischarged': 1,
                'dischargeDate': 1
            }))

            new_count = 0
            discharged_count = 0
            for patient in all_patients:
                admit = parse_date(patient.get('admissionDate'))
                if admit and month_start <= admit < month_end:
                    new_count += 1
                if patient.get('isDischarged'):
                    discharge = parse_date(patient.get('dischargeDate'))
                    if discharge and month_start <= discharge < month_end:
                        discharged_count += 1

            canteen_result = list(mongo.db.canteen_sales.aggregate([
                {
                    '$match': {
                        'date': {'$gte': month_start, '$lt': month_end},
                        '$or': [
                            {'entry_type': {'$exists': False}},
                            {'entry_type': {'$ne': 'other'}}
                        ]
                    }
                },
                {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
            ]))
            total_canteen = canteen_result[0]['total'] if canteen_result else 0

            return jsonify({
                'new_patients': new_count,
                'discharged': discharged_count,
                'total_canteen_sales': total_canteen
            })
        except Exception as error:
            print(f"Inventory Stats Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/overheads/<int:month>/<int:year>', methods=['GET'])
    @role_required(['Admin'])
    def get_overheads(month, year):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            overheads = list(mongo.db.overheads.find({'month': month, 'year': year}))
            overhead_map = {}
            for entry in overheads:
                date_key = entry.get('date')
                if date_key:
                    overhead_map[date_key] = {
                        '_id': str(entry['_id']),
                        'date': date_key,
                        'kitchen': entry.get('kitchen', 0),
                        'canteen_auto': entry.get('canteen_auto', 0),
                        'others': entry.get('others', 0),
                        'pay_advance': entry.get('pay_advance', 0),
                        'employee_names': entry.get('employee_names', ''),
                        'income': entry.get('income', 0),
                        'total_expense': entry.get('total_expense', 0)
                    }

            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            canteen_aggregation = mongo.db.canteen_sales.aggregate([
                {
                    '$match': {
                        'date': {'$gte': start_date, '$lt': end_date},
                        '$or': [
                            {'entry_type': {'$exists': False}},
                            {'entry_type': {'$ne': 'other'}}
                        ]
                    }
                },
                {
                    '$group': {
                        '_id': {
                            '$dateToString': {
                                'format': '%Y-%m-%d',
                                'date': '$date'
                            }
                        },
                        'total': {'$sum': '$amount'}
                    }
                }
            ])

            canteen_daily = {item['_id']: item['total'] for item in canteen_aggregation}

            if month == 12:
                next_month = datetime(year + 1, 1, 1)
            else:
                next_month = datetime(year, month + 1, 1)
            days_in_month = (next_month - datetime(year, month, 1)).days

            return jsonify({
                'overheads': overhead_map,
                'canteen_daily': canteen_daily,
                'days_in_month': days_in_month
            })
        except Exception as error:
            print(f"Get Overheads Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/overheads/annual/<int:year>', methods=['GET'])
    @role_required(['Admin'])
    def get_overheads_annual(year):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            start_date = datetime(year, 1, 1)
            end_date = datetime(year + 1, 1, 1)

            canteen_daily_aggr = mongo.db.canteen_sales.aggregate([
                {
                    '$match': {
                        'date': {'$gte': start_date, '$lt': end_date},
                        '$or': [
                            {'entry_type': {'$exists': False}},
                            {'entry_type': {'$ne': 'other'}}
                        ]
                    }
                },
                {
                    '$group': {
                        '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$date'}},
                        'total': {'$sum': '$amount'}
                    }
                }
            ])
            canteen_daily_map = {item['_id']: item['total'] for item in canteen_daily_aggr}

            entries = list(mongo.db.overheads.find({'year': year}))
            overhead_map = {entry.get('date'): entry for entry in entries if entry.get('date')}

            total_income = 0.0
            total_expense = 0.0
            total_canteen = 0.0

            all_dates = set(canteen_daily_map.keys()) | set(overhead_map.keys())
            for date_str in all_dates:
                entry = overhead_map.get(date_str, {})
                day_canteen = entry.get('canteen_auto') if entry.get('canteen_auto') is not None else canteen_daily_map.get(date_str, 0)
                day_kitchen = float(entry.get('kitchen', 0))
                day_others = float(entry.get('others', 0))
                day_pay_advance = float(entry.get('pay_advance', 0))
                day_income = float(entry.get('income', 0))
                day_expense = day_kitchen + day_canteen + day_others + day_pay_advance

                total_income += day_income
                total_expense += day_expense
                total_canteen += day_canteen

            return jsonify({
                'year': year,
                'total_income': total_income,
                'total_expense': total_expense,
                'total_canteen': total_canteen,
                'profit': total_income - total_expense
            })
        except Exception as error:
            print(f"Get Annual Overheads Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/overheads/entry', methods=['POST'])
    @role_required(['Admin'])
    def save_overhead_entry():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            data = request.get_json()
            date = data.get('date')
            month = data.get('month')
            year = data.get('year')

            kitchen = float(data.get('kitchen', 0))
            others = float(data.get('others', 0))
            pay_advance = float(data.get('pay_advance', 0))
            income = float(data.get('income', 0))
            employee_names = data.get('employee_names', '')
            canteen_auto = float(data.get('canteen_auto', 0))

            total_expense = kitchen + canteen_auto + others + pay_advance

            entry = {
                'date': date,
                'month': month,
                'year': year,
                'kitchen': kitchen,
                'canteen_auto': canteen_auto,
                'others': others,
                'pay_advance': pay_advance,
                'employee_names': employee_names,
                'income': income,
                'total_expense': total_expense,
                'last_updated': datetime.now()
            }

            mongo.db.overheads.update_one(
                {'date': date, 'month': month, 'year': year},
                {'$set': entry},
                upsert=True
            )
            return jsonify({"message": "Entry saved", "entry": entry})
        except Exception as error:
            print(f"Save Overhead Entry Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/overheads/canteen-sync/<int:month>/<int:year>', methods=['GET'])
    @role_required(['Admin'])
    def sync_overheads_canteen(month, year):
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            canteen_aggregation = mongo.db.canteen_sales.aggregate([
                {
                    '$match': {
                        'date': {'$gte': start_date, '$lt': end_date}
                    }
                },
                {
                    '$group': {
                        '_id': {
                            '$dateToString': {
                                'format': '%Y-%m-%d',
                                'date': '$date'
                            }
                        },
                        'total': {'$sum': '$amount'}
                    }
                }
            ])

            canteen_daily = {item['_id']: item['total'] for item in canteen_aggregation}
            return jsonify({'canteen_daily': canteen_daily})
        except Exception as error:
            print(f"Sync Overheads Canteen Error: {error}")
            return jsonify({"error": str(error)}), 500
