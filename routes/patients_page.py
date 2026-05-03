from flask import render_template


def register_patient_page_routes(app, page_context):
    @app.route("/patients")
    def patients_page():
        user, response = page_context.ensure_roles(page_context.patient_page_roles)
        if response is not None:
            return response

        return render_template(
            "pages/patients.html",
            page_title="Patients Directory",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="patients",
            current_user=user,
            app_context={
                "currentPage": "patients",
                "currentUser": user,
            },
        )

