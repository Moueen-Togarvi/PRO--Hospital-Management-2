from flask import redirect, render_template, url_for


def register_hospital_page_routes(app, page_context):
    hospital_sections = {
        "beds": {
            "title": "Beds & Wards",
            "subtitle": "Manage wards, rooms, beds, and occupancy.",
        },
        "admissions": {
            "title": "IPD Admissions",
            "subtitle": "Admit patients, transfer beds, and discharge safely.",
        },
        "clinical": {
            "title": "Clinical Records",
            "subtitle": "Vitals, nursing notes, and medication administration.",
        },
    }

    def render_hospital_section(section="dashboard"):
        user, response = page_context.ensure_roles(
            page_context.hospital_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        section = section if section in hospital_sections else "dashboard"
        meta = hospital_sections[section]
        return render_template(
            "pages/hospital.html",
            page_title=meta["title"],
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="hospital",
            current_user=user,
            hospital_section=section,
            hospital_sections=hospital_sections,
            hospital_title=meta["title"],
            hospital_subtitle=meta["subtitle"],
            app_context={
                "currentPage": "hospital",
                "currentUser": user,
                "hospitalSection": section,
            },
        )

    @app.route("/hospital")
    def hospital_page():
        return redirect(url_for("hospital_beds_page"))

    @app.route("/hospital/beds")
    def hospital_beds_page():
        return render_hospital_section("beds")

    @app.route("/hospital/admissions")
    def hospital_admissions_page():
        return render_hospital_section("admissions")

    @app.route("/hospital/clinical")
    def hospital_clinical_page():
        return render_hospital_section("clinical")
