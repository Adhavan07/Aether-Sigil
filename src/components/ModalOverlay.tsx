import React from 'react';
import { Play, RotateCcw, Home, Sparkles } from 'lucide-react';
import { GameHudSnapshot } from '../types/game';

interface ModalOverlayProps {
  hud: GameHudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onOpenArmory: () => void;
}

export const ModalOverlay: React.FC<ModalOverlayProps> = ({
  hud,
  onResume,
  onRestart,
  onReturnTitle,
  onOpenArmory,
}) => {
  const isPaused = hud.phase === 'paused';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#050812]/80">
      <div className="w-full max-w-md rounded-2xl bg-[#0c1222] border border-white/15 p-6 sm:p-7">
        <div className="text-xs font-medium text-cyan-300 tracking-wide mb-1">
          {isPaused ? 'Sanctum Paused' : 'Sanctum Breached'}
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-50 mb-5">
          {isPaused ? 'Spellcasting Paused' : 'Trial Complete'}
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-xl bg-[#090d1a] border border-white/10 text-xs">
          <div>
            <div className="text-slate-400">Match Score</div>
            <div className="font-mono-num text-lg font-bold text-slate-50 mt-0.5">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Available Points</div>
            <div className="font-mono-num text-lg font-bold text-amber-300 mt-0.5">
              {hud.bankPoints.toLocaleString()} pts
            </div>
          </div>
          <div>
            <div className="text-slate-400">Wave Reached</div>
            <div className="font-mono-num text-base font-semibold text-cyan-300 mt-0.5">
              Wave {hud.wave}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Banished / Parries</div>
            <div className="font-mono-num text-base font-semibold text-emerald-300 mt-0.5">
              {hud.kills} / {hud.parries}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isPaused && (
            <button
              type="button"
              onClick={onResume}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Resume
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer ${
              isPaused
                ? 'bg-[#16203a] hover:bg-[#1e2c4f] text-slate-100 border border-white/15'
                : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>

          <button
            type="button"
            onClick={onOpenArmory}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#16203a] hover:bg-[#1e2c4f] text-amber-200 border border-amber-400/30 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Gauntlets
          </button>

          <button
            type="button"
            onClick={onReturnTitle}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#11182c] hover:bg-[#18223d] text-slate-200 border border-white/10 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Title
          </button>
        </div>
      </div>
    </div>
  );
};
