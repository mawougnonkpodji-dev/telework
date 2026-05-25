import { useState, useEffect } from 'react';
import { X, Smartphone, CheckCircle, Loader, ArrowRight, AlertCircle, Download } from 'lucide-react';
import { createMobileMoneyTransaction } from '../services/backendApi.js';

const operators = [
  { id: 'mtn', name: 'MTN Money', color: '#ffc107', textColor: '#000', provider: 'MTN_MOMO' },
  { id: 'moov', name: 'Moov Money', color: '#ef4444', textColor: '#fff', provider: 'SIMULATED_MOMO' },
  { id: 'wave', name: 'Wave', color: '#3b82f6', textColor: '#fff', provider: 'WAVE' },
  { id: 'orange', name: 'Orange Money', color: '#ff7900', textColor: '#fff', provider: 'ORANGE_MONEY' },
];

/**
 * Simulation alignée sur POST /api/mobile-money/projects/:id/transactions
 */
export default function MobileMoneyModal({
  isOpen,
  onClose,
  projectId,
  amount: amountProp = 5000,
  beneficiaries = [],
  defaultBeneficiaryId = null,
  onSuccess,
  /** Optional async fn() called when user clicks "Télécharger PDF" on success screen.
   *  Triggered by a direct button click → no popup-blocker issues. */
  onSlipDownload = null,
}) {
  const [step, setStep] = useState('select');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState(String(amountProp));
  const [beneficiaryUserId, setBeneficiaryUserId] = useState(defaultBeneficiaryId);
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [simulatedResult, setSimulatedResult] = useState('random');
  const [tx, setTx] = useState(null);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setPhone('');
      setAmount(String(amountProp));
      setBeneficiaryUserId(defaultBeneficiaryId ?? (beneficiaries[0]?.id ?? null));
      setSelectedOperator(null);
      setSimulatedResult('random');
      setTx(null);
      setApiError('');
    }
  }, [isOpen, amountProp, defaultBeneficiaryId, beneficiaries]);

  const formatPhone = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 4) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 12)}`;
  };

  const initiatePayment = async () => {
    if (!phone || phone.replace(/\s/g, '').length < 8 || !selectedOperator || !projectId) return;
    setApiError('');
    setStep('processing');
    const digits = phone.replace(/\s/g, '');
    const phone_number = digits.startsWith('+') ? digits : `+${digits}`;
    const amt = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      setApiError('Montant invalide');
      setStep('phone');
      return;
    }
    try {
      const res = await createMobileMoneyTransaction(projectId, {
        amount: amt,
        currency: 'XOF',
        provider: selectedOperator.provider,
        phone_number,
        beneficiary_user_id: beneficiaryUserId || undefined,
        simulated_result: simulatedResult,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError(data.error || `Erreur ${res.status}`);
        setStep('phone');
        return;
      }
      const transaction = data.transaction;
      setTx(transaction);
      const succeeded = transaction?.status === 'success';
      setStep(succeeded ? 'success' : 'failed');
      // Only fire onSuccess for actual successes
      if (succeeded) onSuccess?.(transaction);
    } catch {
      setApiError('Erreur réseau');
      setStep('phone');
    }
  };

  const handleClose = () => {
    setStep('select');
    setPhone('');
    setSelectedOperator(null);
    setTx(null);
    setApiError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '420px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: selectedOperator?.color || '#1e293b',
            padding: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'background 0.3s',
          }}
        >
          <div>
            <h3 style={{ color: selectedOperator?.textColor || '#fff', margin: 0, fontSize: '18px', fontWeight: '600' }}>
              Paiement Mobile (simulation)
            </h3>
            <p style={{ color: selectedOperator?.textColor || '#94a3b8', margin: '4px 0 0', fontSize: '14px', opacity: 0.85 }}>
              {selectedOperator ? selectedOperator.name : 'Sélectionnez un opérateur'}
            </p>
          </div>
          <button type="button" onClick={handleClose} style={{ background: 'transparent', border: 'none', color: selectedOperator?.textColor || '#fff', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 4px' }}>Montant (XOF)</p>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '200px',
              textAlign: 'center',
              fontSize: '28px',
              fontWeight: '700',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '8px',
            }}
          />
        </div>

        {beneficiaries.length > 0 && (
          <div style={{ padding: '0 20px 12px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>Bénéficiaire (membre du projet)</label>
            <select
              value={beneficiaryUserId ?? ''}
              onChange={(e) => setBeneficiaryUserId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '14px' }}
            >
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || b.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {step === 'select' && (
          <div style={{ padding: '20px' }}>
            <p style={{ color: '#374151', fontSize: '14px', marginBottom: '12px', fontWeight: '500' }}>Choisissez votre opérateur</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setSelectedOperator(op)}
                  style={{
                    padding: '16px',
                    border: selectedOperator?.id === op.id ? `2px solid ${op.color}` : '2px solid #e5e7eb',
                    borderRadius: '12px',
                    background: selectedOperator?.id === op.id ? `${op.color}15` : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: op.color,
                      margin: '0 auto 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Smartphone size={20} color={op.textColor} />
                  </div>
                  <p style={{ color: '#1f2937', fontSize: '13px', fontWeight: '500', margin: 0, textAlign: 'center' }}>{op.name}</p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep('phone')}
              disabled={!selectedOperator}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: selectedOperator ? selectedOperator.color : '#9ca3af',
                border: 'none',
                color: selectedOperator ? selectedOperator.textColor : '#fff',
                fontSize: '16px',
                fontWeight: '600',
                cursor: selectedOperator ? 'pointer' : 'not-allowed',
                opacity: selectedOperator ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              Continuer
              <ArrowRight size={20} />
            </button>
          </div>
        )}

        {step === 'phone' && (
          <div style={{ padding: '20px' }}>
            <p style={{ color: '#374151', fontSize: '14px', marginBottom: '12px', fontWeight: '500' }}>Numéro {selectedOperator?.name}</p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="77 123 45 67"
              style={{
                width: '100%',
                padding: '16px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '18px',
                textAlign: 'center',
                letterSpacing: '2px',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />

            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Résultat simulé (test)</p>
            <select
              value={simulatedResult}
              onChange={(e) => setSimulatedResult(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '16px', fontSize: '14px' }}
            >
              <option value="random">Aléatoire (succès ou échec)</option>
              <option value="success">Forcer succès</option>
              <option value="failed">Forcer échec</option>
            </select>

            {apiError && (
              <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={16} />
                {apiError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setStep('select')}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#f3f4f6',
                  border: 'none',
                  color: '#374151',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Retour
              </button>
              <button
                type="button"
                onClick={initiatePayment}
                disabled={phone.replace(/\s/g, '').length < 8}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '10px',
                  background: selectedOperator?.color || '#6b7280',
                  border: 'none',
                  color: selectedOperator?.textColor || '#fff',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: phone.replace(/\s/g, '').length >= 8 ? 'pointer' : 'not-allowed',
                  opacity: phone.replace(/\s/g, '').length >= 8 ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                Payer maintenant
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Loader size={48} style={{ color: selectedOperator?.color, animation: 'spin 1s linear infinite' }} />
            <style>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
            <p style={{ color: '#1f2937', fontSize: '16px', fontWeight: '600', marginTop: '16px' }}>Traitement simulation…</p>
          </div>
        )}

        {step === 'success' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#22c55e',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle size={48} color="#fff" />
            </div>
            <p style={{ color: '#1f2937', fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Transaction réussie</p>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>Référence : {tx?.external_reference}</p>

            {/* PDF download — direct user click avoids popup-blocker */}
            {onSlipDownload && (
              <button
                type="button"
                onClick={onSlipDownload}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  border: '1.5px solid #22c55e',
                  color: '#15803d',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <Download size={16} />
                Télécharger la fiche de paie (PDF)
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: selectedOperator?.color,
                border: 'none',
                color: selectedOperator?.textColor,
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Terminer
            </button>
          </div>
        )}

        {step === 'failed' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#fecaca',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle size={48} color="#b91c1c" />
            </div>
            <p style={{ color: '#1f2937', fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Échec simulé</p>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>{tx?.failure_reason || 'La transaction a été refusée.'}</p>
            <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '16px' }}>Réf. {tx?.external_reference}</p>
            <button
              type="button"
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                background: '#1e293b',
                border: 'none',
                color: '#fff',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
