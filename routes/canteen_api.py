from datetime import datetime, timedelta

from db import ObjectId
from flask import jsonify, request, session


def _is_discharged_flag(raw_val):
    if isinstance(raw_val, bool):
        return raw_val
    return str(raw_val).strip().lower() in ('true', '1', 'yes')


def _safe_int(raw_val):
    try:
        cleaned = ''.join(ch for ch in str(raw_val or '0') if ch.isdigit() or ch == '-')
        return int(cleaned) if cleaned not in ('', '-') else 0
    except Exception:
        return 0


def register_canteen_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    decrypt_data,
    role_required,
):
    @app.route('/api/canteen/sales', methods=['POST'])
    @role_required(['Admin', 'Canteen'])
    def record_canteen_sale():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        if not all(key in data for key in ['patient_id', 'amount', 'item']):
            return jsonify({"error": "Missing fields"}), 400

        try:
            data['amount'] = int(data['amount'])

            sale_date = data.get('date')
            if sale_date:
                sale_date = datetime.fromisoformat(sale_date.replace('Z', '+00:00'))
            else:
                sale_date = datetime.now()

            sale = {
                'patient_id': ObjectId(data['patient_id']),
                'item': data['item'],
                'amount': data['amount'],
                'date': sale_date,
                'recorded_by': session.get('username', 'Canteen Staff')
            }
            result = mongo.db.canteen_sales.insert_one(sale)
            return jsonify({"message": "Sale recorded", "id": str(result.inserted_id)}), 201
        except ValueError:
            return jsonify({"error": "Amount must be a number"}), 400
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/sales/breakdown', methods=['GET'])
    @role_required(['Admin', 'Canteen'])
    def get_canteen_breakdown():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        today = datetime.now()
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        days_in_month = (next_month - start_of_month).days

        try:
            patients_cursor = mongo.db.patients.find({}, {
                'name': 1, 'monthlyAllowance': 1, 'isDischarged': 1
            })

            patients_map = {
                str(patient['_id']): {
                    'name': decrypt_data(patient.get('name', '')),
                    'allowance': patient.get('monthlyAllowance', '0'),
                    'sales': 0,
                    'isDischarged': patient.get('isDischarged', False)
                }
                for patient in patients_cursor
                if not _is_discharged_flag(patient.get('isDischarged', False))
            }

            pipeline = [
                {'$match': {'date': {'$gte': start_of_month}}},
                {'$group': {'_id': '$patient_id', 'total_sales': {'$sum': '$amount'}}}
            ]
            sales_breakdown = list(mongo.db.canteen_sales.aggregate(pipeline))

            for sale in sales_breakdown:
                patient_id = str(sale['_id'])
                if patient_id in patients_map:
                    patients_map[patient_id]['sales'] = sale['total_sales']

            breakdown_list = []
            for patient_id, data in patients_map.items():
                try:
                    sales = data['sales']
                    monthly_allowance = int(data['allowance'].replace(',', ''))
                    daily_allowance = monthly_allowance / days_in_month if days_in_month > 0 else 0
                    balance = monthly_allowance - sales
                except ValueError:
                    sales = data['sales']
                    daily_allowance = 0
                    balance = -sales

                breakdown_list.append({
                    'id': patient_id,
                    'name': data['name'],
                    'monthlyAllowance': data['allowance'],
                    'dailyAllowance': round(daily_allowance, 2),
                    'monthlySales': sales,
                    'remainingBalance': balance,
                    'isDischarged': data['isDischarged']
                })

            return jsonify(breakdown_list)
        except Exception as error:
            print(f"Canteen Breakdown Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/daily-sheet', methods=['GET'])
    @role_required(['Admin', 'Canteen'])
    def get_daily_canteen_sheet():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            date_str = request.args.get('date')
            if date_str:
                target_date = datetime.fromisoformat(date_str)
            else:
                target_date = datetime.now()

            start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            patients_cursor = mongo.db.patients.find(
                {'isDischarged': {'$ne': True}},
                {'name': 1, 'monthlyAllowance': 1}
            ).sort('name', 1)

            pipeline = [
                {'$match': {'date': {'$gte': start_of_day, '$lte': end_of_day}}},
                {'$group': {
                    '_id': '$patient_id',
                    'items': {'$push': {'item': '$item', 'amount': '$amount'}},
                    'total': {'$sum': '$amount'}
                }}
            ]
            daily_sales = {str(item['_id']): item for item in mongo.db.canteen_sales.aggregate(pipeline)}

            sheet = []
            for patient in patients_cursor:
                patient_id = str(patient['_id'])
                sales_data = daily_sales.get(patient_id, {'items': [], 'total': 0})

                sheet.append({
                    'id': patient_id,
                    'name': decrypt_data(patient.get('name', '')),
                    'dailyAllowance': patient.get('monthlyAllowance', '0'),
                    'todayItems': sales_data['items'],
                    'todayTotal': sales_data['total']
                })

            return jsonify({
                'date': target_date.strftime('%Y-%m-%d'),
                'patients': sheet
            })
        except Exception as error:
            print(f"Daily Sheet Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/sales/history', methods=['GET'])
    @role_required(['Admin'])
    def get_canteen_sales_history():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            patient_id = request.args.get('patient_id')

            query = {}
            if patient_id:
                query['patient_id'] = ObjectId(patient_id)

            sales_cursor = mongo.db.canteen_sales.find(query).sort('date', -1).limit(100)

            sales_list = []
            for sale in sales_cursor:
                patient = mongo.db.patients.find_one({'_id': sale['patient_id']}, {'name': 1})
                sales_list.append({
                    'id': str(sale['_id']),
                    'patient_id': str(sale['patient_id']),
                    'patient_name': decrypt_data(patient.get('name', '')) if patient else 'Unknown',
                    'item': sale.get('item', ''),
                    'amount': sale.get('amount', 0),
                    'date': sale['date'].isoformat() if sale.get('date') else '',
                    'recorded_by': sale.get('recorded_by', '')
                })

            return jsonify(sales_list)
        except Exception as error:
            print(f"Sales History Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/monthly-table', methods=['GET'])
    @role_required(['Admin', 'Canteen'])
    def get_canteen_monthly_table():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        try:
            month = int(request.args.get('month', datetime.now().month))
            year = int(request.args.get('year', datetime.now().year))

            start_of_month = datetime(year, month, 1, 0, 0, 0)
            if month == 12:
                end_of_month = datetime(year + 1, 1, 1, 0, 0, 0)
            else:
                end_of_month = datetime(year, month + 1, 1, 0, 0, 0)

            days_in_month = (end_of_month - start_of_month).days

            raw_patients = list(mongo.db.patients.find({}, {
                'name': 1,
                'monthlyAllowance': 1,
                'isDischarged': 1,
                'admissionDate': 1
            }))
            patients_list = [patient for patient in raw_patients if not _is_discharged_flag(patient.get('isDischarged', False))]
            patients_list.sort(key=lambda patient: str(patient.get('name', '')).lower())

            balance_overrides = {}
            overrides_cursor = mongo.db.canteen_balance_overrides.find({
                'month': month,
                'year': year
            })
            for override in overrides_cursor:
                balance_overrides[str(override['patient_id'])] = override['old_balance']

            if not patients_list:
                return jsonify({'month': month, 'year': year, 'daysInMonth': days_in_month, 'patients': []})

            patient_ids = [patient['_id'] for patient in patients_list]

            previous_sales_agg = list(mongo.db.canteen_sales.aggregate([
                {'$match': {
                    'patient_id': {'$in': patient_ids},
                    'date': {'$lt': start_of_month},
                    '$or': [
                        {'entry_type': {'$exists': False}},
                        {'entry_type': {'$ne': 'other'}}
                    ]
                }},
                {'$group': {'_id': '$patient_id', 'total': {'$sum': '$amount'}}}
            ]))
            previous_sales_map = {str(item['_id']): item['total'] for item in previous_sales_agg}

            previous_adj_agg = list(mongo.db.canteen_sales.aggregate([
                {'$match': {
                    'patient_id': {'$in': patient_ids},
                    'date': {'$lt': start_of_month},
                    'entry_type': 'other'
                }},
                {'$group': {'_id': '$patient_id', 'total': {'$sum': '$amount'}}}
            ]))
            previous_adj_map = {str(item['_id']): item['total'] for item in previous_adj_agg}

            current_month_sales = list(mongo.db.canteen_sales.find({
                'patient_id': {'$in': patient_ids},
                'date': {'$gte': start_of_month, '$lt': end_of_month},
                '$or': [
                    {'entry_type': {'$exists': False}},
                    {'entry_type': {'$ne': 'other'}}
                ]
            }))

            other_entries = list(mongo.db.canteen_sales.find({
                'patient_id': {'$in': patient_ids},
                'date': {'$gte': start_of_month, '$lt': end_of_month},
                'entry_type': 'other'
            }))
            other_map = {str(item['patient_id']): item['amount'] for item in other_entries}

            all_time_agg = list(mongo.db.canteen_sales.aggregate([
                {'$match': {
                    'patient_id': {'$in': patient_ids},
                    '$or': [
                        {'entry_type': {'$exists': False}},
                        {'entry_type': {'$ne': 'other'}}
                    ]
                }},
                {'$group': {'_id': '$patient_id', 'total': {'$sum': '$amount'}}}
            ]))
            all_time_map = {str(item['_id']): item['total'] for item in all_time_agg}

            patients_data = []
            for patient in patients_list:
                patient_id = patient['_id']
                patient_id_str = str(patient_id)
                patient_name = decrypt_data(patient.get('name', 'Unknown'))
                is_discharged = patient.get('isDischarged', False)

                previous_sales_total = previous_sales_map.get(patient_id_str, 0)
                previous_adjustments = previous_adj_map.get(patient_id_str, 0)
                calculated_balance = previous_sales_total
                old_balance = balance_overrides.get(patient_id_str, calculated_balance)
                has_override = patient_id_str in balance_overrides

                daily_entries = {}
                for sale in current_month_sales:
                    if str(sale['patient_id']) == patient_id_str:
                        day = sale['date'].day
                        amount = sale.get('amount', 0)
                        if day in daily_entries:
                            daily_entries[day] += amount
                        else:
                            daily_entries[day] = amount

                other_amount = other_map.get(patient_id_str, 0)
                month_total = sum(daily_entries.values()) + other_amount
                total_spent = all_time_map.get(patient_id_str, 0)

                patients_data.append({
                    'id': str(patient_id),
                    'name': patient_name,
                    'oldBalance': old_balance,
                    'calculatedBalance': calculated_balance,
                    'hasManualOverride': has_override,
                    'dailyEntries': daily_entries,
                    'other': other_amount,
                    'monthTotal': month_total,
                    'total': total_spent,
                    'isDischarged': is_discharged,
                    'exceedsBalance': month_total > old_balance
                })

            return jsonify({
                'month': month,
                'year': year,
                'daysInMonth': days_in_month,
                'patients': patients_data
            })
        except Exception as error:
            print(f"Monthly Table Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/old-balance', methods=['POST'])
    @role_required(['Admin'])
    def save_canteen_old_balance():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        try:
            patient_id = data.get('patient_id')
            month = int(data.get('month'))
            year = int(data.get('year'))
            old_balance = int(data.get('old_balance', 0))

            if old_balance == 0:
                mongo.db.canteen_balance_overrides.delete_one({
                    'patient_id': ObjectId(patient_id),
                    'month': month,
                    'year': year
                })
                return jsonify({"message": "Old balance override removed"})

            mongo.db.canteen_balance_overrides.update_one(
                {
                    'patient_id': ObjectId(patient_id),
                    'month': month,
                    'year': year
                },
                {
                    '$set': {
                        'old_balance': old_balance,
                        'updated_at': datetime.now(),
                        'updated_by': session.get('username')
                    }
                },
                upsert=True
            )
            return jsonify({"message": "Old balance updated"})
        except Exception as error:
            print(f"Save Old Balance Error: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route('/api/canteen/daily-entry', methods=['POST'])
    @role_required(['Admin', 'Canteen'])
    def save_canteen_daily_entry():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = clean_input_data(request.json)
        if not all(key in data for key in ['patient_id', 'date', 'amount', 'entry_type']):
            return jsonify({"error": "Missing required fields"}), 400

        try:
            patient_id = ObjectId(data['patient_id'])
            entry_date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
            amount = int(data['amount'])
            entry_type = data['entry_type']

            start_of_day = entry_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)

            query = {
                'patient_id': patient_id,
                'date': {'$gte': start_of_day, '$lt': end_of_day}
            }
            if entry_type == 'other':
                query['entry_type'] = 'other'
            else:
                query['$or'] = [{'entry_type': 'daily'}, {'entry_type': {'$exists': False}}]

            existing_entry = mongo.db.canteen_sales.find_one(query)

            user_role = session.get('role')
            username = session.get('username', 'Unknown')

            if existing_entry:
                if user_role == 'Canteen':
                    return jsonify({"error": "Canteen staff cannot edit existing entries"}), 403
                if user_role == 'Admin':
                    if amount == 0:
                        mongo.db.canteen_sales.delete_one({'_id': existing_entry['_id']})
                        return jsonify({"message": "Entry removed as amount was 0", "id": str(existing_entry['_id'])}), 200

                    mongo.db.canteen_sales.update_one(
                        {'_id': existing_entry['_id']},
                        {'$set': {
                            'amount': amount,
                            'edited_by': username,
                            'edited_at': datetime.now()
                        }}
                    )
                    return jsonify({"message": "Entry updated", "id": str(existing_entry['_id'])}), 200
            else:
                new_entry = {
                    'patient_id': patient_id,
                    'date': entry_date,
                    'amount': amount,
                    'entry_type': entry_type,
                    'item': data.get('item', ''),
                    'recorded_by': username,
                    'created_at': datetime.now()
                }
                result = mongo.db.canteen_sales.insert_one(new_entry)
                return jsonify({"message": "Entry recorded", "id": str(result.inserted_id)}), 201

        except ValueError as error:
            return jsonify({"error": f"Invalid data format: {str(error)}"}), 400
        except Exception as error:
            print(f"Daily Entry Error: {error}")
            return jsonify({"error": str(error)}), 500
