from flask import render_template


def register_profile_page_routes(app, page_context):
    @app.route("/profile")
    def profile_page():
        user, response = page_context.ensure_roles(page_context.profile_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/profile.html",
            page_title="Profile Settings",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="profile",
            current_user=user,
            app_context={
                "currentPage": "profile",
                "currentUser": user,
            },
        )
