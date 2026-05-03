from flask import render_template, request


def register_export_page_routes(app, page_context):
    @app.route("/export")
    def export_page():
        user, response = page_context.ensure_roles(
            page_context.export_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return_url = request.args.get("next") or "/dashboard"
        if not return_url.startswith("/"):
            return_url = "/dashboard"

        return render_template(
            "pages/export.html",
            page_title="Export Data",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="export",
            current_user=user,
            app_context={
                "currentPage": "export",
                "currentUser": user,
                "returnUrl": return_url,
            },
            return_url=return_url,
        )
