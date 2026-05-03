from flask import render_template


def register_attendance_page_routes(app, page_context):
    @app.route("/attendance")
    def attendance_page():
        user, response = page_context.ensure_roles(page_context.attendance_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/attendance.html",
            page_title="Staff Attendance",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="attendance",
            current_user=user,
            app_context={
                "currentPage": "attendance",
                "currentUser": user,
            },
        )
