import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app.extensions import db


@pytest.fixture(scope="session")
def app():
    db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db_path = db_file.name
    db_file.close()

    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["JWT_SECRET_KEY"] = "test-secret"
    os.environ["AI_WEEKLY_SUMMARY_SCHEDULER_ENABLED"] = "false"
    os.environ["PAYROLL_MONTHLY_SCHEDULER_ENABLED"] = "false"

    flask_app = create_app("development")
    flask_app.config["TESTING"] = True

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()

    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture()
def client(app):
    return app.test_client()
