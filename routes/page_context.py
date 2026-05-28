from flask import redirect, session, url_for


class PageContext:
    def __init__(self, mongo, object_id_cls):
        self.mongo = mongo
        self.object_id_cls = object_id_cls
        self.dashboard_roles = {"Admin", "Doctor", "Psychologist", "Canteen", "Staff"}
        self.hospital_page_roles = {
            "Admin",
            "Reception",
            "Doctor",
            "Nurse",
            "Lab",
            "Radiology",
            "Pharmacy",
            "Accountant",
        }
        self.admission_page_roles = {"Admin"}
        self.patient_page_roles = {"Admin"}
        self.patient_detail_roles = {"Admin", "Doctor", "Psychologist"}
        self.psych_page_roles = {"Admin", "Psychologist"}
        self.prescription_page_roles = {"Admin"}
        self.profile_page_roles = {
            "Admin",
            "Reception",
            "Doctor",
            "Nurse",
            "Lab",
            "Radiology",
            "Pharmacy",
            "Accountant",
            "Psychologist",
            "Canteen",
            "General Staff",
            "Family",
            "Staff",
        }
        self.team_page_roles = {"Admin"}
        self.utility_bills_page_roles = {"Admin"}
        self.user_page_roles = {"Admin"}
        self.account_page_roles = {"Admin"}
        self.attendance_page_roles = {"Admin"}
        self.canteen_page_roles = {"Admin", "Canteen"}
        self.expense_page_roles = {"Admin"}
        self.export_page_roles = {"Admin"}
        self.family_dashboard_page_roles = {"Family"}
        self.manual_discharge_page_roles = {"Admin"}
        self.overheads_page_roles = {"Admin"}
        self.monthly_overheads_page_roles = {"Admin"}
        self.report_page_roles = {"Admin", "Doctor", "Staff", "Psychologist"}
        self.staff_dashboard_page_roles = {"General Staff"}

    def clear_session(self):
        session.pop("user_id", None)
        session.pop("username", None)
        session.pop("role", None)

    def get_session_user(self):
        user_id = session.get("user_id")
        if not user_id:
            return None

        role = session.get("role")
        username = session.get("username")
        if self.mongo is None:
            return {
                "user_id": user_id,
                "username": username or "User",
                "display_name": username or "User",
                "role": role or "Guest",
            }

        try:
            user = self.mongo.db.users.find_one(
                {"_id": self.object_id_cls(user_id), "deleted_at": {"$exists": False}}
            )
        except Exception:
            user = None

        if not user:
            return None

        return {
            "user_id": str(user.get("_id")),
            "username": user.get("username", username or "User"),
            "display_name": user.get("name") or user.get("username") or username or "User",
            "role": user.get("role", role or "Guest"),
        }

    def home_endpoint_for(self, user):
        role = (user or {}).get("role") or session.get("role")
        if role in self.hospital_page_roles:
            return "hospital_page"
        if role in self.dashboard_roles:
            return "dashboard_page"
        if role in self.family_dashboard_page_roles:
            return "family_dashboard_page"
        if role in self.staff_dashboard_page_roles:
            return "staff_dashboard_page"
        if role in self.patient_page_roles:
            return "patients_page"
        self.clear_session()
        return "login_page"

    def ensure_user(self):
        user = self.get_session_user()
        if session.get("user_id") and not user:
            self.clear_session()
            return None, redirect(url_for("login_page"))
        if not user:
            return None, redirect(url_for("login_page"))
        return user, None

    def ensure_roles(self, allowed_roles, fallback_endpoint=None):
        user, response = self.ensure_user()
        if response is not None:
            return None, response
        if user["role"] not in allowed_roles:
            if fallback_endpoint is None:
                fallback_endpoint = self.home_endpoint_for(user)
            return None, redirect(url_for(fallback_endpoint))
        return user, None
