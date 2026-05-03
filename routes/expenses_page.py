from flask import render_template


def register_expense_page_routes(app, page_context):
    @app.route("/expenses")
    def expenses_page():
        user, response = page_context.ensure_roles(page_context.expense_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/expenses.html",
            page_title="Expenses Ledger",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="expenses",
            current_user=user,
            app_context={
                "currentPage": "expenses",
                "currentUser": user,
            },
        )
