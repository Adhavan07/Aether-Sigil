import { useCallback, useEffect, useRef, useState } from 'react';
import { ArcaneAudio } from './audio/ArcaneAudio';
import { ArmoryModal } from './components/ArmoryModal';
import { HudOverlay } from './components/HudOverlay';
import { ModalOverlay } from './components/ModalOverlay';
import { MultiplayerModal } from './components/MultiplayerModal';
import { TitleOverlay } from './components/TitleOverlay';
import { ArcaneArenaEngine } from './game/ArcaneArenaEngine';
import { MultiplayerClient } from './net/MultiplayerClient';
import {
  CameraStatus,
  GameHudSnapshot,
  GauntletId,
  InputMode,
  MultiplayerStatus,
  PlayerInputState,
  ViewMode,
} from './types/game';
import { HandTrackerService } from './vision/HandTrackerService';

function createInitialInputState(): PlayerInputState {
  return {
    left: {
      detected: false,
      palmX: 0.3,
      palmY: 0.5,
      palmZ: 0,
      sign: 'none',
      confidence: 0,
      landmarks: [],
    },
    right: {
      detected: false,
      palmX: 0.7,
      palmY: 0.5,
      palmZ: 0,
      sign: 'none',
      confidence: 0,
      landmarks: [],
    },
    strafeX: 0,
    strafeY: 0,
    aimX: 0,
    aimY: 0,
    queuedSpell: null,
    shieldActive: false,
    telekinesisActive: false,
    manaSurgeActive: false,
    meteorCharging: false,
    meteorChargeRatio: 0,
  };
}

const INITIAL_HUD: GameHudSnapshot = {
  phase: 'title',
  viewMode: 'vr',
  inputMode: 'fallback',
  matchMode: 'solo',
  cameraStatus: 'idle',
  cameraError: null,
  health: 100,
  maxHealth: 100,
  resonance: 40,
  wave: 1,
  enemiesRemaining: 0,
  score: 0,
  bankPoints: 0,
  equippedGauntlet: 'arcane',
  unlockedGauntlets: ['arcane'],
  combo: 0,
  kills: 0,
  parries: 0,
  casts: 0,
  bestScore: 0,
  leftDetected: false,
  rightDetected: false,
  leftSign: 'none',
  rightSign: 'none',
  lastCastLabel: null,
  waveBanner: null,
  cooldowns: {
    astral_bolt: 0,
    twin_starfire: 0,
    solar_shockwave: 0,
    meteor_hammer: 0,
    sanctum_mend: 0,
  },
  meteorCharge: 0,
  shieldActive: false,
  chronoSlowTimer: 0,
  isMuted: false,
};

const INITIAL_MP: MultiplayerStatus = {
  connected: false,
  connecting: false,
  roomCode: null,
  matchMode: 'solo',
  playerId: null,
  playerName: 'Caster',
  isHost: false,
  players: [],
  publicRooms: [],
  error: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const inputRef = useRef<PlayerInputState>(createInitialInputState());
  const audioRef = useRef<ArcaneAudio | null>(null);
  const engineRef = useRef<ArcaneArenaEngine | null>(null);
  const trackerRef = useRef<HandTrackerService | null>(null);
  const mpRef = useRef<MultiplayerClient | null>(null);

  const heldKeysRef = useRef<Set<string>>(new Set());
  const mouseShieldRef = useRef(false);

  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [mpStatus, setMpStatus] = useState<MultiplayerStatus>(INITIAL_MP);
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [mpOpen, setMpOpen] = useState(false);
  const [initialRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') ?? '').toUpperCase();
  });

  useEffect(() => {
    if (initialRoomCode) {
      setMpOpen(true);
    }
  }, [initialRoomCode]);

  useEffect(() => {
    trackerRef.current?.setDebugCanvas(pipCanvasRef.current);
  }, [hud.phase, hud.viewMode, hud.cameraStatus]);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const audio = new ArcaneAudio();
    audioRef.current = audio;

    const engine = new ArcaneArenaEngine(
      mountEl,
      inputRef,
      audio,
      (snapshot) => {
        setHud(snapshot);
      },
    );
    engineRef.current = engine;

    const mp = new MultiplayerClient({
      onStatusChange: (status) => {
        setMpStatus(status);
        engine.setMatchContext(status.matchMode, status.playerId, status.isHost);
        engine.syncRemotePlayers(status.players);
      },
      onRemoteCast: (ev) => {
        engine.spawnRemoteCast(ev);
      },
      onPvpHit: (targetId, _attackerId, damage) => {
        if (mpRef.current?.getStatus().playerId === targetId) {
          engine.applyPvpHit(damage);
        }
      },
      onCoopEvent: (ev) => {
        engine.handleCoopEvent(ev.event, ev.payload);
      },
    });
    mp.connect();
    mpRef.current = mp;

    engine.setMultiplayerHooks({
      onSendPlayerUpdate: (payload) => mp.sendPlayerUpdate(payload),
      onSendCastSpell: (spell, origin, vel) => mp.sendCastSpell(spell, origin, vel),
      onSendPvpDamage: (targetId, damage) => mp.sendPvpDamage(targetId, damage),
      onSendCoopEvent: (event, payload) => mp.sendCoopEvent(event, payload),
    });

    const tracker = new HandTrackerService({
      onStatusChange: (status: CameraStatus, error: string | null) => {
        const mode: InputMode = status === 'active' ? 'webcam' : 'fallback';
        engine.setInputMeta(mode, status, error);
      },
    });
    tracker.attachElements(videoRef.current, pipCanvasRef.current);
    trackerRef.current = tracker;

    let kbRaf = 0;
    let lastTs = performance.now();
    const updateKeyboardFallback = () => {
      kbRaf = requestAnimationFrame(updateKeyboardFallback);
      const now = performance.now();
      const dt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;

      const input = inputRef.current;
      const keys = heldKeysRef.current;

      if (!input.left.detected) {
        let kx = 0;
        let ky = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;

        const damp = 1 - Math.exp(-10 * dt);
        input.strafeX += (kx - input.strafeX) * damp;
        input.strafeY += (ky - input.strafeY) * damp;
        input.shieldActive =
          mouseShieldRef.current || keys.has('ShiftLeft') || keys.has('KeyF');
        input.telekinesisActive = keys.has('KeyE');
        input.manaSurgeActive = keys.has('KeyR');
      }
    };
    kbRaf = requestAnimationFrame(updateKeyboardFallback);

    return () => {
      cancelAnimationFrame(kbRaf);
      mp.dispose();
      tracker.dispose();
      engine.dispose();
      audio.dispose();
    };
  }, []);

  const handleToggleViewMode = useCallback((mode: ViewMode) => {
    engineRef.current?.setViewMode(mode);
  }, []);

  const handleStartWithWebcam = useCallback(async () => {
    audioRef.current?.init();
    const tracker = trackerRef.current;
    const engine = engineRef.current;
    if (!tracker || !engine) return;

    tracker.attachElements(videoRef.current, pipCanvasRef.current);
    const ok = await tracker.start(inputRef);
    if (ok) {
      engine.setViewMode('ar');
      engine.startNewGame();
    }
  }, []);

  const handleStartWithFallback = useCallback(() => {
    audioRef.current?.init();
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInputMeta('fallback', 'idle', null);
    engine.setViewMode('vr');
    engine.startNewGame();
  }, []);

  const handleToggleCamera = useCallback(async () => {
    audioRef.current?.init();
    const tracker = trackerRef.current;
    const engine = engineRef.current;
    if (!tracker || !engine) return;

    if (hud.cameraStatus === 'active') {
      tracker.stop();
      engine.setInputMeta('fallback', 'idle', null);
    } else {
      tracker.attachElements(videoRef.current, pipCanvasRef.current);
      await tracker.start(inputRef);
    }
  }, [hud.cameraStatus]);

  const handleSwitchToFallback = useCallback(() => {
    trackerRef.current?.stop();
    engineRef.current?.setInputMeta('fallback', 'idle', null);
    engineRef.current?.setViewMode('vr');
  }, []);

  const handleToggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.init();
    audio.setMuted(!audio.isMuted());
    engineRef.current?.emitHudSnapshot(true);
  }, []);

  const handlePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getPhase() === 'playing') {
      engine.setPhase('paused');
    } else if (engine.getPhase() === 'paused') {
      engine.setPhase('playing');
    }
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setPhase('playing');
  }, []);

  const handleRestart = useCallback(() => {
    audioRef.current?.init();
    engineRef.current?.startNewGame();
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.setPhase('title');
  }, []);

  const handleBuyOrEquipGauntlet = useCallback((id: GauntletId) => {
    audioRef.current?.init();
    engineRef.current?.buyOrEquipGauntlet(id);
  }, []);

  const handleQuickMatch = useCallback(
    (mode: 'coop' | 'pvp', playerName: string) => {
      mpRef.current?.quickMatch(mode, playerName, hud.equippedGauntlet);
    },
    [hud.equippedGauntlet],
  );

  const handleCreateRoom = useCallback(
    (mode: 'coop' | 'pvp', isPublic: boolean, playerName: string) => {
      mpRef.current?.createRoom(mode, isPublic, playerName, hud.equippedGauntlet);
    },
    [hud.equippedGauntlet],
  );

  const handleJoinRoom = useCallback(
    (code: string, playerName: string) => {
      mpRef.current?.joinRoom(code, playerName, hud.equippedGauntlet);
    },
    [hud.equippedGauntlet],
  );

  const handleLeaveRoom = useCallback(() => {
    mpRef.current?.leaveRoom();
  }, []);

  const handleLaunchMultiplayerMatch = useCallback(() => {
    audioRef.current?.init();
    setMpOpen(false);
    engineRef.current?.startNewGame();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (armoryOpen || mpOpen) {
        if (e.code === 'Escape') {
          setArmoryOpen(false);
          setMpOpen(false);
        }
        return;
      }

      if (e.repeat && e.code !== 'Space') return;
      heldKeysRef.current.add(e.code);

      const engine = engineRef.current;
      if (!engine) return;
      const phase = engine.getPhase();

      if (phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartWithFallback();
        return;
      }

      if (e.code === 'Escape') {
        if (phase === 'playing') engine.setPhase('paused');
        else if (phase === 'paused') engine.setPhase('playing');
        return;
      }

      if (e.code === 'KeyV') {
        const nextMode: ViewMode = hud.viewMode === 'ar' ? 'vr' : 'ar';
        engine.setViewMode(nextMode);
        return;
      }

      if (phase !== 'playing') return;

      const input = inputRef.current;
      if (e.code === 'Space' || e.code === 'Digit1') {
        e.preventDefault();
        input.queuedSpell = 'astral_bolt';
      } else if (e.code === 'Digit2') {
        input.queuedSpell = 'twin_starfire';
      } else if (e.code === 'Digit3') {
        input.queuedSpell = 'solar_shockwave';
      } else if (e.code === 'Digit4') {
        input.queuedSpell = 'meteor_hammer';
      } else if (e.code === 'Digit5') {
        input.queuedSpell = 'sanctum_mend';
      } else if (e.code === 'KeyQ') {
        input.queuedSpell = 'cataclysm_convergence';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      heldKeysRef.current.clear();
      mouseShieldRef.current = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      const input = inputRef.current;
      if (input.right.detected) return;
      input.aimX = (e.clientX / window.innerWidth) * 2 - 1;
      input.aimY = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (armoryOpen || mpOpen) return;
      const engine = engineRef.current;
      if (!engine || engine.getPhase() !== 'playing') return;
      if ((e.target as HTMLElement)?.closest('button')) return;

      audioRef.current?.init();
      if (e.button === 2) {
        mouseShieldRef.current = true;
      } else if (e.button === 0 && !inputRef.current.right.detected) {
        inputRef.current.queuedSpell = 'astral_bolt';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) {
        mouseShieldRef.current = false;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (engineRef.current?.getPhase() === 'playing') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [armoryOpen, mpOpen, handleStartWithFallback, hud.viewMode]);

  const showArVideo = hud.viewMode === 'ar' && hud.cameraStatus === 'active';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d1a]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`fixed inset-0 z-0 w-full h-full object-cover transition-opacity duration-200 ${
          showArVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ transform: 'scaleX(-1)' }}
      />

      {showArVideo && (
        <div
          className="fixed inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(9,13,26,0.12) 40%, rgba(9,13,26,0.58) 100%)',
          }}
        />
      )}

      <div ref={mountRef} className="fixed inset-0 z-10" />

      {hud.phase === 'title' && (
        <TitleOverlay
          bestScore={hud.bestScore}
          bankPoints={hud.bankPoints}
          equippedGauntlet={hud.equippedGauntlet}
          viewMode={hud.viewMode}
          cameraStatus={hud.cameraStatus}
          cameraError={hud.cameraError}
          mpStatus={mpStatus}
          onToggleViewMode={handleToggleViewMode}
          onStartWithWebcam={handleStartWithWebcam}
          onStartWithFallback={handleStartWithFallback}
          onOpenArmory={() => setArmoryOpen(true)}
          onOpenMultiplayer={() => setMpOpen(true)}
        />
      )}

      {hud.phase !== 'title' && (
        <HudOverlay
          hud={hud}
          mpStatus={mpStatus}
          pipCanvasRef={pipCanvasRef}
          onToggleViewMode={handleToggleViewMode}
          onToggleCamera={handleToggleCamera}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onOpenArmory={() => {
            if (hud.phase === 'playing') engineRef.current?.setPhase('paused');
            setArmoryOpen(true);
          }}
          onOpenMultiplayer={() => {
            if (hud.phase === 'playing') engineRef.current?.setPhase('paused');
            setMpOpen(true);
          }}
          onSwitchToFallback={handleSwitchToFallback}
        />
      )}

      {(hud.phase === 'paused' || hud.phase === 'gameover') &&
        !armoryOpen &&
        !mpOpen && (
          <ModalOverlay
            hud={hud}
            onResume={handleResume}
            onRestart={handleRestart}
            onReturnTitle={handleReturnTitle}
            onOpenArmory={() => setArmoryOpen(true)}
          />
        )}

      {armoryOpen && (
        <ArmoryModal
          bankPoints={hud.bankPoints}
          equippedGauntlet={hud.equippedGauntlet}
          unlockedGauntlets={hud.unlockedGauntlets}
          onBuyOrEquip={handleBuyOrEquipGauntlet}
          onClose={() => setArmoryOpen(false)}
        />
      )}

      {mpOpen && (
        <MultiplayerModal
          status={mpStatus}
          initialJoinCode={initialRoomCode}
          onQuickMatch={handleQuickMatch}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={handleLeaveRoom}
          onLaunchMatch={handleLaunchMultiplayerMatch}
          onClose={() => setMpOpen(false)}
        />
      )}
    </div>
  );
}
