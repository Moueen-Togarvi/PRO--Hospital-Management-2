from flask import render_template


def register_report_page_routes(app, page_context):
    @app.route("/reports")
    def reports_page():
        user, response = page_context.ensure_roles(page_context.report_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/reports.html",
            page_title="Shift Reports",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="reports",
            current_user=user,
            app_context={
                "currentPage": "reports",
                "currentUser": user,
            },
        )
