import { Satellite, WifiOff } from 'lucide-react';

export default function StatusBar() {
  return (
    <header className="h-[60px] fixed top-0 left-20 right-0 z-40 px-6 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent">
      <h1 className="font-geometric text-xl font-semibold tracking-wider text-white">
        GLOWUP
        <span className="text-cyan-400 ml-2">|</span>
        <span className="text-sm text-slate-400 ml-2 font-normal">Projet Alpha</span>
      </h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <WifiOff className="w-4 h-4 text-emerald-400" />
          <span>Offline</span>
          <Satellite className="w-5 h-5 text-cyan-400 animate-satellite-spin" />
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-white">Cris</p>
            <p className="text-xs text-slate-400">Admin</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center user-halo">
            <span className="text-white font-semibold">C</span>
          </div>
        </div>
      </div>
    </header>
  );
}