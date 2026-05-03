from flask import render_template


def register_overheads_page_routes(app, page_context):
    @app.route("/overheads")
    def overheads_page():
        user, response = page_context.ensure_roles(
            page_context.overheads_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/overheads.html",
            page_title="Overheads & Finance",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="overheads",
            current_user=user,
            app_context={
                "currentPage": "overheads",
                "currentUser": user,
            },
        )
