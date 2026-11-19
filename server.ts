import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MatchMode = 'coop' | 'pvp';

interface ServerPlayer {
  id: string;
  name: string;
  gauntletId: string;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  leftSign: string;
  rightSign: string;
  shieldActive: boolean;
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
  ws: WebSocket;
}

interface Room {
  code: string;
  mode: MatchMode;
  isPublic: boolean;
  hostId: string;
  wave: number;
  maxPlayers: number;
  players: Map<string, ServerPlayer>;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const clientRoom = new Map<WebSocket, { roomCode: string; playerId: string }>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

function serializePlayer(p: ServerPlayer) {
  return {
    id: p.id,
    name: p.name,
    gauntletId: p.gauntletId,
    x: p.x,
    y: p.y,
    aimX: p.aimX,
    aimY: p.aimY,
    leftSign: p.leftSign,
    rightSign: p.rightSign,
    shieldActive: p.shieldActive,
    hp: p.hp,
    maxHp: p.maxHp,
    score: p.score,
    kills: p.kills,
  };
}

function getPublicRoomsSummary() {
  const list: Array<{
    code: string;
    mode: MatchMode;
    playerCount: number;
    maxPlayers: number;
    wave: number;
    hostName: string;
  }> = [];
  for (const room of rooms.values()) {
    if (!room.isPublic || room.players.size === 0) continue;
    const host = room.players.get(room.hostId);
    list.push({
      code: room.code,
      mode: room.mode,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      wave: room.wave,
      hostName: host?.name ?? 'Caster',
    });
  }
  return list;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: Room, payload: unknown, exceptWs?: WebSocket): void {
  const raw = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.ws !== exceptWs && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(raw);
    }
  }
}

function broadcastPublicRooms(wss: WebSocketServer): void {
  const raw = JSON.stringify({
    type: 'public_rooms',
    rooms: getPublicRoomsSummary(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  }
}

function removeFromCurrentRoom(ws: WebSocket, wss: WebSocketServer): void {
  const meta = clientRoom.get(ws);
  if (!meta) return;
  clientRoom.delete(ws);

  const room = rooms.get(meta.roomCode);
  if (!room) return;

  room.players.delete(meta.playerId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
  } else {
    if (room.hostId === meta.playerId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) {
        room.hostId = nextHost.id;
      }
    }
    broadcastRoom(room, {
      type: 'room_state',
      code: room.code,
      mode: room.mode,
      hostId: room.hostId,
      wave: room.wave,
      players: Array.from(room.players.values()).map(serializePlayer),
    });
  }
  broadcastPublicRooms(wss);
}

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomsSummary() });
  });

  wss.on('connection', (ws) => {
    sendJson(ws, { type: 'public_rooms', rooms: getPublicRoomsSummary() });

    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      const type = String(msg.type ?? '');

      if (type === 'list_rooms') {
        sendJson(ws, { type: 'public_rooms', rooms: getPublicRoomsSummary() });
        return;
      }

      if (type === 'create_room' || type === 'quick_match') {
        removeFromCurrentRoom(ws, wss);
        const mode: MatchMode = msg.mode === 'pvp' ? 'pvp' : 'coop';
        const isPublic = type === 'quick_match' ? true : Boolean(msg.isPublic);
        const playerName = String(msg.playerName ?? 'Caster').slice(0, 18) || 'Caster';
        const gauntletId = String(msg.gauntletId ?? 'arcane');

        if (type === 'quick_match') {
          for (const existing of rooms.values()) {
            if (
              existing.isPublic &&
              existing.mode === mode &&
              existing.players.size < existing.maxPlayers
            ) {
              const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;
              const player: ServerPlayer = {
                id: playerId,
                name: playerName,
                gauntletId,
                x: (existing.players.size - 1) * 2.1,
                y: 0,
                aimX: 0,
                aimY: 0,
                leftSign: 'none',
                rightSign: 'none',
                shieldActive: false,
                hp: 100,
                maxHp: 100,
                score: 0,
                kills: 0,
                ws,
              };
              existing.players.set(playerId, player);
              clientRoom.set(ws, { roomCode: existing.code, playerId });

              sendJson(ws, {
                type: 'room_joined',
                code: existing.code,
                mode: existing.mode,
                playerId,
                hostId: existing.hostId,
                wave: existing.wave,
                players: Array.from(existing.players.values()).map(serializePlayer),
              });
              broadcastRoom(
                existing,
                {
                  type: 'room_state',
                  code: existing.code,
                  mode: existing.mode,
                  hostId: existing.hostId,
                  wave: existing.wave,
                  players: Array.from(existing.players.values()).map(serializePlayer),
                },
                ws,
              );
              broadcastPublicRooms(wss);
              return;
            }
          }
        }

        const code = generateCode();
        const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;
        const player: ServerPlayer = {
          id: playerId,
          name: playerName,
          gauntletId,
          x: -1.4,
          y: 0,
          aimX: 0,
          aimY: 0,
          leftSign: 'none',
          rightSign: 'none',
          shieldActive: false,
          hp: 100,
          maxHp: 100,
          score: 0,
          kills: 0,
          ws,
        };

        const room: Room = {
          code,
          mode,
          isPublic,
          hostId: playerId,
          wave: 1,
          maxPlayers: 4,
          players: new Map([[playerId, player]]),
          createdAt: Date.now(),
        };
        rooms.set(code, room);
        clientRoom.set(ws, { roomCode: code, playerId });

        sendJson(ws, {
          type: 'room_joined',
          code,
          mode,
          playerId,
          hostId: room.hostId,
          wave: room.wave,
          players: [serializePlayer(player)],
        });
        broadcastPublicRooms(wss);
        return;
      }

      if (type === 'join_room') {
        const code = String(msg.code ?? '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'room_error', error: `Room "${code}" not found.` });
          return;
        }
        if (room.players.size >= room.maxPlayers) {
          sendJson(ws, { type: 'room_error', error: `Room "${code}" is full.` });
          return;
        }

        removeFromCurrentRoom(ws, wss);
        const playerName = String(msg.playerName ?? 'Caster').slice(0, 18) || 'Caster';
        const gauntletId = String(msg.gauntletId ?? 'arcane');
        const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;

        const player: ServerPlayer = {
          id: playerId,
          name: playerName,
          gauntletId,
          x: (room.players.size - 0.5) * 2.1,
          y: 0,
          aimX: 0,
          aimY: 0,
          leftSign: 'none',
          rightSign: 'none',
          shieldActive: false,
          hp: 100,
          maxHp: 100,
          score: 0,
          kills: 0,
          ws,
        };
        room.players.set(playerId, player);
        clientRoom.set(ws, { roomCode: code, playerId });

        sendJson(ws, {
          type: 'room_joined',
          code: room.code,
          mode: room.mode,
          playerId,
          hostId: room.hostId,
          wave: room.wave,
          players: Array.from(room.players.values()).map(serializePlayer),
        });
        broadcastRoom(
          room,
          {
            type: 'room_state',
            code: room.code,
            mode: room.mode,
            hostId: room.hostId,
            wave: room.wave,
            players: Array.from(room.players.values()).map(serializePlayer),
          },
          ws,
        );
        broadcastPublicRooms(wss);
        return;
      }

      if (type === 'leave_room') {
        removeFromCurrentRoom(ws, wss);
        return;
      }

      // Room-scoped real-time messages
      const meta = clientRoom.get(ws);
      if (!meta) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const sender = room.players.get(meta.playerId);
      if (!sender) return;

      if (type === 'player_update') {
        sender.x = Number(msg.x) || 0;
        sender.y = Number(msg.y) || 0;
        sender.aimX = Number(msg.aimX) || 0;
        sender.aimY = Number(msg.aimY) || 0;
        sender.leftSign = String(msg.leftSign ?? 'none');
        sender.rightSign = String(msg.rightSign ?? 'none');
        sender.shieldActive = Boolean(msg.shieldActive);
        sender.gauntletId = String(msg.gauntletId ?? sender.gauntletId);
        sender.hp = Math.max(0, Math.min(100, Number(msg.hp) || 0));
        sender.score = Number(msg.score) || 0;
        sender.kills = Number(msg.kills) || 0;

        broadcastRoom(
          room,
          {
            type: 'player_delta',
            player: serializePlayer(sender),
          },
          ws,
        );
        return;
      }

      if (type === 'cast_spell') {
        broadcastRoom(
          room,
          {
            type: 'remote_cast',
            playerId: sender.id,
            spell: msg.spell,
            gauntletId: sender.gauntletId,
            origin: msg.origin,
            vel: msg.vel,
          },
          ws,
        );
        return;
      }

      if (type === 'pvp_damage' && room.mode === 'pvp') {
        const targetId = String(msg.targetId ?? '');
        const dmg = Math.max(1, Math.min(80, Number(msg.damage) || 12));
        const target = room.players.get(targetId);
        if (target && target.id !== sender.id) {
          broadcastRoom(room, {
            type: 'pvp_hit',
            targetId: target.id,
            attackerId: sender.id,
            damage: dmg,
          });
        }
        return;
      }

      if (type === 'coop_event' && room.mode === 'coop') {
        if (msg.event === 'wave_sync' && room.hostId === sender.id) {
          room.wave = Number(msg.wave) || room.wave;
        }
        broadcastRoom(
          room,
          {
            type: 'coop_event',
            senderId: sender.id,
            event: msg.event,
            payload: msg.payload,
          },
          ws,
        );
        return;
      }
    });

    ws.on('close', () => {
      removeFromCurrentRoom(ws, wss);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url ?? '';
    if (reqUrl === '/ws' || reqUrl.startsWith('/ws?')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(3000, '0.0.0.0', () => {
    console.log('Aether Sigil server listening on http://0.0.0.0:3000');
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
