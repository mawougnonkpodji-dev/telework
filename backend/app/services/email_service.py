"""
Service d'envoi d'emails via SMTP (stdlib — aucune dépendance supplémentaire).

Variables d'environnement requises dans .env :
    MAIL_SERVER    — ex: smtp.gmail.com
    MAIL_PORT      — ex: 587
    MAIL_USERNAME  — votre adresse email
    MAIL_PASSWORD  — mot de passe ou App Password
    MAIL_FROM      — adresse expéditeur (défaut = MAIL_USERNAME)
    FRONTEND_URL   — ex: http://localhost:5173
"""

import logging
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app

logger = logging.getLogger(__name__)

_ROLE_LABELS = {
    "admin":       "Gestionnaire",
    "member":      "Membre",
    "observateur": "Observateur",
}




# ── HTML principal de l'email ──────────────────────────────────────────────────
def _build_html(inviter_name: str, project_name: str, role_label: str,
                invited_email: str, contract_block: str, accept_url: str) -> str:

    import datetime as _dt
    year = _dt.date.today().year
    btn_label = "Consulter et accepter →" if contract_block else "Accepter l'invitation →"

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invitation — Telework</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border-radius:18px;
                    border:1px solid rgba(148,163,184,.12);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0891b2,#22d3ee);padding:28px 36px;">
            <div style="font-size:26px;font-weight:800;color:#0f172a;
                        letter-spacing:-.02em;">TELEWORK</div>
            <div style="font-size:13px;color:rgba(15,23,42,.7);margin-top:4px;">
              Plateforme de gestion de projets
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 28px;">
            <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#f1f5f9;">
              Vous avez été invité !
            </h1>
            <p style="margin:0 0 22px;font-size:14px;color:#94a3b8;line-height:1.6;">
              <strong style="color:#e2e8f0;">{inviter_name}</strong>
              vous invite à rejoindre le projet suivant sur Telework :
            </p>

            <!-- Project card -->
            <div style="background:rgba(8,145,178,.08);
                        border:1px solid rgba(34,211,238,.2);
                        border-radius:12px;padding:18px 22px;margin-bottom:4px;">
              <div style="font-size:11px;font-weight:600;color:#22d3ee;
                          text-transform:uppercase;letter-spacing:.08em;
                          margin-bottom:4px;">Projet</div>
              <div style="font-size:18px;font-weight:700;color:#f1f5f9;">
                {project_name}
              </div>
              <div style="margin-top:8px;display:inline-block;
                          background:rgba(34,211,238,.12);color:#22d3ee;
                          font-size:12px;font-weight:600;
                          padding:3px 12px;border-radius:9999px;">
                Rôle · {role_label}
              </div>
            </div>

            <!-- Contrat -->
            {contract_block}

            <!-- CTA -->
            <div style="text-align:center;margin:32px 0 8px;">
              <a href="{accept_url}"
                 style="display:inline-block;padding:16px 44px;
                        background:linear-gradient(135deg,#22d3ee,#0891b2);
                        color:#0f172a;font-weight:800;font-size:15px;
                        border-radius:12px;text-decoration:none;
                        letter-spacing:.01em;">
                {btn_label}
              </a>
            </div>

            <p style="font-size:12px;color:#475569;text-align:center;margin:16px 0 0;">
              Ce lien est valable <strong>7 jours</strong>.
              Si vous n'attendiez pas cette invitation, ignorez cet email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:rgba(15,23,42,.5);padding:16px 36px;
                     border-top:1px solid rgba(148,163,184,.08);">
            <p style="margin:0;font-size:11px;color:#475569;">
              Invitation envoyée à <strong>{invited_email}</strong> •
              Telework © {year}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Sender ─────────────────────────────────────────────────────────────────────
def send_invitation_email(
    to_email: str,
    inviter_name: str,
    project_name: str,
    role_label: str,
    accept_url: str,
    contract_content: str | None = None,
    contract_title: str | None   = None,
    pdf_bytes: bytes | None      = None,
) -> bool:
    """
    Envoie l'email d'invitation.
    • Si contract_content est fourni, génère un rendu HTML lisible du contrat.
    • Si pdf_bytes est fourni, joint le PDF en pièce jointe.
    Retourne True en cas de succès, False si SMTP non configuré ou erreur.
    """
    smtp_host  = current_app.config.get("MAIL_SERVER",  "")
    smtp_port  = int(current_app.config.get("MAIL_PORT", 587))
    smtp_user  = current_app.config.get("MAIL_USERNAME", "")
    smtp_pass  = current_app.config.get("MAIL_PASSWORD", "")
    from_email = current_app.config.get("MAIL_FROM") or smtp_user

    if not smtp_host or not smtp_user or not smtp_pass:
        logger.warning(
            "SMTP not configured (MAIL_SERVER/MAIL_USERNAME/MAIL_PASSWORD missing). "
            "Invitation email NOT sent to %s.", to_email
        )
        return False

    rl = _ROLE_LABELS.get(role_label, role_label)

    # Corps de l'email : note simple si PDF joint, pas de rendu du contrat
    contract_block = ""
    if pdf_bytes:
        safe_title = contract_title or "Contrat de travail"
        contract_block = f"""
        <div style="margin:20px 0 0;padding:14px 18px;
                    background:rgba(8,145,178,.06);
                    border:1px solid rgba(34,211,238,.2);
                    border-radius:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;flex-shrink:0;">📎</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:#f1f5f9;">
                {safe_title}.pdf
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                Votre contrat de travail est joint à cet email en pièce jointe PDF.
                Consultez-le, puis cliquez sur le bouton ci-dessous pour l'accepter et le signer électroniquement.
              </div>
            </div>
          </div>
        </div>
        """

    # Multipart/mixed pour supporter la pièce jointe
    msg = MIMEMultipart("mixed")
    msg["Subject"] = f"Invitation à rejoindre « {project_name} » — Telework"
    msg["From"]    = f"Telework <{from_email}>"
    msg["To"]      = to_email

    html = _build_html(inviter_name, project_name, rl, to_email, contract_block, accept_url)
    msg.attach(MIMEText(html, "html", "utf-8"))

    # Pièce jointe PDF
    if pdf_bytes:
        safe_title = (contract_title or f"Contrat_{project_name}")[:60].replace("/", "-")
        attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
        attachment.add_header(
            "Content-Disposition", "attachment",
            filename=f"{safe_title}.pdf",
        )
        msg.attach(attachment)

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as srv:
            srv.ehlo()
            srv.starttls(context=ctx)
            srv.login(smtp_user, smtp_pass)
            srv.sendmail(from_email, to_email, msg.as_string())
        logger.info("Invitation email sent to %s (pdf_attached=%s)", to_email, bool(pdf_bytes))
        return True
    except Exception as exc:
        logger.error("Failed to send invitation email to %s: %s", to_email, exc)
        return False
