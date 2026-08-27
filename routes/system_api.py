from datetime import datetime
from pathlib import Path

from flask import jsonify, request, send_file, send_from_directory

from services.site_profile import get_site_profile, save_site_profile


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
    @role_required(['Admin'])
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

    @app.route('/api/site-profile', methods=['GET'])
    @role_required(['Admin'])
    def site_profile_detail():
        return jsonify(get_site_profile(mongo))

    @app.route('/api/site-profile', methods=['PUT'])
    @role_required(['Admin'])
    def update_site_profile():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500
        try:
            profile = save_site_profile(mongo, request.json or {}, get_current_user_id())
            return jsonify({'message': 'Profile updated successfully', 'profile': profile})
        except Exception as error:
            return jsonify({'error': str(error)}), 500

    _ALLOWED_LOGO_FORMATS = {'PNG': '.png', 'JPEG': '.jpg', 'GIF': '.gif', 'WEBP': '.webp'}

    @app.route('/api/site-profile/logo', methods=['POST'])
    @role_required(['Admin'])
    def upload_site_logo():
        if not check_db():
            return jsonify({'error': 'Database error'}), 500

        logo_file = request.files.get('logo')
        if not logo_file or not logo_file.filename:
            return jsonify({'error': 'Logo file is required'}), 400

        # Verify the upload is actually a decodable image of an allowed
        # format — a client-supplied mimetype/extension can't be trusted on
        # its own (e.g. a script disguised with a .png name).
        from PIL import Image, UnidentifiedImageError

        try:
            with Image.open(logo_file.stream) as image:
                image.verify()
                image_format = image.format
        except (UnidentifiedImageError, OSError):
            return jsonify({'error': 'Uploaded file is not a valid image'}), 400
        finally:
            logo_file.stream.seek(0)

        if image_format not in _ALLOWED_LOGO_FORMATS:
            return jsonify({'error': 'Only PNG, JPEG, GIF, or WEBP images are allowed'}), 400

        upload_dir = Path(app.root_path) / 'static' / 'uploads'
        upload_dir.mkdir(parents=True, exist_ok=True)

        suffix = _ALLOWED_LOGO_FORMATS[image_format]
        filename = f"site-logo-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{suffix}"
        target = upload_dir / filename
        logo_file.save(target)
        if target.stat().st_size == 0:
            target.unlink(missing_ok=True)
            return jsonify({'error': 'Uploaded logo file is empty'}), 400

        for old_file in upload_dir.glob('site-logo-*'):
            if old_file != target:
                try:
                    old_file.unlink()
                except OSError:
                    pass

        logo_url = f"/static/uploads/{filename}"
        profile = save_site_profile(mongo, {'logo_url': logo_url}, get_current_user_id())
        return jsonify({'message': 'Logo uploaded successfully', 'profile': profile})

    @app.route('/ping', methods=['GET', 'HEAD'])
    def ping():
        return '', 200

    @app.route('/manifest.json')
    def pwa_manifest():
        profile = get_site_profile(mongo)
        response = jsonify({
            "name": profile["name"],
            "short_name": profile["short_name"],
            "description": f"{profile['tagline']} - {profile['system_name']}",
            "start_url": "/",
            "display": "standalone",
            "orientation": "portrait",
            "background_color": "#f8fbfa",
            "theme_color": "#0f766e",
            "lang": "en",
            "scope": "/",
            "icons": [
                {
                    "src": "/static/icons/icon-192.png",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": "/static/icons/icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any maskable"
                }
            ],
            "categories": ["medical", "health", "productivity"],
            "shortcuts": [
                {
                    "name": "Dashboard",
                    "url": "/dashboard",
                    "description": "Open dashboard"
                },
                {
                    "name": "Patients",
                    "url": "/patients",
                    "description": "View patients"
                }
            ],
        })
        response.mimetype = 'application/manifest+json'
        return response

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
