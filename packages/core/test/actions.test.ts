import { describe, expect, it } from 'vitest';
import {
  advance,
  createPet,
  feedMeal,
  feedSnack,
  flushPoop,
  giveMedicine,
  mulberry32,
  playGuessGame,
  rebirth,
  scold,
  toggleLight,
  BALANCE,
  HEARTS_MAX,
  type PetState,
  type Rng,
} from '../src';

/** 固定基准时刻：本地 2025-01-06（周一）12:00，避开所有睡眠时段 */
const T0 = new Date(2025, 0, 6, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

function petAt(stage: 'child' | 'teen' | 'adult', overrides: Partial<PetState> = {}): PetState {
  const rng = mulberry32(42);
  const s = createPet({ id: 'p1', name: '小蛋', now: T0, rng });
  // 直接快进到目标阶段
  s.stage = stage;
  s.characterId = stage === 'child' ? 'child' : stage === 'teen' ? 'teen-a' : 'adult-a';
  s.stageSince = T0;
  s.weightG = BALANCE[stage === 'child' ? 'child' : stage === 'teen' ? 'teen' : 'adult'].baseWeightG;
  Object.assign(s, overrides);
  return s;
}

const constRng = (v: number): Rng => () => v;

describe('喂食', () => {
  it('正餐：+1 饱食心、+1g、清空零食连击；满饱时拒绝', () => {
    const s = petAt('child', { hungerHearts: 2 });
    expect(feedMeal(s).ok).toBe(true);
    expect(s.hungerHearts).toBe(3);
    expect(s.weightG).toBe(BALANCE.child.baseWeightG + 1);

    s.hungerHearts = HEARTS_MAX;
    const r = feedMeal(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('摇头');
  });

  it('生病/睡觉/卵期不可喂食', () => {
    expect(feedMeal(petAt('child', { sick: true })).ok).toBe(false);
    expect(feedMeal(petAt('child', { sleeping: true })).ok).toBe(false);
    const egg = createPet({ id: 'e', name: '蛋', now: T0, rng: mulberry32(1) });
    expect(feedMeal(egg).ok).toBe(false);
  });

  it('零食：+1 快乐心、+2g；连续 3 次 → 牙痛生病', () => {
    const s = petAt('child', { happinessHearts: 0 });
    feedSnack(s, T0);
    expect(s.happinessHearts).toBe(1);
    expect(s.weightG).toBe(BALANCE.child.baseWeightG + 2);
    feedSnack(s, T0 + 1000);
    const r = feedSnack(s, T0 + 2000);
    expect(s.sick).toBe(true); // 第 3 次 → 牙痛
    expect(r.ok && r.events.some((e) => e.type === 'sick')).toBe(true);
  });
});

describe('清洁与医疗', () => {
  it('冲洗清空便便；无便时拒绝', () => {
    const s = petAt('child', { poops: 2, dirtySince: T0 - 1000 });
    expect(flushPoop(s).ok).toBe(true);
    expect(s.poops).toBe(0);
    expect(s.dirtySince).toBeNull();
    expect(flushPoop(s).ok).toBe(false);
  });

  it('打针：80% 治愈；健康时拒绝', () => {
    const sick = petAt('child', { sick: true, sickSince: T0 - 1000 });
    const r1 = giveMedicine(sick, constRng(0.1)); // 0.1 < 0.8 → 治愈
    expect(r1.ok && r1.events.some((e) => e.type === 'recovered')).toBe(true);
    expect(sick.sick).toBe(false);

    const sick2 = petAt('child', { sick: true, sickSince: T0 - 1000 });
    giveMedicine(sick2, constRng(0.9)); // 0.9 ≥ 0.8 → 未治愈
    expect(sick2.sick).toBe(true);

    expect(giveMedicine(petAt('child'), constRng(0)).ok).toBe(false);
  });
});

describe('管教', () => {
  it('仅无理取闹叫唤时有效，+25%；普通状态拒绝', () => {
    const s = petAt('child', { attention: 'discipline-call', attentionSince: T0 });
    expect(scold(s).ok).toBe(true);
    expect(s.disciplinePct).toBe(25);
    expect(s.attention).toBe('none');
    expect(scold(s).ok).toBe(false); // 已无叫唤
  });
});

describe('猜方向小游戏', () => {
  it('全猜中（≥3 局）→ 快乐 +2、体重 −2（不低于阶段下限）', () => {
    const s = petAt('teen', { happinessHearts: 1, weightG: 20 });
    const r = playGuessGame(s, ['L', 'L', 'L', 'L', 'L'], constRng(0.1)); // 宠物总出 L
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.wins).toBe(5);
      expect(r.result.wonGame).toBe(true);
      expect(r.result.happyGain).toBe(2);
    }
    expect(s.happinessHearts).toBe(3);
    expect(s.weightG).toBe(18);
  });

  it('全猜错 → 安慰奖 +1 快乐；体重不变', () => {
    const s = petAt('teen', { happinessHearts: 1, weightG: 20 });
    const r = playGuessGame(s, ['L', 'L', 'L', 'L', 'L'], constRng(0.9)); // 宠物总出 R
    if (r.ok) {
      expect(r.result.wins).toBe(0);
      expect(r.result.happyGain).toBe(1);
    }
    expect(s.happinessHearts).toBe(2);
    expect(s.weightG).toBe(20);
  });

  it('baby 不能玩；赢局体重不会跌破阶段下限', () => {
    expect(playGuessGame(petAt('child'), ['L'], constRng(0)).ok).toBe(true); // child 可玩
    const baby = createPet({ id: 'b', name: '宝', now: T0, rng: mulberry32(1) });
    advance(baby, T0 + 6 * MIN, mulberry32(1)); // 孵化
    baby.stage = 'baby';
    expect(playGuessGame(baby, ['L'], constRng(0)).ok).toBe(false);

    const thin = petAt('child', { weightG: BALANCE.child.baseWeightG, happinessHearts: 1 });
    playGuessGame(thin, ['L', 'L', 'L', 'L', 'L'], constRng(0.1));
    expect(thin.weightG).toBe(BALANCE.child.baseWeightG);
  });
});

describe('灯与重生', () => {
  it('睡眠中关灯可免除整夜亮灯失误', () => {
    // child 21 点入睡；直接跳到入夜前 2 分钟，避免白天无人照料导致死亡
    const s = petAt('child');
    s.updatedAt = T0 + 9 * HOUR - 2 * MIN; // 20:58
    advance(s, T0 + 9 * HOUR + 1000, mulberry32(7)); // 21:00 后
    expect(s.sleeping).toBe(true);
    expect(s.lightOnAtSleepStart).toBe(true);
    toggleLight(s); // 关灯
    expect(s.lightsOff).toBe(true);
    expect(s.lightOnAtSleepStart).toBe(false); // 已补救
  });

  it('死亡后 rebirth：世代 +1，回到蛋', () => {
    const s = petAt('adult', { sick: true, sickSince: T0 - 4 * HOUR });
    const ev = advance(s, T0 + 1000, mulberry32(3));
    expect(ev.some((e) => e.type === 'died')).toBe(true);
    expect(s.stage).toBe('dead');

    rebirth(s, T0 + 10 * MIN, mulberry32(3));
    expect(s.stage).toBe('egg');
    expect(s.generation).toBe(2);
    expect(s.deathCause).toBeNull();
  });
});
