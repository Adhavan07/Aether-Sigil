export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type ViewMode = 'ar' | 'vr';

export type InputMode = 'webcam' | 'fallback';

export type MatchMode = 'solo' | 'coop' | 'pvp';

export type GauntletId =
  | 'arcane'
  | 'iron_man'
  | 'doctor_strange'
  | 'doctor_doom'
  | 'thanos';

export type CameraStatus =
  | 'idle'
  | 'loading'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'error';

export type HandSign =
  | 'none'
  | 'open_palm'
  | 'fist'
  | 'point'
  | 'peace'
  | 'pinch'
  | 'thumbs_up';

export type SpellType =
  | 'astral_bolt'
  | 'twin_starfire'
  | 'solar_shockwave'
  | 'meteor_hammer'
  | 'sanctum_mend'
  | 'aegis_ward'
  | 'telekinetic_lock'
  | 'cataclysm_convergence';

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface HandSnapshot {
  detected: boolean;
  palmX: number;
  palmY: number;
  palmZ: number;
  sign: HandSign;
  confidence: number;
  landmarks: LandmarkPoint[];
}

export interface PlayerInputState {
  left: HandSnapshot;
  right: HandSnapshot;
  strafeX: number;
  strafeY: number;
  aimX: number;
  aimY: number;
  queuedSpell: SpellType | null;
  shieldActive: boolean;
  telekinesisActive: boolean;
  manaSurgeActive: boolean;
  meteorCharging: boolean;
  meteorChargeRatio: number;
}

export interface SpellCooldowns {
  astral_bolt: number;
  twin_starfire: number;
  solar_shockwave: number;
  meteor_hammer: number;
  sanctum_mend: number;
}

export interface RoomPlayerState {
  id: string;
  name: string;
  gauntletId: GauntletId;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  leftSign: HandSign;
  rightSign: HandSign;
  shieldActive: boolean;
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
}

export interface PublicRoomSummary {
  code: string;
  mode: 'coop' | 'pvp';
  playerCount: number;
  maxPlayers: number;
  wave: number;
  hostName: string;
}

export interface MultiplayerStatus {
  connected: boolean;
  connecting: boolean;
  roomCode: string | null;
  matchMode: MatchMode;
  playerId: string | null;
  playerName: string;
  isHost: boolean;
  players: RoomPlayerState[];
  publicRooms: PublicRoomSummary[];
  error: string | null;
}

export interface GameHudSnapshot {
  phase: GamePhase;
  viewMode: ViewMode;
  inputMode: InputMode;
  matchMode: MatchMode;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  health: number;
  maxHealth: number;
  resonance: number;
  wave: number;
  enemiesRemaining: number;
  score: number;
  bankPoints: number;
  equippedGauntlet: GauntletId;
  unlockedGauntlets: GauntletId[];
  combo: number;
  kills: number;
  parries: number;
  casts: number;
  bestScore: number;
  leftDetected: boolean;
  rightDetected: boolean;
  leftSign: HandSign;
  rightSign: HandSign;
  lastCastLabel: string | null;
  waveBanner: string | null;
  cooldowns: SpellCooldowns;
  meteorCharge: number;
  shieldActive: boolean;
  chronoSlowTimer: number;
  isMuted: boolean;
}
