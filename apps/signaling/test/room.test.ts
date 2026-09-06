/** RoomHub 房间规则单测：配对 / 满房 / 转发 / 拆房 / 限流 / 回收 */
import { describe, expect, it, vi } from 'vitest';
import type { SignalMsg } from '@takumagako/protocol';
import { handleSignal, RoomHub, type SignalSocket } from '../src/room';

function fakeSocket(id: string, ip = 'ip-1'): SignalSocket & { sent: SignalMsg[] } {
  const sent: SignalMsg[] = [];
  return {
    id,
    ip,
    sent,
    send: (m) => sent.push(m),
    close: () => {},
  };
}

describe('RoomHub', () => {
  it('建房 → 加入 → 双方收到配对通知', () => {
    const hub = new RoomHub();
    const host = fakeSocket('host');
    const guest = fakeSocket('guest');
    hub.attach(host);
    hub.attach(guest);
    handleSignal(hub, host, { t: 'create_room' });
    const created = host.sent.at(-1)!;
    expect(created.t).toBe('room_created');
    handleSignal(hub, guest, { t: 'join', room: (created as any).room });
    expect(guest.sent.at(-1)?.t).toBe('joined');
    expect(host.sent.at(-1)?.t).toBe('peer_joined');
  });

  it('第三人加入 → room_full；空房间号 → room_gone', () => {
    const hub = new RoomHub();
    const s1 = fakeSocket('a');
    const s2 = fakeSocket('b');
    const s3 = fakeSocket('c');
    for (const s of [s1, s2, s3]) hub.attach(s);
    handleSignal(hub, s1, { t: 'create_room' });
    const room = (s1.sent.at(-1) as any).room;
    handleSignal(hub, s2, { t: 'join', room });
    handleSignal(hub, s3, { t: 'join', room });
    expect(s3.sent.at(-1)?.t).toBe('room_full');
    handleSignal(hub, s3, { t: 'join', room: '999999' });
    expect(s3.sent.at(-1)?.t).toBe('room_gone');
  });

  it('offer/answer/ice 只转发给对方', () => {
    const hub = new RoomHub();
    const host = fakeSocket('h');
    const guest = fakeSocket('g');
    for (const s of [host, guest]) hub.attach(s);
    handleSignal(hub, host, { t: 'create_room' });
    const room = (host.sent.at(-1) as any).room;
    handleSignal(hub, guest, { t: 'join', room });
    host.sent.length = 0;
    guest.sent.length = 0;

    handleSignal(hub, host, { t: 'offer', sdp: 'OFFER' });
    expect(guest.sent.at(-1)).toEqual({ t: 'offer', sdp: 'OFFER' });
    handleSignal(hub, guest, { t: 'answer', sdp: 'ANSWER' });
    expect(host.sent.at(-1)).toEqual({ t: 'answer', sdp: 'ANSWER' });
    handleSignal(hub, host, { t: 'ice', candidate: 'C1' });
    expect(guest.sent.at(-1)).toEqual({ t: 'ice', candidate: 'C1' });
  });

  it('任一人离开 → 房间拆除 + 对方收到 peer_left', () => {
    const hub = new RoomHub();
    const host = fakeSocket('h');
    const guest = fakeSocket('x');
    for (const s of [host, guest]) hub.attach(s);
    handleSignal(hub, host, { t: 'create_room' });
    const room = (host.sent.at(-1) as any).room;
    handleSignal(hub, guest, { t: 'join', room });
    hub.leave(host.id);
    expect(guest.sent.at(-1)?.t).toBe('peer_left');
    // 旧房已不可再加入
    const late = fakeSocket('z');
    hub.attach(late);
    handleSignal(hub, late, { t: 'join', room });
    expect(late.sent.at(-1)?.t).toBe('room_gone');
  });

  it('单 IP 每分钟建房 ≤10 次（第 11 次被拒）', () => {
    const hub = new RoomHub();
    const s = fakeSocket('r');
    hub.attach(s);
    for (let i = 0; i < 10; i++) handleSignal(hub, s, { t: 'create_room' });
    handleSignal(hub, s, { t: 'create_room' });
    expect(s.sent.at(-1)?.t).toBe('error');
  });

  it('10 分钟未配对 → 房间回收（room_gone）', () => {
    const t = { v: 1_000_000 };
    const hub = new RoomHub({ now: () => t.v });
    const host = fakeSocket('h2');
    const late = fakeSocket('g2');
    for (const s of [host, late]) hub.attach(s);
    handleSignal(hub, host, { t: 'create_room' });
    const room = (host.sent.at(-1) as any).room;
    t.v += 11 * 60_000;
    handleSignal(hub, late, { t: 'join', room });
    expect(late.sent.at(-1)?.t).toBe('room_gone');
  });
});
