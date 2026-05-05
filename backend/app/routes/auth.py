from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)
from app.extensions import db, limiter
from app.models import User
from app.services.auth_service import hash_password, check_password, generate_otp_secret, verify_otp

auth_bp = Blueprint("auth", __name__)


# ─── REGISTER ────────────────────────────────────────────────────────────────
@auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()

    # Validation des champs requis
    required = ["name", "email", "password"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Le champ '{field}' est requis"}), 400

    # Vérifier si l'email existe déjà
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Cet email est déjà utilisé"}), 409

    user = User(
        name     = data["name"],
        email    = data["email"],
        password = hash_password(data["password"]),
        avatar   = data.get("avatar", None)
    )
    db.session.add(user)
    db.session.commit()

    access_token  = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        "message": "Compte créé avec succès",
        "user":    user.to_dict(),
        "tokens": {
            "access":  access_token,
            "refresh": refresh_token
        }
    }), 201


# ─── LOGIN ────────────────────────────────────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json()

    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email et mot de passe requis"}), 400

    user = User.query.filter_by(email=data["email"]).first()

    if not user or not check_password(data["password"], user.password):
        return jsonify({"error": "Email ou mot de passe incorrect"}), 401

    # Si 2FA activé → demander le code OTP avant de donner le token
    if user.is_2fa:
        return jsonify({
            "message":  "Code 2FA requis",
            "requires_2fa": True,
            "user_id":  user.id
        }), 200

    access_token  = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        "message": "Connexion réussie",
        "user":    user.to_dict(),
        "tokens": {
            "access":  access_token,
            "refresh": refresh_token
        }
    }), 200


# ─── VERIFY 2FA ───────────────────────────────────────────────────────────────
@auth_bp.route("/verify-2fa", methods=["POST"])
@limiter.limit("10 per minute")
def verify_2fa():
    data = request.get_json()

    user_id = data.get("user_id")
    otp     = data.get("otp")

    if not user_id or not otp:
        return jsonify({"error": "user_id et otp sont requis"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    if not verify_otp(user.otp_secret, otp):
        return jsonify({"error": "Code OTP invalide ou expiré"}), 401

    access_token  = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        "message": "Authentification 2FA réussie",
        "user":    user.to_dict(),
        "tokens": {
            "access":  access_token,
            "refresh": refresh_token
        }
    }), 200


# ─── ENABLE 2FA ───────────────────────────────────────────────────────────────
@auth_bp.route("/enable-2fa", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def enable_2fa():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    if user.is_2fa:
        return jsonify({"error": "Le 2FA est déjà activé"}), 400

    secret     = generate_otp_secret()
    user.otp_secret = secret
    user.is_2fa     = True
    db.session.commit()

    return jsonify({
        "message": "2FA activé avec succès",
        "secret":  secret,
        # Ce lien permet de scanner le QR code dans Google Authenticator
        "otp_uri": f"otpauth://totp/Telework:{user.email}?secret={secret}&issuer=Telework"
    }), 200


# ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
@limiter.limit("20 per minute")
def refresh():
    user_id = int(get_jwt_identity())
    access_token = create_access_token(identity=str(user_id))
    return jsonify({"access": access_token}), 200


# ─── ME (profil connecté) ─────────────────────────────────────────────────────
@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    return jsonify(user.to_dict()), 200