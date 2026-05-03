from flask import render_template


def register_staff_dashboard_page_routes(app, page_context):
    @app.route("/staff-dashboard")
    def staff_dashboard_page():
        user, response = page_context.ensure_roles(page_context.staff_dashboard_page_roles)
        if response is not None:
            return response

        return render_template(
            "pages/staff_dashboard.html",
            page_title="Staff Dashboard",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="staff-dashboard",
            current_user=user,
            app_context={
                "currentPage": "staff-dashboard",
                "currentUser": user,
            },
        )
