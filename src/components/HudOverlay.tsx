import React, { useEffect, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  Layers,
  Pause,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getGauntletSpec } from '../game/gauntlets';
import {
  GameHudSnapshot,
  HandSign,
  MultiplayerStatus,
  ViewMode,
} from '../types/game';
import { SIGN_LABELS } from '../vision/gestureClassifier';

interface HudOverlayProps {
  hud: GameHudSnapshot;
  mpStatus: MultiplayerStatus;
  pipCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onToggleViewMode: (mode: ViewMode) => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenArmory: () => void;
  onOpenMultiplayer: () => void;
  onSwitchToFallback: () => void;
}

const LEFT_SIGN_ACTIONS: Record<HandSign, string> = {
  none: 'Strafe Ready',
  open_palm: 'Parry Ward',
  fist: 'Mana Surge',
  pinch: 'Telekinesis',
  point: 'Strafe Aim',
  peace: 'Strafe Ready',
  thumbs_up: 'Strafe Ready',
};

const RIGHT_SIGN_ACTIONS: Record<HandSign, string> = {
  none: 'Ready',
  point: 'Primary Cast',
  peace: 'Homing Volley',
  open_palm: 'Shockwave',
  fist: 'Charging Meteor',
  thumbs_up: 'Sanctum Mend',
  pinch: 'Convergence',
};

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  mpStatus,
  pipCanvasRef,
  onToggleViewMode,
  onToggleCamera,
  onToggleMute,
  onPause,
  onOpenArmory,
  onOpenMultiplayer,
  onSwitchToFallback,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const resonancePct = Math.max(0, Math.min(100, hud.resonance));
  const spec = getGauntletSpec(hud.equippedGauntlet);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
      {/* Top Perimeter Status Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2 bg-[#090d1a]/88 border border-white/10 rounded-xl px-4 py-3 min-w-[240px]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">Integrity</span>
            <span className="font-mono-num font-bold text-slate-50">
              {hud.health} / {hud.maxHealth}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${healthPct}%`,
                backgroundColor:
                  healthPct > 50 ? '#34d399' : healthPct > 25 ? '#fbbf24' : '#f43f5e',
              }}
            />
          </div>

          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-slate-300 font-medium">
              {hud.resonance >= 100 ? spec.ultimateLabel : 'Resonance'}
            </span>
            <span className="font-mono-num font-bold text-cyan-300">
              {hud.resonance}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full transition-all duration-150"
              style={{
                width: `${resonancePct}%`,
                backgroundColor: hud.resonance >= 100 ? '#c084fc' : spec.accentCss,
              }}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300 pt-1 border-t border-white/10">
            <span className="font-mono-num font-semibold text-amber-300">
              {hud.matchMode === 'pvp' ? 'PvP Duel' : `Wave ${hud.wave}`}
            </span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="font-mono-num font-bold text-slate-50">
              {hud.score.toLocaleString()}
            </span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="font-mono-num text-amber-300">
              {hud.bankPoints.toLocaleString()} pts
            </span>
          </div>

          {mpStatus.roomCode && (
            <div className="flex items-center justify-between text-[11px] text-emerald-300 pt-1 border-t border-white/10">
              <span>
                Room {mpStatus.roomCode} · {mpStatus.players.length} Online
              </span>
              {hud.chronoSlowTimer > 0 && (
                <span className="text-amber-300 font-mono-num">
                  Chrono {hud.chronoSlowTimer.toFixed(1)}s
                </span>
              )}
            </div>
          )}
          {!mpStatus.roomCode && hud.chronoSlowTimer > 0 && (
            <div className="text-[11px] text-amber-300 font-mono-num pt-1 border-t border-white/10">
              Chrono Slow Active · {hud.chronoSlowTimer.toFixed(1)}s
            </div>
          )}
        </div>

        {/* Top-Right Compact Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090d1a]/90 border border-white/10">
            <button
              type="button"
              onClick={() => onToggleViewMode('ar')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hud.viewMode === 'ar'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
              title="AR Webcam Passthrough (V)"
            >
              <Eye className="w-3.5 h-3.5" />
              AR Cam
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('vr')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hud.viewMode === 'vr'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
              title="3D VR Sanctum (V)"
            >
              <Layers className="w-3.5 h-3.5" />
              3D VR
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenArmory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#090d1a]/90 border border-amber-400/30 text-amber-200 hover:bg-[#131b31] text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Gauntlets
          </button>

          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#090d1a]/90 border border-emerald-400/30 text-emerald-200 hover:bg-[#131b31] text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-emerald-300" />
            {mpStatus.roomCode ? mpStatus.roomCode : 'Co-op / PvP'}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={hud.isMuted ? 'Unmute audio' : 'Mute audio'}
            className="p-2 rounded-lg bg-[#090d1a]/90 border border-white/10 text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            {hud.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause game"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#090d1a]/90 border border-white/10 text-slate-200 hover:text-cyan-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        </div>
      </div>

      {/* Center Callouts */}
      <div className="flex flex-col items-center justify-center gap-2 my-auto pointer-events-none">
        {hud.waveBanner && (
          <div className="px-6 py-2.5 rounded-xl bg-[#090d1a]/88 border border-amber-400/35 text-center">
            <div className="font-display text-xl sm:text-2xl font-bold tracking-wider text-amber-300">
              {hud.waveBanner}
            </div>
          </div>
        )}
        {hud.lastCastLabel && (
          <div className="px-3.5 py-1 rounded-md bg-[#090d1a]/82 border border-cyan-400/30 text-xs font-semibold text-cyan-200 tracking-wide">
            {hud.lastCastLabel}
          </div>
        )}
        {hud.meteorCharge > 0.08 && (
          <div className="w-36 h-1.5 rounded-full bg-slate-900/90 border border-orange-400/40 overflow-hidden">
            <div
              className="h-full bg-orange-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.meteorCharge * 100)}%` }}
            />
          </div>
        )}
      </div>

      {hud.cameraError && hud.inputMode === 'webcam' && (
        <div className="mx-auto mb-2 px-4 py-2 rounded-lg bg-amber-950/92 border border-amber-400/40 flex items-center gap-3 text-xs text-amber-100 pointer-events-auto">
          <span>{hud.cameraError}</span>
          <button
            type="button"
            onClick={onSwitchToFallback}
            className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Use Mouse & Keys
          </button>
        </div>
      )}

      {/* Bottom Row: Collapsible Control Dock + VR PiP Hand Monitor */}
      <div className="relative flex items-end justify-center">
        <div className="flex flex-col items-center pointer-events-auto">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#090d1a]/90 border border-b-0 border-white/10 text-[11px] font-medium text-slate-300 hover:text-slate-50 transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Show Controls
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Hide Controls
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-2.5 rounded-xl bg-[#090d1a]/92 border border-white/10 max-w-[94vw]">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold" style={{ color: spec.accentCss }}>
                  {spec.name}
                </span>
              </div>

              <div className="h-4 w-px bg-white/10 hidden sm:block" />

              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-emerald-300">Left</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-100 font-medium">
                  {hud.leftDetected
                    ? `${SIGN_LABELS[hud.leftSign]} (${LEFT_SIGN_ACTIONS[hud.leftSign]})`
                    : hud.inputMode === 'fallback'
                      ? hud.shieldActive
                        ? 'Parry Ward (RMB)'
                        : 'WASD Strafe'
                      : 'Searching'}
                </span>
              </div>

              <div className="h-4 w-px bg-white/10 hidden sm:block" />

              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-cyan-300">Right</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-100 font-medium">
                  {hud.rightDetected
                    ? `${SIGN_LABELS[hud.rightSign]} (${RIGHT_SIGN_ACTIONS[hud.rightSign]})`
                    : hud.inputMode === 'fallback'
                      ? 'Mouse + 1–5 Cast'
                      : 'Searching'}
                </span>
              </div>

              <div className="h-4 w-px bg-white/10 hidden sm:block" />

              <button
                type="button"
                onClick={onToggleCamera}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  hud.cameraStatus === 'active'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                    : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-white/10'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                {hud.cameraStatus === 'active'
                  ? 'Hand Cam On'
                  : hud.cameraStatus === 'loading'
                    ? 'Loading Cam...'
                    : 'Enable Hand Cam'}
              </button>
            </div>
          )}
        </div>

        <div
          className={`absolute right-0 bottom-0 rounded-xl overflow-hidden border border-white/15 bg-[#090d1a]/92 transition-opacity duration-150 ${
            hud.cameraStatus === 'active' && hud.viewMode === 'vr' && !dockCollapsed
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <canvas
            ref={pipCanvasRef}
            width={220}
            height={132}
            className="block w-[220px] h-[132px]"
          />
          <div className="px-2.5 py-1 text-[10px] font-mono-num text-slate-300 flex items-center justify-between border-t border-white/10">
            <span>Hand Tracker</span>
            <span>
              {hud.leftDetected && hud.rightDetected
                ? '2 Hands'
                : hud.leftDetected || hud.rightDetected
                  ? '1 Hand'
                  : 'Align Hands'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
