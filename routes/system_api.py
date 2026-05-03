from datetime import datetime

from flask import jsonify, request, send_file, send_from_directory


def register_system_api_routes(
    app,
    mongo,
    scheduler,
    check_db,
    get_current_user_id,
    login_required,
    role_required,
):
    @app.after_request
    def log_audit_trail(response):
        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH') and request.path.startswith('/api/'):
            if check_db():
                try:
                    user_id = get_current_user_id()
                    mongo.db.audit_logs.insert_one({
                        'user_id': user_id,
                        'method': request.method,
                        'endpoint': request.endpoint,
                        'path': request.path,
                        'status_code': response.status_code,
                        'ip': request.remote_addr,
                        'timestamp': datetime.utcnow()
                    })
                except Exception:
                    pass
        return response

    @app.route('/health', methods=['GET'])
    def health_check():
        return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()}), 200

    @app.route('/api/db-status', methods=['GET'])
    def db_status():
        status = {
            "connected": check_db(),
            "has_mongo_obj": mongo is not None,
            "uri_configured": bool(app.config.get("MONGO_URI")),
            "timestamp": datetime.now().isoformat()
        }
        if mongo:
            try:
                mongo.cx.admin.command('ping')
                status["ping"] = "pong"
            except Exception as error:
                status["ping_error"] = str(error)
        return jsonify(status)

    @app.route('/ping', methods=['GET', 'HEAD'])
    def ping():
        return '', 200

    @app.route('/manifest.json')
    def pwa_manifest():
        return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

    @app.route('/sw.js')
    def service_worker():
        response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
        response.headers['Service-Worker-Allowed'] = '/'
        response.headers['Cache-Control'] = 'no-cache'
        return response

    @app.route('/api/pdfs/<filename>')
    @login_required
    def serve_pdf(filename):
        from services.pdf_storage import get_local_pdf_path

        path = get_local_pdf_path(filename)
        if not path:
            return jsonify({'error': 'PDF not found'}), 404
        return send_file(path, mimetype='application/pdf', as_attachment=False)

    @app.route('/api/audit-logs', methods=['GET'])
    @role_required(['Admin'])
    def get_audit_logs():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            limit = int(request.args.get('limit', 100))
            user_filter = request.args.get('user_id')
            method_filter = request.args.get('method')
            query = {}
            if user_filter:
                query['user_id'] = user_filter
            if method_filter:
                query['method'] = method_filter.upper()
            logs = list(mongo.db.audit_logs.find(query).sort('timestamp', -1).limit(limit))
            for log in logs:
                log['_id'] = str(log['_id'])
                log['timestamp'] = log['timestamp'].isoformat() if log.get('timestamp') else ''
            return jsonify(logs)
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    @app.route('/api/scheduler/status', methods=['GET'])
    @role_required(['Admin'])
    def scheduler_status():
        if scheduler is None:
            return jsonify({'enabled': False, 'message': 'Scheduler not running'})
        jobs = []
        for job in scheduler.get_jobs():
            jobs.append({
                'id': job.id,
                'name': job.name,
                'next_run': job.next_run_time.isoformat() if job.next_run_time else None
            })
        return jsonify({'enabled': True, 'running': scheduler.running, 'jobs': jobs})
