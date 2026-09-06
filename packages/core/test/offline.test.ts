import { describe, expect, it } from 'vitest';
import { advance, createPet, mulberry32, OFFLINE_SETTLE_CAP_MS, type PetState } from '../src';

const T0 = new Date(2025, 0, 6, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

function hatchedPet(seed = 5): PetState {
  const s = createPet({ id: 'p', name: '小蛋', now: T0, rng: mulberry32(seed) });
  advance(s, T0 + 6 * MIN, mulberry32(seed));
  return s;
}

describe('离线结算（ADR-01）', () => {
  it('关闭 3 小时后回来：按真实时长结算，爱心按速率衰减', () => {
    const s = hatchedPet();
    // baby：12 分钟 1 颗 → 3h 掉 4 颗到底并触发叫唤/失误
    const ev = advance(s, T0 + 6 * MIN + 3 * HOUR, mulberry32(5));
    expect(s.hungerHearts).toBe(0);
    expect(ev.some((e) => e.type === 'call' && e.kind === 'need')).toBe(true);
  });

  it('离线结算封顶 8h：离开 24h 只结算 8h', () => {
    const s = hatchedPet();
    // 跳到入夜前：睡眠中不掉爱心也不会死，可专注验证"封顶"语义
    s.stage = 'child';
    s.characterId = 'child';
    s.stageSince = T0;
    s.updatedAt = new Date(2025, 0, 6, 20, 0, 0).getTime(); // 20:00
    const anchor = s.updatedAt;
    advance(s, anchor + 24 * HOUR, mulberry32(5));
    expect(s.updatedAt).toBe(anchor + OFFLINE_SETTLE_CAP_MS);
  });

  it('时间回拨保护：now < updatedAt 不产生任何结算', () => {
    const s = hatchedPet();
    const snapshot = { ...s };
    const ev = advance(s, s.updatedAt - 10 * MIN, mulberry32(5));
    expect(ev).toHaveLength(0);
    expect(s.updatedAt).toBe(snapshot.updatedAt);
    expect(s.hungerHearts).toBe(snapshot.hungerHearts);
  });

  it('死亡后不再结算，锚点仍可推进', () => {
    const s = hatchedPet();
    s.stage = 'dead';
    s.characterId = 'angel';
    s.deadAt = s.updatedAt;
    s.deathCause = 'sickness';
    const ev = advance(s, s.updatedAt + 2 * HOUR, mulberry32(5));
    expect(ev).toHaveLength(0);
    expect(s.stage).toBe('dead');
  });

  it('回归：增量 250ms 节拍推进必须正常结算（防边界漂移）', () => {
    const s = hatchedPet(); // baby @ 12:06，清醒
    let t = s.updatedAt;
    for (let i = 0; i < 2880; i++) {
      t += 250;
      advance(s, t, mulberry32(5));
    } // 12 分钟 → 饱食应掉 1 心
    expect(s.hungerHearts).toBe(3);
    expect(t - (T0 + 6 * MIN)).toBe(12 * MIN);
  });

  it('回归：增量节拍下到点入睡（child 21:00）', () => {
    const s = hatchedPet();
    s.stage = 'child';
    s.characterId = 'child';
    s.updatedAt = T0 + 9 * HOUR - 60 * 1000; // 20:59
    let t = s.updatedAt;
    for (let i = 0; i < 240; i++) {
      t += 250;
      advance(s, t, mulberry32(5));
    } // 推进 60s → 跨过 21:00
    expect(s.sleeping).toBe(true);
  });
});
