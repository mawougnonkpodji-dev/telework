"""
Génération de contrats de travail en PDF via ReportLab.

Le contrat peut provenir de deux sources :
  • contract_data  – dict structuré (champs métier)
  • contract_text  – texte libre (fallback rétrocompatible)
"""
import io
import json
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)

# ── Palette ───────────────────────────────────────────────────────────────────
DARK       = HexColor("#0f172a")
ACCENT     = HexColor("#0891b2")
ACCENT_LIGHT = HexColor("#e0f7fa")
GREY_DARK  = HexColor("#334155")
GREY_LIGHT = HexColor("#f1f5f9")
WHITE      = colors.white
BLACK      = colors.black

PAGE_W, PAGE_H = A4


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            fontName="Helvetica-Bold",
            fontSize=18,
            textColor=DARK,
            spaceAfter=4,
            leading=22,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            fontName="Helvetica",
            fontSize=11,
            textColor=GREY_DARK,
            spaceAfter=2,
        ),
        "section": ParagraphStyle(
            "section",
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=WHITE,
            backColor=ACCENT,
            spaceAfter=6,
            spaceBefore=14,
            leftIndent=-6,
            rightIndent=-6,
            borderPadding=(4, 6, 4, 6),
        ),
        "body": ParagraphStyle(
            "body",
            fontName="Helvetica",
            fontSize=10,
            textColor=DARK,
            leading=15,
            spaceAfter=4,
        ),
        "body_bold": ParagraphStyle(
            "body_bold",
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=DARK,
            leading=15,
            spaceAfter=2,
        ),
        "small": ParagraphStyle(
            "small",
            fontName="Helvetica",
            fontSize=8,
            textColor=GREY_DARK,
            leading=11,
        ),
        "label": ParagraphStyle(
            "label",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=GREY_DARK,
            spaceAfter=1,
        ),
        "value": ParagraphStyle(
            "value",
            fontName="Helvetica",
            fontSize=10,
            textColor=DARK,
            spaceAfter=6,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName="Helvetica",
            fontSize=8,
            textColor=GREY_DARK,
            alignment=1,  # centered
        ),
        "clause": ParagraphStyle(
            "clause",
            fontName="Helvetica",
            fontSize=10,
            textColor=DARK,
            leading=15,
            spaceAfter=4,
            leftIndent=12,
        ),
    }


def _kv_table(rows_data, styles):
    """Génère un tableau clé-valeur à deux colonnes."""
    table_data = []
    for k, v in rows_data:
        table_data.append([
            Paragraph(k, styles["label"]),
            Paragraph(str(v), styles["value"]),
        ])
    t = Table(table_data, colWidths=[5 * cm, 11.5 * cm])
    t.setStyle(TableStyle([
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), GREY_LIGHT),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("GRID",       (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [GREY_LIGHT, WHITE]),
    ]))
    return t


def _currency_fmt(amount, currency="EUR"):
    try:
        return f"{float(amount):,.2f} {currency}".replace(",", " ")
    except (TypeError, ValueError):
        return f"{amount} {currency}"


def _parse_contract_data(contract_content):
    """
    Tente de désérialiser le contenu JSON structuré (v2).
    Retourne le dict si valide, sinon None.
    """
    if not contract_content:
        return None
    try:
        data = json.loads(contract_content)
        if isinstance(data, dict) and data.get("_v") == 2:
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return None


# ── Point d'entrée principal ──────────────────────────────────────────────────

def generate_contract_pdf(
    *,
    title: str,
    contract_content: str | None = None,   # JSON structuré ou texte libre
    employer_name: str = "—",
    employee_name: str = "—",
    employee_email: str = "—",
    project_name: str = "—",
    signed_at: datetime | None = None,
) -> bytes:
    """
    Génère le PDF et retourne les octets.
    Accepte soit un contract_content JSON structuré (v2), soit du texte libre.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title=title,
        author="Telework Platform",
    )
    s = _styles()
    story = []

    # ── En-tête ──────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("TELEWORK", ParagraphStyle(
            "logo",
            fontName="Helvetica-Bold", fontSize=20,
            textColor=ACCENT,
        )),
        Paragraph(
            f"Projet : <b>{project_name}</b><br/>"
            f"Date   : {(signed_at or datetime.utcnow()).strftime('%d/%m/%Y')}",
            ParagraphStyle("hdr_right", fontName="Helvetica", fontSize=9,
                           textColor=GREY_DARK, alignment=2),
        ),
    ]]
    hdr_t = Table(header_data, colWidths=[9 * cm, 7.5 * cm])
    hdr_t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(hdr_t)
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=14))

    # ── Titre ─────────────────────────────────────────────────────────────────
    story.append(Paragraph(title.upper(), s["title"]))
    story.append(Paragraph("Contrat de collaboration — Telework Platform", s["subtitle"]))
    story.append(Spacer(1, 16))

    # ── Données structurées ou texte libre ────────────────────────────────────
    data = _parse_contract_data(contract_content)

    if data:
        _build_structured_sections(story, s, data,
                                   employer_name=employer_name,
                                   employee_name=employee_name,
                                   employee_email=employee_email)
    else:
        # Fallback : texte libre
        story.append(Paragraph("Termes du contrat", s["section"]))
        story.append(Spacer(1, 6))
        text = contract_content or "Aucun contenu fourni."
        for line in text.split("\n"):
            line = line.strip()
            if line:
                story.append(Paragraph(line, s["body"]))
            else:
                story.append(Spacer(1, 6))

    # ── Bloc signature ────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e2e8f0"), spaceAfter=12))
    story.append(Paragraph("Signatures", s["section"]))
    story.append(Spacer(1, 6))

    sig_date = (signed_at or datetime.utcnow()).strftime("%d/%m/%Y à %H:%M")
    sig_data = [
        [
            Paragraph(f"<b>L'employeur</b><br/>{employer_name}", s["body"]),
            Paragraph(f"<b>Le collaborateur</b><br/>{employee_name}<br/>"
                      f"<font color='#64748b' size='8'>{employee_email}</font>", s["body"]),
        ],
        [
            Paragraph("Signature : ___________________", s["body"]),
            Paragraph(
                (f"✅ <b>Signé électroniquement</b><br/>le {sig_date}"
                 if signed_at else "Signature : ___________________"),
                s["body"],
            ),
        ],
    ]
    sig_t = Table(sig_data, colWidths=[8.25 * cm, 8.25 * cm])
    sig_t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ("BOX",          (0, 0), (0, -1), 1, HexColor("#e2e8f0")),
        ("BOX",          (1, 0), (1, -1), 1, HexColor("#e2e8f0")),
        ("BACKGROUND",   (0, 0), (0, -1), GREY_LIGHT),
        ("BACKGROUND",   (1, 0), (1, -1), HexColor("#f0fdf4") if signed_at else GREY_LIGHT),
    ]))
    story.append(sig_t)

    # ── Pied de page ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#e2e8f0"), spaceAfter=6))
    story.append(Paragraph(
        "Document généré par <b>Telework Platform</b> — "
        f"Généré le {datetime.utcnow().strftime('%d/%m/%Y à %H:%M')} UTC — "
        "Ce document constitue un accord contractuel numérique.",
        s["footer"],
    ))

    doc.build(story)
    return buf.getvalue()


def _build_structured_sections(story, s, data, *, employer_name, employee_name, employee_email):
    """Construit les sections du contrat à partir du dict structuré."""

    # 1. Parties
    story.append(Paragraph("Article 1 — Parties au contrat", s["section"]))
    story.append(Spacer(1, 4))
    story.append(_kv_table([
        ("Employeur",    data.get("employer_name") or employer_name),
        ("Collaborateur",employee_name),
        ("Email",        employee_email),
    ], s))
    story.append(Spacer(1, 8))

    # 2. Poste & rôle
    story.append(Paragraph("Article 2 — Poste et rôle", s["section"]))
    story.append(Spacer(1, 4))
    role_rows = [("Intitulé du poste", data.get("role_label") or data.get("role") or "—")]
    if data.get("project_name"):
        role_rows.append(("Projet", data["project_name"]))
    if data.get("start_date"):
        role_rows.append(("Date de début", data["start_date"]))
    if data.get("duration_months"):
        role_rows.append(("Durée", f"{data['duration_months']} mois"))
    story.append(_kv_table(role_rows, s))
    story.append(Spacer(1, 8))

    # 3. Rémunération
    story.append(Paragraph("Article 3 — Rémunération", s["section"]))
    story.append(Spacer(1, 4))
    currency = data.get("currency", "EUR")
    rem_rows = [
        ("Salaire de base", _currency_fmt(data.get("base_salary", 0), currency)),
    ]
    if data.get("bonus_percent"):
        rem_rows.append(("Prime de performance",
                         f"{data['bonus_percent']} % du salaire mensuel (basée sur le score IA)"))
    bonus_details = (data.get("bonus_details") or "").strip()
    if bonus_details and bonus_details.upper() != "AUCUNE":
        rem_rows.append(("Détails des primes", bonus_details))
    story.append(_kv_table(rem_rows, s))

    if data.get("bonus_percent"):
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "La prime de performance est calculée mensuellement en fonction du score IA attribué "
            "à chaque collaborateur selon les critères de qualité, de délai et d'impact des tâches "
            "réalisées sur la plateforme Telework.",
            s["clause"],
        ))
    story.append(Spacer(1, 8))

    # 4. Pénalités
    penalty_rules = (data.get("penalty_rules") or "").strip()
    if penalty_rules and penalty_rules.upper() != "AUCUNE":
        story.append(Paragraph("Article 4 — Pénalités", s["section"]))
        story.append(Spacer(1, 4))
        for line in penalty_rules.split("\n"):
            line = line.strip()
            if line:
                story.append(Paragraph(f"• {line}", s["clause"]))
        story.append(Spacer(1, 8))

    # 5. Résiliation
    story.append(Paragraph("Article 5 — Résiliation et préavis", s["section"]))
    story.append(Spacer(1, 4))
    res_rows = [
        ("Préavis de résiliation",
         f"{data.get('termination_notice_days', 30)} jours calendaires"),
    ]
    story.append(_kv_table(res_rows, s))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Chacune des parties peut mettre fin au présent contrat sous réserve du respect du préavis "
        "indiqué ci-dessus, notifié par email ou via la plateforme Telework. "
        "En cas de faute grave, la résiliation peut être immédiate.",
        s["clause"],
    ))
    story.append(Spacer(1, 8))

    # 6. Clauses particulières
    custom = (data.get("custom_clauses") or "").strip()
    if custom and custom.upper() not in ("BLABLABLA", "AUCUNE", "N/A", "-"):
        story.append(Paragraph("Article 6 — Clauses particulières", s["section"]))
        story.append(Spacer(1, 4))
        for line in custom.split("\n"):
            line = line.strip()
            if line:
                story.append(Paragraph(line, s["clause"]))
            else:
                story.append(Spacer(1, 4))
        story.append(Spacer(1, 8))
