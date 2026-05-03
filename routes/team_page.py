from flask import render_template


def register_team_page_routes(app, page_context):
    @app.route("/team")
    def team_page():
        user, response = page_context.ensure_roles(
            page_context.team_page_roles,
            fallback_endpoint="dashboard_page",
        )
        if response is not None:
            return response

        return render_template(
            "pages/team.html",
            page_title="Our Team",
            body_class="min-h-screen bg-slate-50 text-slate-900",
            app_shell=True,
            current_page="team",
            current_user=user,
            app_context={
                "currentPage": "team",
                "currentUser": user,
            },
        )
