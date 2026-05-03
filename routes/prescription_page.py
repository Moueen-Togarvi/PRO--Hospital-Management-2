from flask import render_template


def register_prescription_page_routes(app, page_context):
    @app.route("/prescription")
    def prescription_page():
        user, response = page_context.ensure_roles(
            page_context.prescription_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/prescription.html",
            page_title="Generate Prescription",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="prescription",
            current_user=user,
            app_context={
                "currentPage": "prescription",
                "currentUser": user,
            },
        )
