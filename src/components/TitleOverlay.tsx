import React from 'react';
import { Camera, Gamepad2, Eye, Layers, Sparkles, Users } from 'lucide-react';
import { getGauntletSpec } from '../game/gauntlets';
import {
  CameraStatus,
  GauntletId,
  MultiplayerStatus,
  ViewMode,
} from '../types/game';

interface TitleOverlayProps {
  bestScore: number;
  bankPoints: number;
  equippedGauntlet: GauntletId;
  viewMode: ViewMode;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  mpStatus: MultiplayerStatus;
  onToggleViewMode: (mode: ViewMode) => void;
  onStartWithWebcam: () => void;
  onStartWithFallback: () => void;
  onOpenArmory: () => void;
  onOpenMultiplayer: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  bestScore,
  bankPoints,
  equippedGauntlet,
  viewMode,
  cameraStatus,
  cameraError,
  mpStatus,
  onToggleViewMode,
  onStartWithWebcam,
  onStartWithFallback,
  onOpenArmory,
  onOpenMultiplayer,
}) => {
  const isLoading = cameraStatus === 'loading';
  const spec = getGauntletSpec(equippedGauntlet);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
      {/* Top quiet metadata bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 pointer-events-auto">
        <div className="flex items-center gap-2.5 tracking-wide">
          <span className="font-semibold text-cyan-300">AR / VR Hand-Sign Arena</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="font-mono-num text-amber-300">
            {bankPoints.toLocaleString()} pts
          </span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span style={{ color: spec.accentCss }}>{spec.name}</span>
          {bestScore > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="font-mono-num text-slate-300">
                Best {bestScore.toLocaleString()}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0c1222]/90 border border-white/10">
          <button
            type="button"
            onClick={() => onToggleViewMode('ar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'ar'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            AR Cam
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('vr')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'vr'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            3D VR
          </button>
        </div>
      </div>

      {/* Center-left hero lockup over calm negative space */}
      <div className="max-w-xl my-auto pointer-events-auto">
        <div className="inline-flex items-center gap-4 mb-5">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="32" cy="32" r="28" stroke="#22D3EE" strokeWidth="1.5" strokeOpacity="0.65" />
            <circle cx="32" cy="32" r="20" stroke="#FBBF24" strokeWidth="1.25" strokeDasharray="4 4" />
            <polygon points="32,7 54,45 10,45" stroke="#34D399" strokeWidth="1.5" fill="none" />
            <polygon points="32,57 54,19 10,19" stroke="#22D3EE" strokeWidth="1.25" fill="none" strokeOpacity="0.8" />
            <circle cx="32" cy="32" r="5" fill="#F8FAFC" />
          </svg>

          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-wider text-slate-50">
              AETHER SIGIL
            </h1>
            <p className="text-sm text-cyan-300/90 mt-1">
              Two-Handed Gesture Arena · Online Co-op & Gauntlet Forge
            </p>
          </div>
        </div>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg mb-5">
          Channel two-handed gestures to strafe, parry, and cast spells. Earn points to forge
          legendary gauntlets—Iron Man Repulsors, Strange Mandalas, Doom Plasma, and Thanos
          Infinity Stones—solo or online with friends.
        </p>

        {/* Sign Quick Reference Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-xl bg-[#0c1222]/90 border border-white/10 text-xs">
          <div>
            <div className="font-semibold text-emerald-300 mb-1.5">
              Left Hand · Move & Ward
            </div>
            <ul className="space-y-1 text-slate-300">
              <li>Move Hand — Strafe & Dodge</li>
              <li>Open Palm — Parry Shield</li>
              <li>Pinch — Grab Crystals / Pull</li>
              <li>Closed Fist — Surge Cooldowns</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-cyan-300 mb-1.5">
              Right Hand · {spec.name}
            </div>
            <ul className="space-y-1 text-slate-300">
              <li>Point — {spec.boltLabel}</li>
              <li>Peace / V — Homing Volley</li>
              <li>Open Palm — Shockwave</li>
              <li>Fist → Release — Heavy Meteor</li>
            </ul>
          </div>
        </div>

        {cameraError && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-950/90 border border-amber-400/40 text-xs text-amber-200">
            {cameraError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onStartWithWebcam}
            className="flex items-center gap-2 px-5 py-3 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            {isLoading ? 'Starting Hand Cam...' : 'Start with Hand Cam'}
          </button>

          <button
            type="button"
            onClick={onStartWithFallback}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#131b31] hover:bg-[#1b2644] text-slate-100 border border-white/15 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4 text-slate-300" />
            Mouse & Keys
          </button>

          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#131b31] hover:bg-[#1b2644] text-emerald-200 border border-emerald-400/30 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4 text-emerald-300" />
            {mpStatus.roomCode ? `Room ${mpStatus.roomCode}` : 'Online / Friends'}
          </button>

          <button
            type="button"
            onClick={onOpenArmory}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#131b31] hover:bg-[#1b2644] text-amber-200 border border-amber-400/30 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Gauntlets
          </button>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="text-xs text-slate-400 tracking-wide">
        Hand Cam: Two-hand tracking · Fallback: WASD Move · Mouse Aim · Left Click Bolt · Right Click Shield · 1–5 / Q Spells · V AR/VR · Esc Pause
      </div>
    </div>
  );
};
