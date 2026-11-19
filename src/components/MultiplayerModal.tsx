import React, { useState } from 'react';
import { Copy, Check, Globe, Users, Swords, X } from 'lucide-react';
import { MultiplayerStatus } from '../types/game';

interface MultiplayerModalProps {
  status: MultiplayerStatus;
  initialJoinCode?: string;
  onQuickMatch: (mode: 'coop' | 'pvp', playerName: string) => void;
  onCreateRoom: (
    mode: 'coop' | 'pvp',
    isPublic: boolean,
    playerName: string,
  ) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onLeaveRoom: () => void;
  onLaunchMatch: () => void;
  onClose: () => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  status,
  initialJoinCode = '',
  onQuickMatch,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onLaunchMatch,
  onClose,
}) => {
  const [playerName, setPlayerName] = useState(status.playerName || 'Caster');
  const [selectedMode, setSelectedMode] = useState<'coop' | 'pvp'>('coop');
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [copied, setCopied] = useState(false);

  const handleCopyInvite = () => {
    if (!status.roomCode) return;
    const url = `${window.location.origin}/?room=${status.roomCode}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#050812]/85">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0c1222] border border-white/15 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-50">
              Online Co-op & Arena Duel
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {status.connected
                ? 'Connected to Sanctum Relay · Play public matchmaking or invite friends.'
                : status.connecting
                  ? 'Connecting to multiplayer server...'
                  : 'Reconnecting to server...'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Multiplayer Lobby"
            className="p-2 rounded-lg bg-[#131b31] hover:bg-[#1c2847] text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {status.error && (
            <div className="px-4 py-2.5 rounded-lg bg-rose-950/90 border border-rose-400/40 text-xs text-rose-200">
              {status.error}
            </div>
          )}

          {status.roomCode ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#090d1a] border border-cyan-400/30">
                <div>
                  <div className="text-xs text-slate-400">
                    {status.matchMode === 'pvp' ? 'PvP Duel Room' : 'Co-op Sanctum Room'}
                  </div>
                  <div className="font-mono-num text-2xl font-bold tracking-widest text-cyan-300 mt-0.5">
                    {status.roomCode}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#15203b] hover:bg-[#1e2d52] text-slate-100 text-xs font-medium border border-white/10 whitespace-nowrap cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Link Copied' : 'Copy Invite Link'}
                  </button>
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium whitespace-nowrap cursor-pointer"
                  >
                    Leave
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Connected Casters ({status.players.length} / 4)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {status.players.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#090d1a] border border-white/10 text-xs"
                    >
                      <span className="font-medium text-slate-100">
                        {p.name} {p.id === status.playerId ? '(You)' : ''}
                      </span>
                      <span className="font-mono-num text-cyan-300 capitalize">
                        {p.gauntletId.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onLaunchMatch}
                className="w-full py-3 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                Enter Arena Now
              </button>
            </div>
          ) : (
            <>
              {/* Player Name & Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Caster Name
                  </label>
                  <input
                    type="text"
                    maxLength={18}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-[#090d1a] border border-white/15 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
                    placeholder="Enter name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Match Mode
                  </label>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090d1a] border border-white/10">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('coop')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        selectedMode === 'coop'
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Co-op Defense
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMode('pvp')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        selectedMode === 'pvp'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <Swords className="w-3.5 h-3.5" />
                      PvP Duel
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!status.connected}
                  onClick={() => onQuickMatch(selectedMode, playerName.trim() || 'Caster')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  Quick Match (Internet)
                </button>

                <button
                  type="button"
                  disabled={!status.connected}
                  onClick={() => onCreateRoom(selectedMode, false, playerName.trim() || 'Caster')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#15203b] hover:bg-[#1e2d52] disabled:opacity-50 text-slate-100 border border-white/15 font-medium text-sm transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4 text-emerald-300" />
                  Create Friend Room
                </button>
              </div>

              {/* Join by Friend Code */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 4-letter Room Code"
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#090d1a] border border-white/15 text-sm font-mono-num uppercase text-slate-100 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  disabled={!status.connected || joinCode.trim().length < 3}
                  onClick={() => onJoinRoom(joinCode, playerName.trim() || 'Caster')}
                  className="px-5 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-semibold text-sm whitespace-nowrap cursor-pointer"
                >
                  Join Room
                </button>
              </div>

              {/* Active Public Rooms */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Live Public Rooms
                </div>
                {status.publicRooms.length === 0 ? (
                  <div className="px-4 py-3 rounded-lg bg-[#090d1a] border border-white/10 text-xs text-slate-400">
                    No public rooms active right now. Click Quick Match to open one!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {status.publicRooms.map((r) => (
                      <div
                        key={r.code}
                        className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#090d1a] border border-white/10 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono-num font-bold text-cyan-300">
                            {r.code}
                          </span>
                          <span className="text-slate-300">{r.hostName}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400 uppercase">{r.mode}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-num text-slate-300">
                            {r.playerCount}/{r.maxPlayers}
                          </span>
                          <button
                            type="button"
                            onClick={() => onJoinRoom(r.code, playerName.trim() || 'Caster')}
                            className="px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-medium cursor-pointer"
                          >
                            Join
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
