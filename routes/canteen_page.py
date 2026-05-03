from flask import render_template


def register_canteen_page_routes(app, page_context):
    @app.route("/canteen")
    def canteen_page():
        user, response = page_context.ensure_roles(page_context.canteen_page_roles, fallback_endpoint="dashboard_page")
        if response is not None:
            return response

        return render_template(
            "pages/canteen.html",
            page_title="Canteen Management",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="canteen",
            current_user=user,
            app_context={
                "currentPage": "canteen",
                "currentUser": user,
            },
        )
