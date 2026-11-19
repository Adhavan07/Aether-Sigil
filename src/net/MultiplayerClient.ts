import {
  GauntletId,
  MatchMode,
  MultiplayerStatus,
  PublicRoomSummary,
  RoomPlayerState,
} from '../types/game';

export interface RemoteCastEvent {
  playerId: string;
  spell: string;
  gauntletId: GauntletId;
  origin: [number, number, number];
  vel: [number, number, number];
}

export interface CoopEventMessage {
  senderId: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface MultiplayerCallbacks {
  onStatusChange: (status: MultiplayerStatus) => void;
  onRemoteCast: (ev: RemoteCastEvent) => void;
  onPvpHit: (targetId: string, attackerId: string, damage: number) => void;
  onCoopEvent: (ev: CoopEventMessage) => void;
  onRoomJoinedStart?: (mode: 'coop' | 'pvp') => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private hasEverConnected = false;
  private failedAttempts = 0;
  private readonly callbacks: MultiplayerCallbacks;

  private status: MultiplayerStatus = {
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

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  public getStatus(): MultiplayerStatus {
    return this.status;
  }

  public connect(): void {
    if (this.disposed || this.ws) return;
    this.status = { ...this.status, connecting: true, error: null };
    this.emitStatus();

    const customWs = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_WS_URL;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = customWs || `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.hasEverConnected = true;
      this.failedAttempts = 0;
      this.status = {
        ...this.status,
        connected: true,
        connecting: false,
        error: null,
      };
      this.emitStatus();
      this.send({ type: 'list_rooms' });
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const type = String(msg.type ?? '');

      if (type === 'public_rooms') {
        this.status = {
          ...this.status,
          publicRooms: (msg.rooms as PublicRoomSummary[]) ?? [],
        };
        this.emitStatus();
        return;
      }

      if (type === 'room_error') {
        this.status = {
          ...this.status,
          error: String(msg.error ?? 'Room error'),
        };
        this.emitStatus();
        return;
      }

      if (type === 'room_joined' || type === 'room_state') {
        const players = (msg.players as RoomPlayerState[]) ?? [];
        const playerId =
          type === 'room_joined'
            ? String(msg.playerId ?? '')
            : this.status.playerId;
        const mode = msg.mode === 'pvp' ? 'pvp' : 'coop';
        const hostId = String(msg.hostId ?? '');
        this.status = {
          ...this.status,
          roomCode: String(msg.code ?? ''),
          matchMode: mode,
          playerId,
          isHost: Boolean(playerId && hostId === playerId),
          players,
          error: null,
        };
        this.emitStatus();
        if (type === 'room_joined') {
          this.callbacks.onRoomJoinedStart?.(mode);
        }
        return;
      }

      if (type === 'player_delta') {
        const incoming = msg.player as RoomPlayerState | undefined;
        if (!incoming) return;
        const existingIdx = this.status.players.findIndex(
          (p) => p.id === incoming.id,
        );
        const nextPlayers = this.status.players.slice();
        if (existingIdx >= 0) {
          nextPlayers[existingIdx] = incoming;
        } else {
          nextPlayers.push(incoming);
        }
        this.status = { ...this.status, players: nextPlayers };
        this.emitStatus();
        return;
      }

      if (type === 'remote_cast') {
        this.callbacks.onRemoteCast({
          playerId: String(msg.playerId ?? ''),
          spell: String(msg.spell ?? 'astral_bolt'),
          gauntletId: (msg.gauntletId as GauntletId) ?? 'arcane',
          origin: (msg.origin as [number, number, number]) ?? [0, 0, 2],
          vel: (msg.vel as [number, number, number]) ?? [0, 0, -20],
        });
        return;
      }

      if (type === 'pvp_hit') {
        this.callbacks.onPvpHit(
          String(msg.targetId ?? ''),
          String(msg.attackerId ?? ''),
          Number(msg.damage) || 12,
        );
        return;
      }

      if (type === 'coop_event') {
        this.callbacks.onCoopEvent({
          senderId: String(msg.senderId ?? ''),
          event: String(msg.event ?? ''),
          payload: (msg.payload as Record<string, unknown>) ?? {},
        });
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.failedAttempts += 1;
      const staticHostOffline = !this.hasEverConnected && this.failedAttempts >= 2;
      this.status = {
        ...this.status,
        connected: false,
        connecting: false,
        error: staticHostOffline
          ? 'Live WebSocket relay is unavailable on static hosting. Play Solo Arena & Gauntlet Forge locally, or run `npm run dev` / configure VITE_WS_URL for online rooms.'
          : this.status.error,
      };
      this.emitStatus();
      if (!this.disposed && !staticHostOffline) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2200);
      }
    };
  }

  public createRoom(
    mode: 'coop' | 'pvp',
    isPublic: boolean,
    playerName: string,
    gauntletId: GauntletId,
  ): void {
    this.status = { ...this.status, playerName };
    this.send({
      type: 'create_room',
      mode,
      isPublic,
      playerName,
      gauntletId,
    });
  }

  public quickMatch(
    mode: 'coop' | 'pvp',
    playerName: string,
    gauntletId: GauntletId,
  ): void {
    this.status = { ...this.status, playerName };
    this.send({
      type: 'quick_match',
      mode,
      playerName,
      gauntletId,
    });
  }

  public joinRoom(
    code: string,
    playerName: string,
    gauntletId: GauntletId,
  ): void {
    this.status = { ...this.status, playerName };
    this.send({
      type: 'join_room',
      code: code.trim().toUpperCase(),
      playerName,
      gauntletId,
    });
  }

  public leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.status = {
      ...this.status,
      roomCode: null,
      matchMode: 'solo',
      playerId: null,
      isHost: false,
      players: [],
      error: null,
    };
    this.emitStatus();
  }

  public setLocalMode(matchMode: MatchMode): void {
    if (matchMode === 'solo' && this.status.roomCode) {
      this.leaveRoom();
      return;
    }
    this.status = { ...this.status, matchMode };
    this.emitStatus();
  }

  public sendPlayerUpdate(payload: Omit<RoomPlayerState, 'id' | 'name' | 'maxHp'>): void {
    if (!this.status.roomCode) return;
    this.send({ type: 'player_update', ...payload });
  }

  public sendCastSpell(
    spell: string,
    origin: [number, number, number],
    vel: [number, number, number],
  ): void {
    if (!this.status.roomCode) return;
    this.send({ type: 'cast_spell', spell, origin, vel });
  }

  public sendPvpDamage(targetId: string, damage: number): void {
    if (!this.status.roomCode || this.status.matchMode !== 'pvp') return;
    this.send({ type: 'pvp_damage', targetId, damage });
  }

  public sendCoopEvent(event: string, payload: Record<string, unknown>): void {
    if (!this.status.roomCode || this.status.matchMode !== 'coop') return;
    this.send({ type: 'coop_event', event, payload });
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private emitStatus(): void {
    this.callbacks.onStatusChange({ ...this.status });
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
