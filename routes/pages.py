from flask import redirect, render_template, url_for
from routes.page_context import PageContext


def register_page_routes(app, mongo):
    page_context = PageContext(mongo)

    @app.route("/")
    def root_page():
        user, response = page_context.ensure_user()
        if response is not None:
            return response
        return redirect(url_for(page_context.home_endpoint_for(user)))

    @app.route("/login")
    def login_page():
        user = page_context.get_session_user()
        if user:
            return redirect(url_for(page_context.home_endpoint_for(user)))

        return render_template(
            "pages/login.html",
            page_title="Login",
            body_class="min-h-screen",
            app_shell=False,
            current_page="login",
            app_context={"currentPage": "login", "currentUser": None},
        )

    @app.route("/dashboard")
    def dashboard_page():
        user, response = page_context.ensure_roles(page_context.dashboard_roles)
        if response is not None:
            return response

        return render_template(
            "pages/dashboard.html",
            page_title="System Overview",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="dashboard",
            current_user=user,
            app_context={
                "currentPage": "dashboard",
                "currentUser": user,
            },
        )

    return page_context
