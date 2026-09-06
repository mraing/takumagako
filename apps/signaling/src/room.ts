/**
 * 房间注册表：纯逻辑，与 WebSocket 解耦（单测覆盖）。
 * 规则（§8.4）：单房间 ≤2 人；10 分钟未配对回收；单 IP 每分钟建房 ≤10 次。
 * 转发语义：offer/answer/ice 原样投递给"房间里的另一个人"。
 */
import type { SignalMsg } from '@takumagako/protocol';

export interface SignalSocket {
  id: string;
  ip: string;
  send(msg: SignalMsg): void;
  close(): void;
}

interface Room {
  code: string;
  members: [string, string?]; // [hostId, guestId?]
  createdAt: number;
  paired: boolean;
}

export interface RoomConfig {
  /** 未配对房间回收时长（ms），默认 10 分钟 */
  unpairedTtlMs?: number;
  /** 单 IP 每分钟建房上限 */
  createRatePerMin?: number;
  /** 房间号位数 */
  digits?: number;
  now?: () => number;
}

export class RoomHub {
  private readonly rooms = new Map<string, Room>();
  private readonly socketRooms = new Map<string, string>(); // socketId → roomCode
  private readonly sockets = new Map<string, SignalSocket>();
  private readonly createLogs = new Map<string, number[]>(); // ip → 建房时间戳
  private readonly unpairedTtlMs: number;
  private readonly createRatePerMin: number;
  private readonly digits: number;
  private readonly now: () => number;

  constructor(cfg: RoomConfig = {}) {
    this.unpairedTtlMs = cfg.unpairedTtlMs ?? 10 * 60_000;
    this.createRatePerMin = cfg.createRatePerMin ?? 10;
    this.digits = cfg.digits ?? 6;
    this.now = cfg.now ?? Date.now;
  }

  // ---- 连接管理（server.ts 调用）----

  attach(socket: SignalSocket): void {
    this.sockets.set(socket.id, socket);
  }

  detach(socket: SignalSocket): void {
    this.leave(socket.id);
    this.sockets.delete(socket.id);
  }

  // ---- 信令操作 ----

  create(socket: SignalSocket): void {
    this.sweep();
    if (this.isRateLimited(socket.ip)) {
      socket.send({ t: 'error', reason: '创建太频繁，稍后再试' });
      return;
    }
    const code = this.genCode();
    this.rooms.set(code, { code, members: [socket.id], createdAt: this.now(), paired: false });
    this.socketRooms.set(socket.id, code);
    socket.send({ t: 'room_created', room: code });
  }

  join(socket: SignalSocket, code: string): void {
    this.sweep();
    const room = this.rooms.get(code);
    if (!room) return void socket.send({ t: 'room_gone' });
    if (room.members[1] || room.members[0] === socket.id) {
      return void socket.send({ t: 'room_full' });
    }
    room.members = [room.members[0], socket.id];
    room.paired = true;
    this.socketRooms.set(socket.id, code);
    socket.send({ t: 'joined', room: code });
    this.byId(room.members[0])?.send({ t: 'peer_joined' });
  }

  /** 把 offer/answer/ice 原样转发给同房间的另一个人 */
  forward(socketId: string, msg: Extract<SignalMsg, { t: 'offer' | 'answer' | 'ice' }>): void {
    const code = this.socketRooms.get(socketId);
    if (!code) return;
    const [a, b] = this.rooms.get(code)?.members ?? [];
    const peer = socketId === a ? b : a;
    if (peer) this.byId(peer)?.send(msg);
  }

  leave(socketId: string): void {
    const code = this.socketRooms.get(socketId);
    this.socketRooms.delete(socketId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const [a, b] = room.members;
    const other = socketId === a ? b : a;
    if (other) this.byId(other)?.send({ t: 'peer_left' });
    this.rooms.delete(code); // 任一人离开即拆房（拜访是两人游戏）
  }

  roomOf(socketId: string): string | null {
    return this.socketRooms.get(socketId) ?? null;
  }

  // ---- 内部 ----

  private sweep(): void {
    const t = this.now();
    for (const [code, room] of this.rooms) {
      if (!room.paired && t - room.createdAt > this.unpairedTtlMs) {
        this.closeRoom(code);
      }
    }
  }

  private closeRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const id of room.members) {
      if (id) {
        this.socketRooms.delete(id);
        this.byId(id)?.send({ t: 'room_gone' });
      }
    }
    this.rooms.delete(code);
  }

  private genCode(): string {
    const min = 10 ** (this.digits - 1);
    for (let i = 0; i < 50; i++) {
      const code = String(min + Math.floor(Math.random() * min));
      if (!this.rooms.has(code)) return code;
    }
    return String(this.now() % min).padStart(this.digits, '0');
  }

  private isRateLimited(ip: string): boolean {
    const t = this.now();
    const list = (this.createLogs.get(ip) ?? []).filter((x) => t - x < 60_000);
    list.push(t);
    this.createLogs.set(ip, list);
    return list.length > this.createRatePerMin;
  }

  private byId(id: string): SignalSocket | undefined {
    return this.sockets.get(id);
  }
}

/** 信令消息入口（server.ts 的 ws.onmessage 调用） */
export function handleSignal(hub: RoomHub, socket: SignalSocket, msg: SignalMsg): void {
  switch (msg.t) {
    case 'create_room':
      hub.create(socket);
      break;
    case 'join':
      hub.join(socket, msg.room);
      break;
    case 'offer':
    case 'answer':
    case 'ice':
      hub.forward(socket.id, msg);
      break;
    case 'leave':
      hub.leave(socket.id);
      break;
    case 'ping':
      socket.send({ t: 'pong' });
      break;
    default:
      break;
  }
}
