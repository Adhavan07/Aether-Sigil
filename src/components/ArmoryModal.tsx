import React from 'react';
import { Check, Lock, Shield, Sparkles, X } from 'lucide-react';
import { GAUNTLET_CATALOG } from '../game/gauntlets';
import { GauntletId } from '../types/game';

interface ArmoryModalProps {
  bankPoints: number;
  equippedGauntlet: GauntletId;
  unlockedGauntlets: GauntletId[];
  onBuyOrEquip: (id: GauntletId) => void;
  onClose: () => void;
}

export const ArmoryModal: React.FC<ArmoryModalProps> = ({
  bankPoints,
  equippedGauntlet,
  unlockedGauntlets,
  onBuyOrEquip,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#050812]/85">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0c1222] border border-white/15 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-50">
              Gauntlet Forge & Armory
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Unlock legendary hand armor shaders, particle emitters, and combat powers using earned points.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Available Points</div>
              <div className="font-mono-num text-base font-bold text-amber-300">
                {bankPoints.toLocaleString()} pts
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Armory"
              className="p-2 rounded-lg bg-[#131b31] hover:bg-[#1c2847] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Gauntlet Cards Grid */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAUNTLET_CATALOG.map((g) => {
            const isUnlocked = unlockedGauntlets.includes(g.id);
            const isEquipped = equippedGauntlet === g.id;
            const canAfford = bankPoints >= g.cost;

            return (
              <div
                key={g.id}
                className={`flex flex-col justify-between rounded-xl border overflow-hidden transition-colors ${
                  isEquipped
                    ? 'bg-[#121c36] border-cyan-400/60'
                    : 'bg-[#090d1a] border-white/10'
                }`}
              >
                <div>
                  <div className="relative aspect-[4/3] w-full bg-[#060914] overflow-hidden">
                    <img
                      src={g.imageUrl}
                      alt={`${g.name} gauntlet artwork`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(to top, rgba(9,13,26,0.92) 0%, rgba(9,13,26,0.15) 55%, transparent 100%)',
                      }}
                    />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                      <div>
                        <div
                          className="text-sm font-bold leading-tight"
                          style={{ color: g.accentCss }}
                        >
                          {g.name}
                        </div>
                        <div className="text-[11px] text-slate-300">{g.subtitle}</div>
                      </div>
                      <span className="font-mono-num text-xs font-semibold text-amber-300 whitespace-nowrap">
                        {g.cost === 0 ? 'Starter' : `${g.cost.toLocaleString()} pts`}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5">
                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      {g.perkSummary}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" style={{ color: g.accentCss }} />
                        {g.boltLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Shield className="w-3 h-3 text-emerald-300" />
                        {g.ultimateLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-3.5 pb-3.5">
                  <button
                    type="button"
                    disabled={!isUnlocked && !canAfford}
                    onClick={() => onBuyOrEquip(g.id)}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isEquipped
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                        : isUnlocked
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                          : canAfford
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-slate-900 text-slate-500 border border-white/5 cursor-not-allowed'
                    }`}
                  >
                    {isEquipped ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Equipped
                      </>
                    ) : isUnlocked ? (
                      'Equip Gauntlet'
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        Unlock · {g.cost.toLocaleString()} pts
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
