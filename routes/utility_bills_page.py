from flask import render_template


def register_utility_bills_page_routes(app, page_context):
    @app.route("/utility-bills")
    def utility_bills_page():
        user, response = page_context.ensure_roles(
            page_context.utility_bills_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/utility_bills.html",
            page_title="Utility Bills",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="utility-bills",
            current_user=user,
            app_context={
                "currentPage": "utility-bills",
                "currentUser": user,
            },
        )
