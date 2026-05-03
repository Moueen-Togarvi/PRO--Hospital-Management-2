from flask import render_template


def register_user_page_routes(app, page_context):
    @app.route("/users")
    def users_page():
        user, response = page_context.ensure_roles(page_context.user_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/users.html",
            page_title="User Management",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="users",
            current_user=user,
            app_context={
                "currentPage": "users",
                "currentUser": user,
            },
        )

