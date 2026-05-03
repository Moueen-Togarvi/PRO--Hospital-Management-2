from flask import render_template


def register_admission_page_routes(app, page_context):
    @app.route("/admission")
    def admission_page():
        user, response = page_context.ensure_roles(
            page_context.admission_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/admission.html",
            page_title="New Patient Admission",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="admission",
            current_user=user,
            app_context={
                "currentPage": "admission",
                "currentUser": user,
            },
        )
