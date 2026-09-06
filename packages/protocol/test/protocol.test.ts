/** NetMsg / SignalMsg 编解码单测（§10 协议测试） */
import { describe, expect, it } from 'vitest';
import {
  decodeMsg,
  decodeSignal,
  encodeMsg,
  encodeSignal,
  netMsgSchema,
  signalMsgSchema,
} from '../src/index';

const PROFILE = {
  id: 'pet-1',
  name: '小蛋',
  characterId: 'child',
  stage: 'child',
  generation: 1,
  ageYears: 0,
} as const;

describe('NetMsg 应用层协议', () => {
  it('每个类型都能正/反序列化', () => {
    const samples: Array<Parameters<typeof encodeMsg>[0]> = [
      { t: 'hello', pet: PROFILE },
      { t: 'hello_ack', pet: PROFILE },
      { t: 'visit_start' },
      { t: 'visit_state', mood: 'visited', action: 'play' },
      { t: 'visit_end' },
      { t: 'gift', gift: { kind: 'snack', id: 'g1' } },
      { t: 'gift_ack', accepted: true },
      { t: 'game_invite', game: 'rps' },
      { t: 'game_commit', round: 0, hash: 'abc' },
      { t: 'game_reveal', round: 0, move: 'rock', nonce: 'n1' },
      { t: 'game_move', round: 0, move: 'left' },
      { t: 'game_result', round: 0, winner: 'me' },
      { t: 'ping' },
      { t: 'pong' },
      { t: 'bye', reason: '下次再玩' },
    ];
    for (const m of samples) {
      expect(decodeMsg(encodeMsg(m))).toEqual(m);
    }
  });

  it('非法消息被拒', () => {
    expect(() => decodeMsg('{"t":"unknown"}')).toThrow();
    expect(() => decodeMsg('{"t":"gift","gift":{"kind":"nuclear","id":"x"}}')).toThrow();
    expect(() => decodeMsg('not json')).toThrow();
    expect(() => decodeMsg('{"t":"hello","pet":{"id":"x"}}')).toThrow(); // pet 缺字段
  });

  it('schema 拒绝越界值', () => {
    expect(() => netMsgSchema.parse({ t: 'hello', pet: { ...PROFILE, name: 'x'.repeat(20) } })).toThrow();
    expect(() => netMsgSchema.parse({ t: 'gift', gift: { kind: 'toy' } })).toThrow(); // 缺 id
  });
});

describe('SignalMsg 信令层', () => {
  it('每个信令都能正/反序列化', () => {
    const samples: Array<Parameters<typeof encodeSignal>[0]> = [
      { t: 'create_room' },
      { t: 'room_created', room: '482916' },
      { t: 'join', room: '482916' },
      { t: 'joined', room: '482916' },
      { t: 'peer_joined' },
      { t: 'peer_left' },
      { t: 'room_full' },
      { t: 'room_gone' },
      { t: 'offer', sdp: 'x' },
      { t: 'answer', sdp: 'x' },
      { t: 'ice', candidate: 'x' },
      { t: 'error', reason: 'r' },
      { t: 'ping' },
      { t: 'pong' },
    ];
    for (const m of samples) {
      expect(decodeSignal(encodeSignal(m))).toEqual(m);
    }
  });

  it('非法信令被拒', () => {
    expect(() => decodeSignal('{"t":"hack"}')).toThrow();
    expect(() => decodeSignal('{}')).toThrow();
  });
});
