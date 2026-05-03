from flask import render_template


def register_monthly_overheads_page_routes(app, page_context):
    @app.route("/monthly-overheads")
    def monthly_overheads_page():
        user, response = page_context.ensure_roles(
            page_context.monthly_overheads_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/monthly_overheads.html",
            page_title="Inventory",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="monthly-overheads",
            current_user=user,
            app_context={
                "currentPage": "monthly-overheads",
                "currentUser": user,
            },
        )
