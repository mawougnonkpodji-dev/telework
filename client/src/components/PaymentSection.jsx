import { Send, Smartphone, CreditCard, Receipt } from 'lucide-react';

export default function PaymentSection() {
  const quickPayButtons = [
    {
      name: 'MTN',
      number: '*** *** 123',
      color: 'from-yellow-400 to-yellow-600',
      textColor: 'text-yellow-400'
    },
    {
      name: 'Orange',
      number: '*** *** 456',
      color: 'from-orange-400 to-orange-600',
      textColor: 'text-orange-400'
    }
  ];

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone className="w-5 h-5 text-emerald-400" />
        <h3 className="font-semibold text-white">Paiement Rapide</h3>
      </div>

      <div className="space-y-3 mb-4">
        {quickPayButtons.map((provider) => (
          <button
            key={provider.name}
            className={`w-full metallic-shine rounded-xl p-4 bg-gradient-to-br ${provider.color} relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200`}
          >
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white">{provider.name} Money</p>
                  <p className="text-xs text-white/70">{provider.number}</p>
                </div>
              </div>
              <Send className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <button className="w-full btn-glass flex items-center gap-2 text-sm text-slate-300 hover:text-white">
          <CreditCard className="w-4 h-4 text-emerald-400" />
          Nouvelle carte
        </button>
        <button className="w-full btn-glass flex items-center gap-2 text-sm text-slate-300 hover:text-white">
          <Receipt className="w-4 h-4 text-emerald-400" />
          Historique
        </button>
      </div>
    </div>
  );
}