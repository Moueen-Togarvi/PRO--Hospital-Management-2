from datetime import date, datetime

from db import ObjectId
from flask import jsonify, request, session
from db import ReturnDocument


HMS_ROLES = [
    "Admin",
    "Reception",
    "Doctor",
    "Nurse",
    "Lab",
    "Radiology",
    "Pharmacy",
    "Accountant",
]


def register_general_hms_api_routes(
    app,
    mongo,
    check_db,
    clean_input_data,
    role_required,
    get_current_user_id,
):
    def now():
        return datetime.utcnow()

    def today_iso():
        return date.today().isoformat()

    def parse_amount(value):
        try:
            return int(float(str(value or "0").replace(",", "")))
        except (TypeError, ValueError):
            return 0

    def serialize_value(value):
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, list):
            return [serialize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: serialize_value(item) for key, item in value.items()}
        return value

    def serialize_doc(doc):
        if not doc:
            return None
        return {key: serialize_value(value) for key, value in dict(doc).items()}

    def next_public_id(prefix):
        counter = mongo.db.hms_counters.find_one_and_update(
            {"_id": prefix},
            {"$inc": {"seq": 1}, "$set": {"updated_at": now()}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return f"{prefix}-{datetime.utcnow().strftime('%y%m')}-{int(counter.get('seq', 1)):04d}"

    def log_audit(action, module, document_id="", payload=None):
        try:
            mongo.db.audit_logs.insert_one({
                "timestamp": now(),
                "user_id": get_current_user_id() or "",
                "username": session.get("username", ""),
                "role": session.get("role", ""),
                "method": request.method,
                "path": request.path,
                "action": action,
                "module": module,
                "document_id": str(document_id or ""),
                "payload": payload or {},
            })
        except Exception as error:
            print(f"HMS audit log failed: {error}")

    def active_query(extra=None):
        query = {"deleted_at": {"$exists": False}}
        if extra:
            query.update(extra)
        return query

    def list_documents(collection_name, filters=None, sort_field="created_at"):
        query = active_query()
        for field in filters or []:
            value = request.args.get(field)
            if value:
                query[field] = value
        docs = list(mongo.db[collection_name].find(query).sort(sort_field, -1).limit(500))
        return jsonify([serialize_doc(doc) for doc in docs])

    def get_payload(defaults=None):
        data = clean_input_data(request.json or {})
        for key, value in (defaults or {}).items():
            data.setdefault(key, value)
        return data

    def create_document(collection_name, prefix, module, defaults=None, transform=None):
        data = get_payload(defaults)
        if transform:
            data = transform(data)
        data.setdefault("public_id", next_public_id(prefix))
        data["created_at"] = now()
        data["updated_at"] = now()
        data["created_by"] = session.get("username", "System")
        result = mongo.db[collection_name].insert_one(data)
        log_audit("create", module, result.inserted_id, data)
        doc = mongo.db[collection_name].find_one({"_id": result.inserted_id})
        return jsonify(serialize_doc(doc)), 201

    def update_document(collection_name, item_id, module, transform=None):
        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid id"}), 400
        data = get_payload()
        data.pop("_id", None)
        if transform:
            data = transform(data)
        data["updated_at"] = now()
        mongo.db[collection_name].update_one(
            {"_id": ObjectId(item_id), "deleted_at": {"$exists": False}},
            {"$set": data},
        )
        log_audit("update", module, item_id, data)
        doc = mongo.db[collection_name].find_one({"_id": ObjectId(item_id)})
        if not doc:
            return jsonify({"error": "Not found"}), 404
        return jsonify(serialize_doc(doc))

    def delete_document(collection_name, item_id, module):
        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid id"}), 400
        mongo.db[collection_name].update_one(
            {"_id": ObjectId(item_id)},
            {"$set": {"deleted_at": now(), "updated_at": now()}},
        )
        log_audit("delete", module, item_id)
        return jsonify({"message": "Deleted"})

    def invoice_totals(lines, discount=0):
        subtotal = sum(parse_amount(line.get("amount")) for line in lines or [])
        discount_amount = parse_amount(discount)
        total = max(subtotal - discount_amount, 0)
        return subtotal, discount_amount, total

    def days_between(start_value, end_value=None):
        try:
            if not start_value:
                return 0
            start = datetime.fromisoformat(str(start_value)[:10]).date()
            end = datetime.fromisoformat(str(end_value or today_iso())[:10]).date()
            return max((end - start).days, 0)
        except Exception:
            return 0

    def adjust_medicine_stock(medicine_id, delta):
        if medicine_id and ObjectId.is_valid(medicine_id):
            mongo.db.pharmacy_items.update_one(
                {"_id": ObjectId(medicine_id)},
                {"$inc": {"stock": int(delta)}, "$set": {"updated_at": now()}},
            )

    def adjust_batch_remaining(batch_id, delta):
        if batch_id and ObjectId.is_valid(batch_id):
            mongo.db.pharmacy_batches.update_one(
                {"_id": ObjectId(batch_id)},
                {"$inc": {"remaining": int(delta)}, "$set": {"updated_at": now()}},
            )

    def adjust_invoice_refund(invoice_id, delta):
        if invoice_id and ObjectId.is_valid(invoice_id) and delta:
            mongo.db.invoices.update_one(
                {"_id": ObjectId(invoice_id)},
                {"$inc": {"refunded_amount": int(delta)}, "$set": {"updated_at": now()}},
            )

    def dispense_stock_error(medicine_id, batch_id, quantity, old_dispense=None):
        quantity = parse_amount(quantity)
        if quantity <= 0:
            return "Quantity must be greater than zero"
        if not medicine_id or not ObjectId.is_valid(medicine_id):
            return "Valid medicine is required"

        medicine = mongo.db.pharmacy_items.find_one({"_id": ObjectId(medicine_id), "deleted_at": {"$exists": False}})
        if not medicine:
            return "Medicine not found"

        available_stock = parse_amount(medicine.get("stock"))
        if old_dispense and str(old_dispense.get("medicine_id") or "") == str(medicine_id):
            available_stock += parse_amount(old_dispense.get("quantity"))
        if available_stock < quantity:
            return f"Insufficient medicine stock. Available: {available_stock}"

        if batch_id:
            if not ObjectId.is_valid(batch_id):
                return "Valid batch is required"
            batch = mongo.db.pharmacy_batches.find_one({"_id": ObjectId(batch_id), "deleted_at": {"$exists": False}})
            if not batch:
                return "Batch not found"
            if batch.get("medicine_id") and str(batch.get("medicine_id")) != str(medicine_id):
                return "Selected batch does not belong to this medicine"
            available_batch = parse_amount(batch.get("remaining"))
            if old_dispense and str(old_dispense.get("batch_id") or "") == str(batch_id):
                available_batch += parse_amount(old_dispense.get("quantity"))
            if available_batch < quantity:
                return f"Insufficient batch stock. Available: {available_batch}"
        return ""

    def billable_candidate(source, collection, doc, amount, description, line_type="charge", meta=None):
        amount = parse_amount(amount)
        if amount <= 0:
            return None
        return {
            "source_key": f"{collection}:{str(doc.get('_id'))}:{line_type}",
            "source": source,
            "source_collection": collection,
            "source_id": str(doc.get("_id")),
            "line_type": line_type,
            "patient_id": doc.get("patient_id", ""),
            "description": description,
            "amount": amount,
            "date": doc.get("date") or doc.get("order_date") or doc.get("admission_date") or doc.get("created_at"),
            "meta": meta or {},
        }

    def get_unbilled_candidates(patient_id):
        query = active_query({"patient_id": patient_id})
        unbilled_query = {**query, "$or": [{"invoice_id": {"$exists": False}}, {"invoice_id": ""}, {"invoice_id": None}]}
        candidates = []

        for doc in mongo.db.opd_visits.find(unbilled_query):
            item = billable_candidate(
                "OPD",
                "opd_visits",
                doc,
                doc.get("billable_amount"),
                doc.get("service_name") or "OPD Consultation",
            )
            if item:
                candidates.append(item)

        for doc in mongo.db.lab_orders.find(unbilled_query):
            item = billable_candidate(
                "Lab",
                "lab_orders",
                doc,
                doc.get("billable_amount"),
                doc.get("test_name") or "Lab Order",
            )
            if item:
                candidates.append(item)

        for doc in mongo.db.radiology_orders.find(unbilled_query):
            item = billable_candidate(
                "Radiology",
                "radiology_orders",
                doc,
                doc.get("billable_amount"),
                doc.get("study_name") or "Radiology Study",
            )
            if item:
                candidates.append(item)

        for doc in mongo.db.pharmacy_dispenses.find(unbilled_query):
            item = billable_candidate(
                "Pharmacy",
                "pharmacy_dispenses",
                doc,
                doc.get("billable_amount"),
                doc.get("medicine_name") or "Pharmacy Dispense",
            )
            if item:
                candidates.append(item)

        for doc in mongo.db.ipd_admissions.find(query):
            if not doc.get("admission_invoice_id"):
                item = billable_candidate(
                    "IPD",
                    "ipd_admissions",
                    doc,
                    doc.get("admission_charge"),
                    "IPD Admission Charge",
                    "admission",
                )
                if item:
                    candidates.append(item)

            room_rate = parse_amount(doc.get("room_rate"))
            room_start = doc.get("room_charged_until") or doc.get("admission_date")
            room_days = days_between(room_start)
            if doc.get("status") == "Admitted" and room_rate > 0 and room_days > 0:
                item = billable_candidate(
                    "IPD",
                    "ipd_admissions",
                    doc,
                    room_rate * room_days,
                    f"Room Charges ({room_days} day{'s' if room_days != 1 else ''})",
                    "room",
                    {"days": room_days, "room_rate": room_rate, "from": room_start, "to": today_iso()},
                )
                if item:
                    candidates.append(item)

        return candidates

    def mark_charge_billed(charge, invoice_id):
        collection = charge.get("source_collection")
        source_id = charge.get("source_id")
        if not collection or not source_id or not ObjectId.is_valid(source_id):
            return

        update = {"billed_at": now(), "updated_at": now()}
        if collection == "ipd_admissions" and charge.get("line_type") == "admission":
            update["admission_invoice_id"] = invoice_id
        elif collection == "ipd_admissions" and charge.get("line_type") == "room":
            update["last_room_invoice_id"] = invoice_id
            update["last_room_billed_at"] = now()
            update["room_charged_until"] = today_iso()
        else:
            update["invoice_id"] = invoice_id

        mongo.db[collection].update_one({"_id": ObjectId(source_id)}, {"$set": update})

    def unmark_invoice_source_refs(invoice):
        invoice_id = str(invoice.get("_id", ""))
        for line in invoice.get("lines") or []:
            collection = line.get("source_collection")
            source_id = line.get("source_id")
            line_type = line.get("line_type")

            if (not collection or not source_id or not line_type) and line.get("source_key"):
                parts = str(line.get("source_key")).split(":")
                if len(parts) >= 3:
                    collection, source_id, line_type = parts[0], parts[1], parts[2]

            if not collection or not source_id or not ObjectId.is_valid(source_id):
                continue

            if collection == "ipd_admissions" and line_type == "admission":
                mongo.db.ipd_admissions.update_one(
                    {"_id": ObjectId(source_id), "admission_invoice_id": invoice_id},
                    {"$unset": {"admission_invoice_id": ""}, "$set": {"updated_at": now()}},
                )
            elif collection == "ipd_admissions" and line_type == "room":
                update = {
                    "$unset": {"last_room_invoice_id": "", "last_room_billed_at": ""},
                    "$set": {"updated_at": now()},
                }
                room_from = (line.get("meta") or {}).get("from")
                if room_from:
                    update["$set"]["room_charged_until"] = room_from
                mongo.db.ipd_admissions.update_one(
                    {"_id": ObjectId(source_id), "last_room_invoice_id": invoice_id},
                    update,
                )
            else:
                mongo.db[collection].update_one(
                    {"_id": ObjectId(source_id), "invoice_id": invoice_id},
                    {"$unset": {"invoice_id": "", "billed_at": ""}, "$set": {"updated_at": now()}},
                )

    @app.route("/api/hms/summary", methods=["GET"])
    @role_required(HMS_ROLES)
    def hms_summary():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        try:
            today = today_iso()
            active_ipd = mongo.db.ipd_admissions.count_documents(active_query({"status": "Admitted"}))
            available_beds = mongo.db.beds.count_documents(active_query({"status": "Available"}))
            occupied_beds = mongo.db.beds.count_documents(active_query({"status": "Occupied"}))
            waiting = mongo.db.appointments.count_documents(active_query({"date": today, "status": "Waiting"}))
            lab_pending = mongo.db.lab_orders.count_documents(active_query({"status": {"$ne": "Completed"}}))
            unpaid = mongo.db.invoices.count_documents(active_query({"status": {"$in": ["Unpaid", "Partial"]}}))
            low_stock = mongo.db.pharmacy_items.count_documents(active_query({"stock": {"$lte": 10}}))
            return jsonify({
                "todayAppointments": mongo.db.appointments.count_documents(active_query({"date": today})),
                "waitingQueue": waiting,
                "activeIpd": active_ipd,
                "availableBeds": available_beds,
                "occupiedBeds": occupied_beds,
                "pendingLab": lab_pending,
                "unpaidInvoices": unpaid,
                "lowStock": low_stock,
            })
        except Exception as error:
            return jsonify({"error": str(error)}), 500

    @app.route("/api/appointments", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def appointments():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("appointments", ["date", "status", "patient_id", "doctor_id"])

        def transform(data):
            data.setdefault("date", today_iso())
            data.setdefault("status", "Waiting")
            data.setdefault("token_number", mongo.db.appointments.count_documents(active_query({"date": data["date"]})) + 1)
            data.setdefault("appointment_no", next_public_id("APT"))
            return data

        return create_document("appointments", "APT", "appointments", transform=transform)

    @app.route("/api/appointments/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def appointment_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("appointments", item_id, "appointments")
        return update_document("appointments", item_id, "appointments")

    @app.route("/api/doctors/schedule", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def doctor_schedule():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("doctor_schedules", ["doctor_id", "weekday"])
        return create_document("doctor_schedules", "SCH", "doctor_schedule")

    @app.route("/api/doctors/schedule/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def doctor_schedule_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("doctor_schedules", item_id, "doctor_schedule")
        return update_document("doctor_schedules", item_id, "doctor_schedule")

    @app.route("/api/queue", methods=["GET"])
    @role_required(HMS_ROLES)
    def queue():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        queue_date = request.args.get("date") or today_iso()
        docs = list(mongo.db.appointments.find(active_query({
            "date": queue_date,
            "status": {"$in": ["Waiting", "In Consultation"]},
        })).sort("token_number", 1))
        return jsonify([serialize_doc(doc) for doc in docs])

    @app.route("/api/opd-visits", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def opd_visits():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("opd_visits", ["patient_id", "appointment_id", "doctor_id", "date"])

        def transform(data):
            data.setdefault("date", today_iso())
            data.setdefault("visit_no", next_public_id("OPD"))
            data["billable_amount"] = parse_amount(data.get("billable_amount"))
            data.setdefault("service_name", "OPD Consultation")
            appointment_id = data.get("appointment_id")
            if appointment_id and ObjectId.is_valid(appointment_id):
                mongo.db.appointments.update_one(
                    {"_id": ObjectId(appointment_id)},
                    {"$set": {"status": "Completed", "updated_at": now()}},
                )
            return data

        return create_document("opd_visits", "OPD", "opd_visit", transform=transform)

    @app.route("/api/opd-visits/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def opd_visit_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("opd_visits", item_id, "opd_visit")
        return update_document("opd_visits", item_id, "opd_visit")

    @app.route("/api/wards", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def wards():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("wards", ["type"])
        return create_document("wards", "WRD", "wards")

    @app.route("/api/wards/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def ward_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("wards", item_id, "wards")
        return update_document("wards", item_id, "wards")

    @app.route("/api/rooms", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def rooms():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("rooms", ["ward_id", "type"])
        return create_document("rooms", "ROM", "rooms")

    @app.route("/api/rooms/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def room_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("rooms", item_id, "rooms")
        return update_document("rooms", item_id, "rooms")

    @app.route("/api/beds", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def beds():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("beds", ["ward_id", "room_id", "status"])
        return create_document("beds", "BED", "beds", defaults={"status": "Available"})

    @app.route("/api/beds/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def bed_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("beds", item_id, "beds")
        return update_document("beds", item_id, "beds")

    @app.route("/api/ipd-admissions", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def ipd_admissions():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("ipd_admissions", ["patient_id", "status", "bed_id"])

        def transform(data):
            data.setdefault("status", "Admitted")
            data.setdefault("admission_date", today_iso())
            data.setdefault("ipd_no", next_public_id("IPD"))
            data["room_rate"] = parse_amount(data.get("room_rate"))
            data["admission_charge"] = parse_amount(data.get("admission_charge"))
            data.setdefault("room_charged_until", data.get("admission_date"))
            bed_id = data.get("bed_id")
            if bed_id and ObjectId.is_valid(bed_id):
                mongo.db.beds.update_one(
                    {"_id": ObjectId(bed_id)},
                    {"$set": {"status": "Occupied", "patient_id": data.get("patient_id"), "updated_at": now()}},
                )
            return data

        return create_document("ipd_admissions", "IPD", "ipd_admission", transform=transform)

    @app.route("/api/ipd-admissions/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def ipd_admission_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            admission = mongo.db.ipd_admissions.find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else None
            if admission and admission.get("bed_id") and ObjectId.is_valid(admission.get("bed_id")):
                mongo.db.beds.update_one({"_id": ObjectId(admission["bed_id"])}, {"$set": {"status": "Available", "patient_id": ""}})
            return delete_document("ipd_admissions", item_id, "ipd_admission")

        def transform(data):
            if data.get("status") == "Discharged":
                data.setdefault("discharge_date", today_iso())
                current = mongo.db.ipd_admissions.find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else None
                bed_id = data.get("bed_id") or (current or {}).get("bed_id")
                if bed_id and ObjectId.is_valid(bed_id):
                    mongo.db.beds.update_one({"_id": ObjectId(bed_id)}, {"$set": {"status": "Available", "patient_id": ""}})
            for amount_key in ["room_rate", "admission_charge"]:
                if amount_key in data:
                    data[amount_key] = parse_amount(data.get(amount_key))
            return data

        return update_document("ipd_admissions", item_id, "ipd_admission", transform=transform)

    @app.route("/api/bed-transfers", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def bed_transfers():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("bed_transfers", ["patient_id", "admission_id"])

        def transform(data):
            data.setdefault("transfer_date", today_iso())
            admission_id = data.get("admission_id")
            from_bed_id = data.get("from_bed_id")
            to_bed_id = data.get("to_bed_id")
            if from_bed_id and ObjectId.is_valid(from_bed_id):
                mongo.db.beds.update_one({"_id": ObjectId(from_bed_id)}, {"$set": {"status": "Available", "patient_id": ""}})
            if to_bed_id and ObjectId.is_valid(to_bed_id):
                mongo.db.beds.update_one({"_id": ObjectId(to_bed_id)}, {"$set": {"status": "Occupied", "patient_id": data.get("patient_id")}})
            if admission_id and ObjectId.is_valid(admission_id):
                mongo.db.ipd_admissions.update_one({"_id": ObjectId(admission_id)}, {"$set": {"bed_id": to_bed_id, "updated_at": now()}})
            return data

        return create_document("bed_transfers", "TRF", "bed_transfer", transform=transform)

    @app.route("/api/bed-transfers/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def bed_transfer_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("bed_transfers", item_id, "bed_transfer")
        return update_document("bed_transfers", item_id, "bed_transfer")

    def patient_record_endpoint(collection_name, prefix, module, patient_id):
        if request.method == "GET":
            docs = list(mongo.db[collection_name].find(active_query({"patient_id": patient_id})).sort("created_at", -1).limit(200))
            return jsonify([serialize_doc(doc) for doc in docs])

        def transform(data):
            data["patient_id"] = patient_id
            data.setdefault("date", today_iso())
            return data

        return create_document(collection_name, prefix, module, transform=transform)

    @app.route("/api/patients/<patient_id>/vitals", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def patient_vitals(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        return patient_record_endpoint("vitals", "VTL", "vitals", patient_id)

    @app.route("/api/patients/<patient_id>/vitals/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def patient_vital_detail(patient_id, item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("vitals", item_id, "vitals")
        return update_document("vitals", item_id, "vitals", transform=lambda data: {**data, "patient_id": patient_id})

    @app.route("/api/patients/<patient_id>/nursing-notes", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def patient_nursing_notes(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        return patient_record_endpoint("nursing_notes", "NRS", "nursing_notes", patient_id)

    @app.route("/api/patients/<patient_id>/nursing-notes/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def patient_nursing_note_detail(patient_id, item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("nursing_notes", item_id, "nursing_notes")
        return update_document("nursing_notes", item_id, "nursing_notes", transform=lambda data: {**data, "patient_id": patient_id})

    @app.route("/api/patients/<patient_id>/medication-administration", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def patient_medication_administration(patient_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        return patient_record_endpoint("medication_administration", "MAR", "medication_administration", patient_id)

    @app.route("/api/patients/<patient_id>/medication-administration/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def patient_medication_administration_detail(patient_id, item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("medication_administration", item_id, "medication_administration")
        return update_document("medication_administration", item_id, "medication_administration", transform=lambda data: {**data, "patient_id": patient_id})

    @app.route("/api/lab/tests", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def lab_tests():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("lab_tests", ["category"])

        def transform(data):
            data["price"] = parse_amount(data.get("price"))
            return data

        return create_document("lab_tests", "LBT", "lab_tests", transform=transform)

    @app.route("/api/lab/tests/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def lab_test_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("lab_tests", item_id, "lab_tests")

        def transform(data):
            if "price" in data:
                data["price"] = parse_amount(data.get("price"))
            return data

        return update_document("lab_tests", item_id, "lab_tests", transform=transform)

    @app.route("/api/lab/orders", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def lab_orders():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("lab_orders", ["patient_id", "status", "source"])

        def transform(data):
            data.setdefault("status", "Ordered")
            data.setdefault("order_date", today_iso())
            test_id = data.get("test_id")
            if test_id and ObjectId.is_valid(test_id):
                test = mongo.db.lab_tests.find_one({"_id": ObjectId(test_id)})
                if test:
                    data.setdefault("test_name", test.get("name", "Lab Test"))
                    data.setdefault("billable_amount", test.get("price", 0))
            data["billable_amount"] = parse_amount(data.get("billable_amount"))
            return data

        return create_document("lab_orders", "LAB", "lab_orders", transform=transform)

    @app.route("/api/lab/orders/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def lab_order_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("lab_orders", item_id, "lab_orders")

        def transform(data):
            if "test_id" in data and data.get("test_id") and ObjectId.is_valid(data.get("test_id")):
                test = mongo.db.lab_tests.find_one({"_id": ObjectId(data.get("test_id"))})
                if test:
                    data.setdefault("test_name", test.get("name", "Lab Test"))
                    data.setdefault("billable_amount", test.get("price", 0))
            if "billable_amount" in data:
                data["billable_amount"] = parse_amount(data.get("billable_amount"))
            return data

        return update_document("lab_orders", item_id, "lab_orders", transform=transform)

    @app.route("/api/radiology/orders", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def radiology_orders():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("radiology_orders", ["patient_id", "status", "modality"])

        def transform(data):
            data.setdefault("status", "Ordered")
            data.setdefault("order_date", today_iso())
            data["billable_amount"] = parse_amount(data.get("billable_amount"))
            return data

        return create_document("radiology_orders", "RAD", "radiology_orders", transform=transform)

    @app.route("/api/radiology/orders/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def radiology_order_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("radiology_orders", item_id, "radiology_orders")

        def transform(data):
            if "billable_amount" in data:
                data["billable_amount"] = parse_amount(data.get("billable_amount"))
            return data

        return update_document("radiology_orders", item_id, "radiology_orders", transform=transform)

    @app.route("/api/radiology/reports", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def radiology_reports():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("radiology_reports", ["patient_id", "order_id"])

        def transform(data):
            order_id = data.get("order_id")
            if order_id and ObjectId.is_valid(order_id):
                mongo.db.radiology_orders.update_one(
                    {"_id": ObjectId(order_id)},
                    {"$set": {"status": "Completed", "report_text": data.get("report_text", ""), "updated_at": now()}},
                )
            return data

        return create_document("radiology_reports", "RPT", "radiology_reports", transform=transform)

    @app.route("/api/radiology/reports/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def radiology_report_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("radiology_reports", item_id, "radiology_reports")

        def transform(data):
            order_id = data.get("order_id")
            if order_id and ObjectId.is_valid(order_id) and "report_text" in data:
                mongo.db.radiology_orders.update_one(
                    {"_id": ObjectId(order_id)},
                    {"$set": {"status": "Completed", "report_text": data.get("report_text", ""), "updated_at": now()}},
                )
            return data

        return update_document("radiology_reports", item_id, "radiology_reports", transform=transform)

    @app.route("/api/pharmacy/medicines", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def pharmacy_medicines():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("pharmacy_items", ["category"])

        def transform(data):
            data["stock"] = parse_amount(data.get("stock"))
            data["purchase_price"] = parse_amount(data.get("purchase_price"))
            data["sale_price"] = parse_amount(data.get("sale_price"))
            return data

        return create_document("pharmacy_items", "MED", "pharmacy_items", defaults={"stock": 0}, transform=transform)

    @app.route("/api/pharmacy/medicines/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def pharmacy_medicine_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("pharmacy_items", item_id, "pharmacy_items")

        def transform(data):
            for key in ["stock", "purchase_price", "sale_price"]:
                if key in data:
                    data[key] = parse_amount(data.get(key))
            return data

        return update_document("pharmacy_items", item_id, "pharmacy_items", transform=transform)

    @app.route("/api/pharmacy/batches", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def pharmacy_batches():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("pharmacy_batches", ["medicine_id"])

        def transform(data):
            qty = parse_amount(data.get("quantity"))
            data["quantity"] = qty
            data["remaining"] = parse_amount(data.get("remaining")) or qty
            medicine_id = data.get("medicine_id")
            if medicine_id and ObjectId.is_valid(medicine_id):
                mongo.db.pharmacy_items.update_one({"_id": ObjectId(medicine_id)}, {"$inc": {"stock": qty}, "$set": {"updated_at": now()}})
                mongo.db.stock_ledger.insert_one({
                    "public_id": next_public_id("STK"),
                    "medicine_id": medicine_id,
                    "batch_id": "",
                    "transaction_type": "Purchase",
                    "quantity": qty,
                    "date": today_iso(),
                    "created_at": now(),
                })
            return data

        return create_document("pharmacy_batches", "BAT", "pharmacy_batches", transform=transform)

    @app.route("/api/pharmacy/batches/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def pharmacy_batch_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            if not ObjectId.is_valid(item_id):
                return jsonify({"error": "Invalid id"}), 400
            batch = mongo.db.pharmacy_batches.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}})
            if batch:
                consumed = max(parse_amount(batch.get("quantity")) - parse_amount(batch.get("remaining")), 0)
                if consumed > 0:
                    return jsonify({"error": "Batch has dispensed medicine and cannot be deleted"}), 400
                adjust_medicine_stock(batch.get("medicine_id"), -parse_amount(batch.get("remaining")))
            return delete_document("pharmacy_batches", item_id, "pharmacy_batches")

        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid id"}), 400
        old_batch = mongo.db.pharmacy_batches.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}}) or {}

        def transform(data):
            old_quantity = parse_amount(old_batch.get("quantity"))
            old_remaining = parse_amount(old_batch.get("remaining"))
            old_consumed = max(old_quantity - old_remaining, 0)
            new_quantity = parse_amount(data.get("quantity", old_quantity))
            new_remaining = max(new_quantity - old_consumed, 0)
            old_medicine_id = old_batch.get("medicine_id")
            new_medicine_id = data.get("medicine_id", old_medicine_id)

            if str(old_medicine_id or "") != str(new_medicine_id or ""):
                adjust_medicine_stock(old_medicine_id, -old_remaining)
                adjust_medicine_stock(new_medicine_id, new_remaining)
            else:
                adjust_medicine_stock(new_medicine_id, new_remaining - old_remaining)

            data["quantity"] = new_quantity
            data["remaining"] = new_remaining
            return data

        return update_document("pharmacy_batches", item_id, "pharmacy_batches", transform=transform)

    @app.route("/api/pharmacy/dispense", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def pharmacy_dispense():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("pharmacy_dispenses", ["patient_id", "medicine_id", "date"])

        data = get_payload({"date": today_iso()})
        quantity = parse_amount(data.get("quantity"))
        medicine_id = data.get("medicine_id")
        batch_id = data.get("batch_id")
        stock_error = dispense_stock_error(medicine_id, batch_id, quantity)
        if stock_error:
            return jsonify({"error": stock_error}), 400
        medicine = mongo.db.pharmacy_items.find_one({"_id": ObjectId(medicine_id)}) if medicine_id and ObjectId.is_valid(medicine_id) else None
        sale_price = parse_amount(data.get("sale_price", (medicine or {}).get("sale_price", 0)))
        data["quantity"] = quantity
        data["sale_price"] = sale_price
        data["medicine_name"] = data.get("medicine_name") or (medicine or {}).get("name", "")
        data["billable_amount"] = parse_amount(data.get("billable_amount")) or sale_price * quantity
        data["public_id"] = next_public_id("DSP")
        data["created_at"] = now()
        data["created_by"] = session.get("username", "System")
        result = mongo.db.pharmacy_dispenses.insert_one(data)
        if medicine_id and ObjectId.is_valid(medicine_id):
            mongo.db.pharmacy_items.update_one({"_id": ObjectId(medicine_id)}, {"$inc": {"stock": -quantity}, "$set": {"updated_at": now()}})
        if batch_id and ObjectId.is_valid(batch_id):
            mongo.db.pharmacy_batches.update_one({"_id": ObjectId(batch_id)}, {"$inc": {"remaining": -quantity}, "$set": {"updated_at": now()}})
        ledger = {
            "public_id": next_public_id("STK"),
            "medicine_id": medicine_id,
            "batch_id": batch_id or "",
            "patient_id": data.get("patient_id", ""),
            "transaction_type": "Dispense",
            "quantity": -quantity,
            "date": data.get("date"),
            "created_at": now(),
        }
        mongo.db.stock_ledger.insert_one(ledger)
        log_audit("create", "pharmacy_dispense", result.inserted_id, data)
        return jsonify({"message": "Dispensed", "id": str(result.inserted_id), "ledger": serialize_doc(ledger)}), 201

    @app.route("/api/pharmacy/dispense/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def pharmacy_dispense_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid id"}), 400

        old_dispense = mongo.db.pharmacy_dispenses.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}})
        if not old_dispense:
            return jsonify({"error": "Dispense not found"}), 404
        if old_dispense.get("invoice_id"):
            return jsonify({"error": "Billed dispense cannot be changed. Use refund/correction billing instead."}), 400

        if request.method == "DELETE":
            old_qty = parse_amount(old_dispense.get("quantity"))
            adjust_medicine_stock(old_dispense.get("medicine_id"), old_qty)
            adjust_batch_remaining(old_dispense.get("batch_id"), old_qty)
            mongo.db.stock_ledger.insert_one({
                "public_id": next_public_id("STK"),
                "medicine_id": old_dispense.get("medicine_id"),
                "batch_id": old_dispense.get("batch_id", ""),
                "patient_id": old_dispense.get("patient_id", ""),
                "transaction_type": "Dispense Reversal",
                "quantity": old_qty,
                "date": today_iso(),
                "created_at": now(),
            })
            return delete_document("pharmacy_dispenses", item_id, "pharmacy_dispense")

        def transform(data):
            old_qty = parse_amount(old_dispense.get("quantity"))
            old_medicine_id = old_dispense.get("medicine_id")
            old_batch_id = old_dispense.get("batch_id")
            new_qty = parse_amount(data.get("quantity", old_qty))
            new_medicine_id = data.get("medicine_id", old_medicine_id)
            new_batch_id = data.get("batch_id", old_batch_id)

            stock_error = dispense_stock_error(new_medicine_id, new_batch_id, new_qty, old_dispense=old_dispense)
            if stock_error:
                raise ValueError(stock_error)

            adjust_medicine_stock(old_medicine_id, old_qty)
            adjust_batch_remaining(old_batch_id, old_qty)
            adjust_medicine_stock(new_medicine_id, -new_qty)
            adjust_batch_remaining(new_batch_id, -new_qty)

            medicine = mongo.db.pharmacy_items.find_one({"_id": ObjectId(new_medicine_id)}) if new_medicine_id and ObjectId.is_valid(new_medicine_id) else None
            sale_price = parse_amount(data.get("sale_price", old_dispense.get("sale_price", (medicine or {}).get("sale_price", 0))))
            data["quantity"] = new_qty
            data["sale_price"] = sale_price
            data["medicine_name"] = data.get("medicine_name") or old_dispense.get("medicine_name") or (medicine or {}).get("name", "")
            data["billable_amount"] = parse_amount(data.get("billable_amount")) or sale_price * new_qty
            return data

        try:
            return update_document("pharmacy_dispenses", item_id, "pharmacy_dispense", transform=transform)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

    @app.route("/api/inventory/stock-ledger", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def stock_ledger():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("stock_ledger", ["medicine_id", "transaction_type", "date"])
        return create_document("stock_ledger", "STK", "stock_ledger", defaults={"date": today_iso(), "transaction_type": "Adjustment"})

    @app.route("/api/services", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def services():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("services", ["category"])

        def transform(data):
            data["price"] = parse_amount(data.get("price"))
            return data

        return create_document("services", "SRV", "services", transform=transform)

    @app.route("/api/services/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def service_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("services", item_id, "services")

        def transform(data):
            if "price" in data:
                data["price"] = parse_amount(data.get("price"))
            return data

        return update_document("services", item_id, "services", transform=transform)

    @app.route("/api/invoices", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def invoices():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("invoices", ["patient_id", "status", "source"])

        def transform(data):
            data.setdefault("invoice_no", next_public_id("INV"))
            data.setdefault("date", today_iso())
            lines = data.get("lines") or []
            subtotal, discount, total = invoice_totals(lines, data.get("discount_amount"))
            data["subtotal"] = subtotal
            data["discount_amount"] = discount
            data["total"] = total
            data["paid_amount"] = parse_amount(data.get("paid_amount"))
            data["refunded_amount"] = parse_amount(data.get("refunded_amount"))
            data["status"] = "Paid" if data["paid_amount"] >= total and total > 0 else "Unpaid"
            data.setdefault("payments", [])
            return data

        return create_document("invoices", "INV", "invoices", transform=transform)

    @app.route("/api/invoices/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def invoice_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            if not ObjectId.is_valid(item_id):
                return jsonify({"error": "Invalid invoice id"}), 400
            invoice = mongo.db.invoices.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}})
            if not invoice:
                return jsonify({"error": "Invoice not found"}), 404
            if parse_amount(invoice.get("paid_amount")) > 0 or invoice.get("payments"):
                return jsonify({"error": "Paid invoices cannot be deleted. Use refunds for corrections."}), 400
            unmark_invoice_source_refs(invoice)
            return delete_document("invoices", item_id, "invoices")

        def transform(data):
            if "lines" in data or "discount_amount" in data:
                current = mongo.db.invoices.find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else {}
                lines = data.get("lines", (current or {}).get("lines", []))
                subtotal, discount, total = invoice_totals(lines, data.get("discount_amount", (current or {}).get("discount_amount", 0)))
                data["subtotal"] = subtotal
                data["discount_amount"] = discount
                data["total"] = total
                paid_amount = parse_amount(data.get("paid_amount", (current or {}).get("paid_amount", 0)))
                data["status"] = "Paid" if paid_amount >= total and total > 0 else "Partial" if paid_amount > 0 else "Unpaid"
            return data

        return update_document("invoices", item_id, "invoices", transform=transform)

    @app.route("/api/invoices/<item_id>/payments", methods=["POST"])
    @role_required(HMS_ROLES)
    def invoice_payment(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid invoice id"}), 400
        invoice = mongo.db.invoices.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}})
        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404
        payment = get_payload({"date": today_iso(), "method": "Cash"})
        payment["amount"] = parse_amount(payment.get("amount"))
        payment["payment_id"] = next_public_id("PAY")
        payment["created_at"] = now()
        paid_amount = parse_amount(invoice.get("paid_amount")) + payment["amount"]
        total = parse_amount(invoice.get("total"))
        status = "Paid" if paid_amount >= total else "Partial"
        mongo.db.invoices.update_one(
            {"_id": ObjectId(item_id)},
            {"$push": {"payments": payment}, "$set": {"paid_amount": paid_amount, "status": status, "updated_at": now()}},
        )
        mongo.db.payment_records.insert_one({
            "invoice_id": item_id,
            "patient_id": invoice.get("patient_id", ""),
            "amount": payment["amount"],
            "method": payment.get("method"),
            "date": payment.get("date"),
            "source": "invoice",
            "created_at": now(),
        })
        log_audit("payment", "invoices", item_id, payment)
        return jsonify({"message": "Payment recorded", "paid_amount": paid_amount, "status": status})

    @app.route("/api/billing/unbilled-charges", methods=["GET"])
    @role_required(HMS_ROLES)
    def unbilled_charges():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        patient_id = request.args.get("patient_id", "")
        if not patient_id:
            return jsonify([])
        return jsonify([serialize_doc(item) for item in get_unbilled_candidates(patient_id)])

    @app.route("/api/invoices/from-charges", methods=["POST"])
    @role_required(HMS_ROLES)
    def invoice_from_charges():
        if not check_db():
            return jsonify({"error": "Database error"}), 500

        data = get_payload({"date": today_iso()})
        patient_id = data.get("patient_id", "")
        selected_keys = set(data.get("charges", []))
        if not patient_id:
            return jsonify({"error": "Patient required"}), 400
        if not selected_keys:
            return jsonify({"error": "Select at least one charge"}), 400

        candidates = [item for item in get_unbilled_candidates(patient_id) if item.get("source_key") in selected_keys]
        if not candidates:
            return jsonify({"error": "No valid unbilled charges found"}), 400

        lines = [{
            "service_id": "",
            "description": item.get("description"),
            "amount": parse_amount(item.get("amount")),
            "source": item.get("source"),
            "source_key": item.get("source_key"),
            "source_collection": item.get("source_collection"),
            "source_id": item.get("source_id"),
            "line_type": item.get("line_type"),
            "meta": item.get("meta", {}),
        } for item in candidates]

        subtotal, discount, total = invoice_totals(lines, data.get("discount_amount"))
        invoice_no = next_public_id("INV")
        invoice = {
            "public_id": invoice_no,
            "invoice_no": invoice_no,
            "patient_id": patient_id,
            "date": data.get("date", today_iso()),
            "source": "Auto Pull",
            "lines": lines,
            "source_refs": [line["source_key"] for line in lines],
            "subtotal": subtotal,
            "discount_amount": discount,
            "total": total,
            "paid_amount": 0,
            "refunded_amount": 0,
            "status": "Unpaid",
            "payments": [],
            "created_at": now(),
            "updated_at": now(),
            "created_by": session.get("username", "System"),
        }
        result = mongo.db.invoices.insert_one(invoice)
        invoice_id = str(result.inserted_id)
        for item in candidates:
            mark_charge_billed(item, invoice_id)
        log_audit("create", "invoices", invoice_id, {"from_charges": invoice["source_refs"], "total": total})
        doc = mongo.db.invoices.find_one({"_id": result.inserted_id})
        return jsonify(serialize_doc(doc)), 201

    @app.route("/api/refunds", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def refunds():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("refunds", ["patient_id", "invoice_id", "status"])

        def transform(data):
            data["amount"] = parse_amount(data.get("amount"))
            data.setdefault("status", "Approved")
            data.setdefault("date", today_iso())
            invoice_id = data.get("invoice_id")
            if invoice_id and ObjectId.is_valid(invoice_id):
                mongo.db.invoices.update_one(
                    {"_id": ObjectId(invoice_id)},
                    {"$inc": {"refunded_amount": data["amount"]}, "$set": {"updated_at": now()}},
                )
            return data

        return create_document("refunds", "REF", "refunds", transform=transform)

    @app.route("/api/refunds/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def refund_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if not ObjectId.is_valid(item_id):
            return jsonify({"error": "Invalid refund id"}), 400
        current_refund = mongo.db.refunds.find_one({"_id": ObjectId(item_id), "deleted_at": {"$exists": False}})
        if not current_refund:
            return jsonify({"error": "Refund not found"}), 404
        if request.method == "DELETE":
            adjust_invoice_refund(current_refund.get("invoice_id"), -parse_amount(current_refund.get("amount")))
            return delete_document("refunds", item_id, "refunds")

        def transform(data):
            old_invoice_id = current_refund.get("invoice_id")
            new_invoice_id = data.get("invoice_id", old_invoice_id)
            old_amount = parse_amount(current_refund.get("amount"))
            new_amount = parse_amount(data.get("amount", old_amount))

            if str(old_invoice_id or "") == str(new_invoice_id or ""):
                adjust_invoice_refund(new_invoice_id, new_amount - old_amount)
            else:
                adjust_invoice_refund(old_invoice_id, -old_amount)
                adjust_invoice_refund(new_invoice_id, new_amount)

            data["amount"] = new_amount
            return data

        return update_document("refunds", item_id, "refunds", transform=transform)

    @app.route("/api/cash-closing", methods=["GET", "POST"])
    @role_required(HMS_ROLES)
    def cash_closing():
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "GET":
            return list_documents("cash_closings", ["date", "closed_by"])

        def transform(data):
            data.setdefault("date", today_iso())
            data.setdefault("closed_by", session.get("username", "Admin"))
            data["cash_total"] = parse_amount(data.get("cash_total"))
            data["card_total"] = parse_amount(data.get("card_total"))
            data["online_total"] = parse_amount(data.get("online_total"))
            data["expense_total"] = parse_amount(data.get("expense_total"))
            data["net_total"] = data["cash_total"] + data["card_total"] + data["online_total"] - data["expense_total"]
            return data

        return create_document("cash_closings", "CLS", "cash_closing", transform=transform)

    @app.route("/api/cash-closing/<item_id>", methods=["PUT", "DELETE"])
    @role_required(HMS_ROLES)
    def cash_closing_detail(item_id):
        if not check_db():
            return jsonify({"error": "Database error"}), 500
        if request.method == "DELETE":
            return delete_document("cash_closings", item_id, "cash_closing")

        def transform(data):
            current = mongo.db.cash_closings.find_one({"_id": ObjectId(item_id)}) if ObjectId.is_valid(item_id) else {}
            for key in ["cash_total", "card_total", "online_total", "expense_total"]:
                if key in data:
                    data[key] = parse_amount(data.get(key))
            cash_total = parse_amount(data.get("cash_total", (current or {}).get("cash_total", 0)))
            card_total = parse_amount(data.get("card_total", (current or {}).get("card_total", 0)))
            online_total = parse_amount(data.get("online_total", (current or {}).get("online_total", 0)))
            expense_total = parse_amount(data.get("expense_total", (current or {}).get("expense_total", 0)))
            if any(key in data for key in ["cash_total", "card_total", "online_total", "expense_total"]):
                data["net_total"] = cash_total + card_total + online_total - expense_total
            return data

        return update_document("cash_closings", item_id, "cash_closing", transform=transform)
