"""
Entraîne un modèle de régression linéaire sur 500 profils synthétiques,
puis le sérialise en scoring_model.pkl (dossier backend/).

Variables :
  x1  ponctualité de connexion       15 %
      = % jours où la 1ère connexion est <= 09:00 heure locale
      (journée de 8h : 09h00 – 17h00)
  x2  taux d'achèvement              25 %
  x3  taux de rejet (pénalité)       25 %
  x4  fréquence d'interaction        10 %
  x5  qualité des interactions       10 %
  x6  participation aux révisions    15 %

Usage :
    python -m app.services.ai_scoring_trainer
    # ou directement :
    python backend/app/services/ai_scoring_trainer.py
"""

import os
import numpy as np
import joblib
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

# ── Emplacement de sortie du modèle ──────────────────────────────────────────
HERE       = os.path.dirname(os.path.abspath(__file__))
BACKEND    = os.path.abspath(os.path.join(HERE, "..", ".."))
MODEL_PATH = os.path.join(BACKEND, "scoring_model.pkl")

# ── Poids des 6 variables ────────────────────────────────────────────────────
#   x1 ponctualité de connexion      15 %
#   x2 taux d'achèvement dans délais 25 %
#   x3 taux de rejet (pénalité)      25 %
#   x4 fréquence d'interaction       10 %
#   x5 qualité des interactions      10 %
#   x6 taux de participation révisions 15 %
WEIGHTS = np.array([0.15, 0.25, 0.25, 0.10, 0.10, 0.15])


def generate_synthetic_data(n=500, seed=42):
    """Génère n profils synthétiques avec bruit gaussien."""
    rng = np.random.default_rng(seed)

    # Variables uniformes [0, 1] — x3 est un taux de rejet (plus bas = mieux)
    X = rng.uniform(0, 1, size=(n, 6))

    # Formule ground-truth :
    #   score = 100 * (0.15*x1 + 0.25*x2 + 0.25*(1-x3) + 0.10*x4 + 0.10*x5 + 0.15*x6) + bruit
    contribution = (
        WEIGHTS[0] * X[:, 0]
        + WEIGHTS[1] * X[:, 1]
        + WEIGHTS[2] * (1 - X[:, 2])  # pénalité : (1 - rejet)
        + WEIGHTS[3] * X[:, 3]
        + WEIGHTS[4] * X[:, 4]
        + WEIGHTS[5] * X[:, 5]
    )
    noise = rng.normal(0, 0.03, size=n)          # bruit ≈ ±3 pts
    y = np.clip(100 * contribution + noise, 0, 100)

    return X, y


def train_and_save(verbose=True):
    """Génère les données, entraîne le modèle, sauvegarde le .pkl."""
    X, y = generate_synthetic_data(500)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2  = r2_score(y_test, y_pred)

    joblib.dump(model, MODEL_PATH)

    if verbose:
        print(f"[OK] Modele entraine et sauvegarde -> {MODEL_PATH}")
        print(f"   MAE  = {mae:.4f} pts  |  R2  = {r2:.4f}")
        print(f"   Coefficients : {dict(zip(['punct','completion','rejection','interact_freq','interact_qual','review'], model.coef_.round(3)))}")
        print(f"   Intercept    : {model.intercept_:.3f}")

    return model, mae, r2


if __name__ == "__main__":
    train_and_save()
