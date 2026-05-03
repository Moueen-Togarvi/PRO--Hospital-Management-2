from flask import render_template


def register_manual_discharge_page_routes(app, page_context):
    @app.route("/manual-discharge")
    def manual_discharge_page():
        user, response = page_context.ensure_roles(
            page_context.manual_discharge_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/manual_discharge.html",
            page_title="Manual Discharge Receipt",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="manual-discharge",
            current_user=user,
            app_context={
                "currentPage": "manual-discharge",
                "currentUser": user,
            },
        )
