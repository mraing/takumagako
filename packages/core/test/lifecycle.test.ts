import { describe, expect, it } from 'vitest';
import {
  advance,
  createPet,
  feedMeal,
  mulberry32,
  BALANCE,
  CHILD_GROWTH_MS,
  HUNGER_ZERO_MISTAKE_MS,
  SICK_DEATH_MS,
  TEEN_GROWTH_MS,
  type PetEvent,
  type PetState,
} from '../src';

/** 本地 2025-01-06 12:00（白天，避开睡眠） */
const T0 = new Date(2025, 0, 6, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

function newPet(seed = 1): PetState {
  return createPet({ id: 'p', name: '小蛋', now: T0, rng: mulberry32(seed) });
}

function types(events: PetEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('生命周期', () => {
  it('卵 5 分钟孵化成 baby', () => {
    const s = newPet();
    expect(types(advance(s, T0 + 4 * MIN, mulberry32(1)))).not.toContain('hatched');
    const ev = advance(s, T0 + 5 * MIN + 1000, mulberry32(1));
    expect(types(ev)).toContain('hatched');
    expect(s.stage).toBe('baby');
    expect(s.weightG).toBe(BALANCE.baby.baseWeightG);
  });

  it('baby 清醒时按速率掉爱心（12 分钟 1 颗）', () => {
    const s = newPet();
    advance(s, T0 + 5 * MIN + 1000, mulberry32(1)); // 孵化
    advance(s, T0 + 5 * MIN + 1000 + 12 * MIN, mulberry32(1));
    expect(s.hungerHearts).toBe(3);
    advance(s, T0 + 5 * MIN + 1000 + 24 * MIN, mulberry32(1));
    expect(s.hungerHearts).toBe(2);
  });

  it('child→teen：失误 ≤1 进化 teen-a，否则 teen-b', () => {
    const a = newPet();
    a.stage = 'child';
    a.characterId = 'child';
    a.careMistakes = 1;
    a.stageSince = T0 - CHILD_GROWTH_MS; // 已到进化时刻
    const evA = advance(a, T0 + 1000, mulberry32(1));
    expect(a.characterId).toBe('teen-a');
    expect(types(evA)).toContain('evolved');

    const b = newPet();
    b.stage = 'child';
    b.characterId = 'child';
    b.careMistakes = 2;
    b.stageSince = T0 - CHILD_GROWTH_MS;
    advance(b, T0 + 1000, mulberry32(1));
    expect(b.characterId).toBe('teen-b');
  });

  it('teen→adult 分支：teen-a 低失误 → adult-s；高失误 → adult-b；teen-b 低失误 → adult-b', () => {
    const mk = (cid: 'teen-a' | 'teen-b', mistakes: number) => {
      const s = newPet();
      s.stage = 'teen';
      s.characterId = cid;
      s.careMistakes = mistakes;
      s.stageSince = T0 - TEEN_GROWTH_MS;
      advance(s, T0 + 1000, mulberry32(1));
      return s;
    };
    expect(mk('teen-a', 2).characterId).toBe('adult-s');
    expect(mk('teen-a', 4).characterId).toBe('adult-a');
    expect(mk('teen-a', 9).characterId).toBe('adult-b');
    expect(mk('teen-b', 3).characterId).toBe('adult-b');
    expect(mk('teen-b', 8).characterId).toBe('adult-c');
  });

  it('每 24h 长 1 岁', () => {
    const s = newPet();
    s.stage = 'child';
    s.characterId = 'child';
    s.bornAt = T0 - 24 * HOUR; // 已存活 24h
    const ev = advance(s, T0 + 1000, mulberry32(1));
    expect(s.ageYears).toBe(1);
    expect(types(ev)).toContain('aged');
  });
});

describe('睡眠（仿原版作息）', () => {
  it('child 21:00 入睡、次日 9:00 醒；睡眠中爱心不掉', () => {
    const s = newPet();
    advance(s, T0 + 6 * MIN, mulberry32(1));
    s.stage = 'child';
    s.characterId = 'child';
    s.stageSince = T0;

    // 直接跳到入夜前 1 分钟，避免白天长时间无人照料导致死亡
    s.updatedAt = T0 + 9 * HOUR - 60 * 1000; // 20:59
    const before = s.hungerHearts;
    const ev1 = advance(s, T0 + 9 * HOUR + 60 * 1000, mulberry32(1)); // 21:01
    expect(s.sleeping).toBe(true);
    expect(types(ev1)).toContain('fell-asleep');
    expect(s.hungerHearts).toBe(before); // 睡眠暂停衰减

    // 整夜亮灯 → 醒来记一次失误（跨夜 13h，显式放大结算上限）
    const ev2 = advance(s, T0 + 22 * HOUR, mulberry32(1), 13 * HOUR); // 次日 10:00
    expect(s.sleeping).toBe(false);
    expect(types(ev2)).toContain('woke-up');
    expect(ev2.some((e) => e.type === 'care-mistake' && e.reason === 'light')).toBe(true);
    expect(s.lightsOff).toBe(false); // 天亮自动开灯
  });
});

describe('生病与死亡', () => {
  it('便便 ≥2 堆 30 分钟 → 生病；冲洗可避免', () => {
    const s = newPet();
    advance(s, T0 + 6 * MIN, mulberry32(1)); // baby
    s.poops = 2;
    s.dirtySince = T0 + 6 * MIN;
    const ev = advance(s, T0 + 6 * MIN + 31 * MIN, mulberry32(1));
    expect(s.sick).toBe(true);
    expect(types(ev)).toContain('sick');
  });

  it('生病 3 小时不治 → 死亡（天使）', () => {
    const s = newPet();
    advance(s, T0 + 6 * MIN, mulberry32(1));
    s.sick = true;
    s.sickSince = T0 + 6 * MIN;
    const ev = advance(s, T0 + 6 * MIN + SICK_DEATH_MS + 1000, mulberry32(1));
    expect(s.stage).toBe('dead');
    expect(s.characterId).toBe('angel');
    expect(types(ev)).toContain('died');
    expect(s.deathCause).toBe('sickness');
  });

  it('成年后寿终正寝（old-age）', () => {
    const s = newPet();
    s.stage = 'adult';
    s.characterId = 'adult-a';
    s.careMistakes = 0;
    s.stageSince = T0 - 10 * 24 * HOUR - 1000; // 超过 10 天
    const ev = advance(s, T0 + 1000, mulberry32(1));
    expect(s.stage).toBe('dead');
    expect(ev.some((e) => e.type === 'died' && e.cause === 'old-age')).toBe(true);
  });

  it('饱食归零 30 分钟 → 记一次失误；每段归零只记一次', () => {
    const s = newPet();
    advance(s, T0 + 6 * MIN, mulberry32(1));
    s.hungerHearts = 0;
    s.hungerZeroSince = null;
    advance(s, T0 + 6 * MIN + HUNGER_ZERO_MISTAKE_MS + 1000, mulberry32(1));
    expect(s.careMistakes).toBeGreaterThanOrEqual(1);
    const m = s.careMistakes;
    advance(s, T0 + 6 * MIN + 2 * HUNGER_ZERO_MISTAKE_MS, mulberry32(1)); // 继续挨饿
    expect(s.careMistakes).toBe(m); // 不重复记
    feedMeal(s); // 喂饱后再饿 → 才能再记
    expect(s.hungerMistakeDone).toBe(false);
  });

  it('管教叫唤 15 分钟无人理 → 失误并自动消停', () => {
    const s = newPet();
    advance(s, T0 + 6 * MIN, mulberry32(1));
    s.stage = 'child';
    s.characterId = 'child';
    s.attention = 'discipline-call';
    s.attentionSince = T0 + 6 * MIN;
    const ev = advance(s, T0 + 6 * MIN + 16 * MIN, mulberry32(1));
    expect(s.attention).toBe('none');
    expect(ev.some((e) => e.type === 'care-mistake' && e.reason === 'ignored-call')).toBe(true);
  });
});
