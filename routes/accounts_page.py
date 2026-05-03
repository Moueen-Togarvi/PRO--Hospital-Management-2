from flask import render_template


def register_account_page_routes(app, page_context):
    @app.route("/accounts")
    def accounts_page():
        user, response = page_context.ensure_roles(page_context.account_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/accounts.html",
            page_title="Accounts Archive",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="accounts",
            current_user=user,
            app_context={
                "currentPage": "accounts",
                "currentUser": user,
            },
        )
