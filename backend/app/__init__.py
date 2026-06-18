import os

from flask import Flask, jsonify
from sqlalchemy.exc import OperationalError, DisconnectionError

from .extensions import db, migrate, jwt, socketio, cors, limiter, cache
from .config import config
from .routes.messages import messages_bp
from .routes.health import health_bp
from .services.audit_service import log_audit_event
from .services.socket_service import register_socket_events
from .services.scheduler_service import start_scheduler
from flask_compress import Compress


def create_app(env="development"):
    app = Flask(__name__)
    app.config.from_object(config[env])
    os.makedirs(app.config.get("UPLOAD_FOLDER", "uploads"), exist_ok=True)

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    socketio.init_app(app, cors_allowed_origins="*", async_mode="eventlet")
    limiter.init_app(app)
    Compress(app)
    cache.init_app(app, config={
        "CACHE_TYPE": "SimpleCache",
        "CACHE_DEFAULT_TIMEOUT": 30,
    })

    # ↓ INDISPENSABLE — importe tous les modèles ici
    from .models import (
        User,
        Project,
        Task,
        Comment,
        TaskHistory,
        Sprint,
        Message,
        ChatChannel,
        DirectConversation,
        MessageMention,
        MessageReaction,
        Label,
        TaskDependency,
        ProjectBoardColumn,
        TaskAttachment,
        AuditEvent,
        SyncOperation,
        ChatAttachment,
        AIUsageLog,
        PayrollRun,
        PayrollSlip,
        MobileMoneyTransaction,
        MobileMoneyTransactionStatus,
        Contract,
        ContractStatus,
        Invitation,
        InvitationStatus,
        MemberScore,
    )

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.teams import teams_bp
    from .routes.projects import projects_bp
    from .routes.tasks import tasks_bp
    from .routes.sprints import sprints_bp
    from .routes.notifications import notifications_bp
    from .routes.search import search_bp
    from .routes.labels import labels_bp
    from .routes.board_columns import board_bp
    from .routes.reports import reports_bp
    from .routes.audit import audit_bp
    from .routes.sync import sync_bp
    from .routes.payroll import payroll_bp
    from .routes.mobile_money import mobile_money_bp
    from .routes.contracts import contracts_bp
    from .routes.ai import ai_bp
    from .routes.invitations import invitations_bp
    from .routes.scoring import scoring_bp
    from .routes import task_attachments  # noqa: F401 — enregistre les routes pièces jointes

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(teams_bp, url_prefix="/api/teams")
    app.register_blueprint(projects_bp, url_prefix="/api/projects")
    app.register_blueprint(board_bp, url_prefix="/api/projects")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(sprints_bp, url_prefix="/api/sprints")
    app.register_blueprint(messages_bp, url_prefix="/api/messages")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(search_bp, url_prefix="/api/search")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
    app.register_blueprint(sync_bp, url_prefix="/api/sync")
    app.register_blueprint(payroll_bp, url_prefix="/api/payroll")
    app.register_blueprint(mobile_money_bp, url_prefix="/api/mobile-money")
    app.register_blueprint(contracts_bp, url_prefix="/api/contracts")
    app.register_blueprint(labels_bp, url_prefix="/api")
    app.register_blueprint(health_bp, url_prefix="/api/health")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(invitations_bp, url_prefix="/api/invitations")
    app.register_blueprint(scoring_bp,    url_prefix="/api/scoring")

    register_socket_events(socketio)
    start_scheduler(app)
    app.after_request(log_audit_event)

    # ── Gestionnaire global : connexion DB perdue (coupure réseau / Supabase) ──
    @app.errorhandler(OperationalError)
    def handle_db_operational_error(exc):
        db.session.rollback()
        return jsonify({
            "error": "Base de données temporairement inaccessible. Réessayez dans quelques secondes.",
            "detail": str(exc.orig) if hasattr(exc, "orig") else str(exc),
        }), 503

    @app.errorhandler(DisconnectionError)
    def handle_db_disconnection(exc):
        db.session.rollback()
        return jsonify({
            "error": "Connexion à la base de données interrompue.",
            "detail": str(exc),
        }), 503

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        db.session.remove(),

    return app