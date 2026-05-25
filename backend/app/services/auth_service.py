import bcrypt
import pyotp

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def check_password(password: str, hashed: str) -> bool:
    if not password or not hashed:
        return False

    try:
        # Preferred path for bcrypt-hashed passwords.
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Legacy fallback: some historical accounts may have non-bcrypt values.
        # This keeps existing users able to log in while backend hashes new passwords properly.
        return password == hashed

def generate_otp_secret() -> str:
    return pyotp.random_base32()

def verify_otp(secret: str, otp: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(otp)