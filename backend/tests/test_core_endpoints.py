from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models import User
from app.models import PayrollRun
from app.models.user import Role
from app.services.scheduler_service import run_monthly_payroll_job


def _auth_header(user_id):
    token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def test_health_endpoint(client):
    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_sync_changes_requires_auth(client):
    response = client.get("/api/sync/changes?project_id=1&since=2026-01-01T00:00:00")
    assert response.status_code == 401


def test_ai_usage_logs_requires_admin(client, app):
    with app.app_context():
        user = User(
            name="Member",
            email="member@test.local",
            password="hash",
            role=Role.member,
        )
        db.session.add(user)
        db.session.commit()
        headers = _auth_header(user.id)

    response = client.get("/api/ai/usage-logs", headers=headers)
    assert response.status_code == 403


def test_mobile_money_transaction_requires_admin_for_creation(client, app):
    with app.app_context():
        admin = User(name="Admin", email="admin.mm@test.local", password="hash", role=Role.admin)
        member = User(name="Member", email="member.mm@test.local", password="hash", role=Role.member)
        db.session.add_all([admin, member])
        db.session.commit()
        admin_headers = _auth_header(admin.id)
        member_headers = _auth_header(member.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj MM"}, headers=admin_headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]

    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"email": "member.mm@test.local", "role": "member"},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    member_attempt = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 25000, "simulated_result": "success"},
        headers=member_headers,
    )
    assert member_attempt.status_code == 403


def test_mobile_money_simulation_supports_forced_success_and_failed(client, app):
    with app.app_context():
        admin = User(name="Admin2", email="admin2.mm@test.local", password="hash", role=Role.admin)
        db.session.add(admin)
        db.session.commit()
        headers = _auth_header(admin.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj MM 2"}, headers=headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]

    success_resp = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 50000, "simulated_result": "success", "phone_number": "+221770000000"},
        headers=headers,
    )
    assert success_resp.status_code == 201
    success_tx = success_resp.get_json()["transaction"]
    assert success_tx["status"] == "success"

    failed_resp = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 10000, "simulated_result": "failed"},
        headers=headers,
    )
    assert failed_resp.status_code == 201
    failed_tx = failed_resp.get_json()["transaction"]
    assert failed_tx["status"] == "failed"
    assert failed_tx["failure_reason"]

    list_resp = client.get(f"/api/mobile-money/projects/{project_id}/transactions", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.get_json()["transactions"]) == 2


def test_contract_workflow_send_sign(client, app):
    with app.app_context():
        admin = User(name="Admin C", email="admin.contract@test.local", password="hash", role=Role.admin)
        member = User(name="Member C", email="member.contract@test.local", password="hash", role=Role.member)
        db.session.add_all([admin, member])
        db.session.commit()
        member_id = member.id
        admin_headers = _auth_header(admin.id)
        member_headers = _auth_header(member.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj Contract"}, headers=admin_headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]
    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"email": "member.contract@test.local", "role": "member"},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    create_resp = client.post(
        f"/api/contracts/projects/{project_id}",
        json={"title": "Contrat freelance", "content": "Livrer 10 tâches", "signee_user_id": member_id},
        headers=admin_headers,
    )
    assert create_resp.status_code == 201
    contract_id = create_resp.get_json()["contract"]["id"]

    send_resp = client.put(f"/api/contracts/{contract_id}/send", headers=admin_headers)
    assert send_resp.status_code == 200
    assert send_resp.get_json()["contract"]["status"] == "sent"

    sign_resp = client.put(f"/api/contracts/{contract_id}/sign", headers=member_headers)
    assert sign_resp.status_code == 200
    assert sign_resp.get_json()["contract"]["status"] == "signed"


def test_contract_creation_requires_admin(client, app):
    with app.app_context():
        admin = User(name="Admin C2", email="admin2.contract@test.local", password="hash", role=Role.admin)
        member = User(name="Member C2", email="member2.contract@test.local", password="hash", role=Role.member)
        db.session.add_all([admin, member])
        db.session.commit()
        admin_headers = _auth_header(admin.id)
        member_headers = _auth_header(member.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj Contract 2"}, headers=admin_headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]
    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"email": "member2.contract@test.local", "role": "member"},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    create_resp = client.post(
        f"/api/contracts/projects/{project_id}",
        json={"title": "Contrat test", "content": "Contenu"},
        headers=member_headers,
    )
    assert create_resp.status_code == 403


def test_mobile_money_validations_amount_currency_phone(client, app):
    with app.app_context():
        admin = User(name="Admin3", email="admin3.mm@test.local", password="hash", role=Role.admin)
        db.session.add(admin)
        db.session.commit()
        headers = _auth_header(admin.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj MM 3"}, headers=headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]

    bad_amount = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 10.123, "simulated_result": "success"},
        headers=headers,
    )
    assert bad_amount.status_code == 400

    bad_currency = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 1000, "currency": "ABC", "simulated_result": "success"},
        headers=headers,
    )
    assert bad_currency.status_code == 400

    bad_phone = client.post(
        f"/api/mobile-money/projects/{project_id}/transactions",
        json={"amount": 1000, "phone_number": "bad-phone", "simulated_result": "success"},
        headers=headers,
    )
    assert bad_phone.status_code == 400


def test_contract_edge_cases_send_and_reject_permissions(client, app):
    with app.app_context():
        admin = User(name="Admin C3", email="admin3.contract@test.local", password="hash", role=Role.admin)
        member1 = User(name="Member C3", email="member3.contract@test.local", password="hash", role=Role.member)
        member2 = User(name="Member C4", email="member4.contract@test.local", password="hash", role=Role.member)
        db.session.add_all([admin, member1, member2])
        db.session.commit()
        admin_headers = _auth_header(admin.id)
        member1_headers = _auth_header(member1.id)
        member2_headers = _auth_header(member2.id)
        member1_id = member1.id

    project_resp = client.post("/api/projects/", json={"name": "Proj Contract 3"}, headers=admin_headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]

    for email in ["member3.contract@test.local", "member4.contract@test.local"]:
        add_member_resp = client.post(
            f"/api/projects/{project_id}/members",
            json={"email": email, "role": "member"},
            headers=admin_headers,
        )
        assert add_member_resp.status_code == 200

    no_signee_resp = client.post(
        f"/api/contracts/projects/{project_id}",
        json={"title": "Contrat sans signee", "content": "Contenu"},
        headers=admin_headers,
    )
    assert no_signee_resp.status_code == 201
    no_signee_id = no_signee_resp.get_json()["contract"]["id"]

    send_no_signee = client.put(f"/api/contracts/{no_signee_id}/send", headers=admin_headers)
    assert send_no_signee.status_code == 400

    with_signee_resp = client.post(
        f"/api/contracts/projects/{project_id}",
        json={"title": "Contrat signé", "content": "Contenu", "signee_user_id": member1_id},
        headers=admin_headers,
    )
    assert with_signee_resp.status_code == 201
    contract_id = with_signee_resp.get_json()["contract"]["id"]

    send_ok = client.put(f"/api/contracts/{contract_id}/send", headers=admin_headers)
    assert send_ok.status_code == 200

    reject_wrong_user = client.put(
        f"/api/contracts/{contract_id}/reject",
        json={"reason": "Je refuse"},
        headers=member2_headers,
    )
    assert reject_wrong_user.status_code == 403

    reject_right_user = client.put(
        f"/api/contracts/{contract_id}/reject",
        json={"reason": "Clause invalide"},
        headers=member1_headers,
    )
    assert reject_right_user.status_code == 200
    assert reject_right_user.get_json()["contract"]["status"] == "rejected"


def test_payroll_security_validation_and_monthly_cron_idempotent(client, app):
    with app.app_context():
        admin = User(name="Admin P", email="admin.payroll@test.local", password="hash", role=Role.admin)
        member = User(name="Member P", email="member.payroll@test.local", password="hash", role=Role.member)
        db.session.add_all([admin, member])
        db.session.commit()
        admin_headers = _auth_header(admin.id)
        member_headers = _auth_header(member.id)

    project_resp = client.post("/api/projects/", json={"name": "Proj Payroll"}, headers=admin_headers)
    assert project_resp.status_code == 201
    project_id = project_resp.get_json()["project"]["id"]
    add_member_resp = client.post(
        f"/api/projects/{project_id}/members",
        json={"email": "member.payroll@test.local", "role": "member"},
        headers=admin_headers,
    )
    assert add_member_resp.status_code == 200

    non_admin_list = client.get(f"/api/payroll/projects/{project_id}/runs", headers=member_headers)
    assert non_admin_list.status_code == 403

    bad_generate = client.post(
        f"/api/payroll/projects/{project_id}/runs/generate",
        json={"base_amount": -1},
        headers=admin_headers,
    )
    assert bad_generate.status_code == 400

    with app.app_context():
        run_monthly_payroll_job()
        first_count = PayrollRun.query.filter_by(project_id=project_id).count()
        run_monthly_payroll_job()
        second_count = PayrollRun.query.filter_by(project_id=project_id).count()
        assert first_count == second_count
