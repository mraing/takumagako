import {
  DISCIPLINE_STEP,
  GAME_LOSE_HAPPY,
  GAME_ROUNDS,
  GAME_WEIGHT_LOSS_G,
  GAME_WIN_HAPPY,
  GAME_WIN_MIN,
  HEARTS_MAX,
  MEAL_WEIGHT_G,
  MEDICINE_CURE_P,
  SNACK_SICK_STREAK,
  SNACK_WEIGHT_G,
} from './balance';
import { makeSick } from './engine';
import { stageBalance } from './lifecycle';
import type { Rng } from './rng';
import type { PetEvent, PetState } from './types';

export type ActionResult =
  | { ok: true; events: PetEvent[] }
  | { ok: false; reason: string };

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}
function pass(events: PetEvent[] = []): ActionResult {
  return { ok: true, events };
}

/** 通用门禁：死亡/卵/睡觉中不可操作（只返回失败，成功时返回 null） */
function guard(s: PetState): { ok: false; reason: string } | null {
  if (s.stage === 'dead') return fail('它已经离开了…按 A+C 孵一颗新蛋吧');
  if (s.stage === 'egg') return fail('蛋还没有孵化');
  if (s.sleeping) return fail('它睡着了 Zzz');
  return null;
}

/** 正餐：+1 饱食心，+1g；饱了会摇头拒绝（仿原版） */
export function feedMeal(s: PetState): ActionResult {
  const g = guard(s);
  if (g) return g;
  if (s.sick) return fail('生病了，没胃口');
  if (s.hungerHearts >= HEARTS_MAX) return fail('它摇摇头：吃不下了');
  s.hungerHearts += 1;
  s.weightG += MEAL_WEIGHT_G;
  s.snackStreak = 0;
  s.hungerZeroSince = null; // 挨饿 episode 结束
  s.hungerMistakeDone = false;
  return pass();
}

/** 零食：+1 快乐心，+2g；连续只吃零食 SNACK_SICK_STREAK 次 → 牙痛生病 */
export function feedSnack(s: PetState, now: number): ActionResult {
  const g = guard(s);
  if (g) return g;
  if (s.sick) return fail('生病了，没胃口');
  s.happinessHearts = Math.min(HEARTS_MAX, s.happinessHearts + 1);
  s.weightG += SNACK_WEIGHT_G;
  s.snackStreak += 1;
  s.happyZeroSince = null; // 不快乐 episode 结束
  s.happyMistakeDone = false;
  const events: PetEvent[] = [];
  if (s.snackStreak >= SNACK_SICK_STREAK) {
    s.snackStreak = 0;
    makeSick(s, now, events); // 牙痛
  }
  return pass(events);
}

/** 冲洗便便 */
export function flushPoop(s: PetState): ActionResult {
  const g = guard(s);
  if (g) return g;
  if (s.poops === 0) return fail('地上很干净');
  s.poops = 0;
  s.dirtySince = null;
  return pass();
}

/** 打针：生病时单次治愈率 80%（仿原版有时要补针）；健康时会被拒绝 */
export function giveMedicine(s: PetState, rng: Rng): ActionResult {
  const g = guard(s);
  if (g) return g;
  if (!s.sick) return fail('它很健康，拒绝打针');
  if (rng() < MEDICINE_CURE_P) {
    s.sick = false;
    s.sickSince = null;
    return pass([{ type: 'recovered' }]);
  }
  return pass(); // 没治好，还需再观察/补针
}

/** 关灯/开灯。睡眠中关灯可免除"整夜亮灯"失误 */
export function toggleLight(s: PetState): ActionResult {
  if (s.stage === 'dead' || s.stage === 'egg') return fail('现在没有灯可以操作');
  s.lightsOff = !s.lightsOff;
  if (s.sleeping && s.lightsOff) s.lightOnAtSleepStart = false;
  return pass();
}

/** 管教：仅"无理取闹"叫唤时有效，+25% 管教度 */
export function scold(s: PetState): ActionResult {
  const g = guard(s);
  if (g) return g;
  if (s.attention !== 'discipline-call') return fail('它没有捣蛋，不需要管教');
  s.disciplinePct = Math.min(100, s.disciplinePct + DISCIPLINE_STEP);
  s.attention = 'none';
  s.attentionSince = null;
  return pass([{ type: 'call-cleared' }]);
}

export interface GuessRound {
  move: 'L' | 'R';
  pet: 'L' | 'R';
  win: boolean;
}
export interface GuessGameResult {
  rounds: GuessRound[];
  wins: number;
  wonGame: boolean;
  happyGain: number;
  weightDelta: number;
}

/** 猜方向结算：按胜局数应用效果（UI 逐局交互与批量模式共用） */
export function applyGuessResult(
  s: PetState,
  wins: number,
): { wonGame: boolean; happyGain: number; weightDelta: number } {
  const wonGame = wins >= GAME_WIN_MIN;
  const happyGain = wonGame ? GAME_WIN_HAPPY : GAME_LOSE_HAPPY;
  s.happinessHearts = Math.min(HEARTS_MAX, s.happinessHearts + happyGain);
  let weightDelta = 0;
  if (wonGame) {
    const bal = stageBalance(s.stage);
    const floor = bal ? bal.baseWeightG : 1;
    const target = Math.max(floor, s.weightG - GAME_WEIGHT_LOSS_G);
    weightDelta = target - s.weightG;
    s.weightG = target;
  }
  s.snackStreak = 0;
  return { wonGame, happyGain, weightDelta };
}

/**
 * 猜方向小游戏（仿原版）：5 局，玩家猜宠物转身方向，赢 ≥3 局为胜。
 * 胜：快乐 +2 心、体重 −2g（不低于阶段下限）；负：快乐 +1 心。
 * baby 太小不会玩；生病/睡觉不可玩。
 */
export function playGuessGame(
  s: PetState,
  moves: Array<'L' | 'R'>,
  rng: Rng,
): { ok: true; result: GuessGameResult; events: PetEvent[] } | { ok: false; reason: string } {
  const g = guard(s);
  if (g) return g;
  if (s.stage === 'baby') return fail('它还太小，不会玩游戏');
  if (s.sick) return fail('生病了，没力气玩');

  const rounds: GuessRound[] = moves.slice(0, GAME_ROUNDS).map((move) => {
    const pet: 'L' | 'R' = rng() < 0.5 ? 'L' : 'R';
    return { move, pet, win: move === pet };
  });
  const wins = rounds.filter((r) => r.win).length;
  const outcome = applyGuessResult(s, wins);
  return {
    ok: true,
    result: { rounds, wins, ...outcome },
    events: [],
  };
}

/** 死亡后孵新蛋（原版 A+C）：保留 id 与世代 +1，其余重来 */
export function rebirth(s: PetState, now: number, rng: Rng): void {
  if (s.stage !== 'dead') return;
  s.generation += 1;
  s.bornAt = now;
  s.stage = 'egg';
  s.characterId = 'egg';
  s.stageSince = now;
  s.ageYears = 0;
  s.weightG = 1;
  s.hungerHearts = HEARTS_MAX;
  s.happinessHearts = HEARTS_MAX;
  s.disciplinePct = 0;
  s.poops = 0;
  s.sick = false;
  s.sleeping = false;
  s.lightsOff = false;
  s.attention = 'none';
  s.attentionSince = null;
  s.careMistakes = 0;
  s.sickSince = null;
  s.accHungerMs = 0;
  s.accHappyMs = 0;
  s.accPoopMs = 0;
  s.accCallMs = 0;
  s.hungerZeroSince = null;
  s.hungerMistakeDone = false;
  s.happyZeroSince = null;
  s.happyMistakeDone = false;
  s.dirtySince = null;
  s.lightOnAtSleepStart = null;
  s.snackStreak = 0;
  s.deadAt = null;
  s.deathCause = null;
  s.updatedAt = now;
  s.poopIntervalMs = 3_600_000;
  s.callIntervalMs = 3 * 3_600_000;
  void rng;
}
