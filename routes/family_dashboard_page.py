from flask import render_template


def register_family_dashboard_page_routes(app, page_context):
    @app.route("/family-dashboard")
    def family_dashboard_page():
        user, response = page_context.ensure_roles(page_context.family_dashboard_page_roles)
        if response is not None:
            return response

        return render_template(
            "pages/family_dashboard.html",
            page_title="Family Portal",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="family-dashboard",
            current_user=user,
            app_context={
                "currentPage": "family-dashboard",
                "currentUser": user,
            },
        )
