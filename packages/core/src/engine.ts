import {
  CALL_TIMEOUT_MS,
  DIRTY_SICK_MS,
  HAPPY_ZERO_MISTAKE_MS,
  HUNGER_ZERO_MISTAKE_MS,
  OFFLINE_SETTLE_CAP_MS,
  POOPS_MAX,
  SICK_DEATH_MS,
} from './balance';
import { die, growIfDue, hatch, isSleepHour, stageBalance, updateAge } from './lifecycle';
import { nextInterval, rangeMs, type Rng } from './rng';
import { DISCIPLINE_CALL_MAX_MS, DISCIPLINE_CALL_MIN_MS, EGG_HATCH_MS } from './balance';
import type { CareMistakeReason, PetEvent, PetState } from './types';

/** stage 会被 tick/action 原地修改；用函数判定避开 TS 的不可达收窄误报 */
function isDead(s: PetState): boolean {
  return s.stage === 'dead';
}

/**
 * 推进宠物状态到 now。
 * - 内部固定 1s 步长，与渲染帧率解耦；
 * - 时间回拨保护：now < updatedAt 时不结算（锚点单调）；
 * - 离线结算上限 capMs（默认 8h，ADR-01）。
 * 直接原地修改 state，返回期间产生的领域事件。
 */
export function advance(
  state: PetState,
  now: number,
  rng: Rng,
  capMs: number = OFFLINE_SETTLE_CAP_MS,
): PetEvent[] {
  const events: PetEvent[] = [];
  if (state.stage === 'dead') {
    state.updatedAt = Math.max(state.updatedAt, now);
    return events;
  }
  // 锚定 updatedAt 为基准，按"整秒数"批量结算：
  // 增量推进（如 250ms 节拍）时每跨满 1 秒结算一次，边界永不漂移。
  const anchor = state.updatedAt;
  const end = Math.min(Math.max(now, anchor), anchor + capMs);
  const wholeSeconds = Math.floor((end - anchor) / 1000);
  for (let i = 0; i < wholeSeconds; i++) {
    const t = anchor + (i + 1) * 1000;
    tickSecond(state, t, rng, events);
    if (isDead(state)) {
      state.updatedAt = state.deadAt ?? t;
      return events;
    }
  }
  state.updatedAt = anchor + wholeSeconds * 1000;
  return events;
}

/** 单个 1s tick 的全部领域逻辑 */
function tickSecond(s: PetState, t: number, rng: Rng, ev: PetEvent[]): void {
  if (s.stage === 'dead') return;

  // ---- 孵化（卵期无任何需求）----
  if (s.stage === 'egg') {
    if (t - s.stageSince >= EGG_HATCH_MS) hatch(s, t, ev);
    return;
  }

  const bal = stageBalance(s.stage);
  if (!bal) return;

  // ---- 入睡 / 醒来 ----
  const inSleep = isSleepHour(s.stage, new Date(t).getHours());
  if (!s.sleeping && inSleep) {
    s.sleeping = true;
    s.lightOnAtSleepStart = !s.lightsOff;
    ev.push({ type: 'fell-asleep' });
  } else if (s.sleeping && !inSleep) {
    s.sleeping = false;
    // 整夜没关灯 → 照料失误（仿原版）
    if (s.lightOnAtSleepStart && !s.lightsOff) mistake(s, 'light', ev);
    s.lightOnAtSleepStart = null;
    s.lightsOff = false; // 天亮自动开灯
    ev.push({ type: 'woke-up' });
  }

  // 睡眠中：需求暂停，但病程继续恶化
  if (s.sleeping) {
    trackSickDeath(s, t, ev);
    return;
  }

  // ---- 年龄与成长 ----
  updateAge(s, t, ev);
  growIfDue(s, t, ev);
  if (isDead(s)) return;

  // ---- 爱心衰减 ----
  s.accHungerMs += 1000;
  if (s.accHungerMs >= bal.hungerMs) {
    s.accHungerMs -= bal.hungerMs;
    s.hungerHearts = Math.max(0, s.hungerHearts - 1);
  }
  s.accHappyMs += 1000;
  if (s.accHappyMs >= bal.happyMs) {
    s.accHappyMs -= bal.happyMs;
    s.happinessHearts = Math.max(0, s.happinessHearts - 1);
  }

  // ---- 排便 ----
  s.accPoopMs += 1000;
  if (s.accPoopMs >= s.poopIntervalMs) {
    s.accPoopMs = 0;
    s.poopIntervalMs = nextInterval(rng, bal.poopMs);
    if (s.poops >= POOPS_MAX) {
      mistake(s, 'poop-overflow', ev);
    } else {
      s.poops += 1;
      ev.push({ type: 'pooped' });
    }
  }
  if (s.poops >= 2 && s.dirtySince === null) s.dirtySince = t;
  if (s.poops < 2) s.dirtySince = null;

  // ---- 生病：便便堆积 / 病程恶化 ----
  if (!s.sick && s.dirtySince !== null && t - s.dirtySince >= DIRTY_SICK_MS) {
    makeSick(s, t, ev);
  }
  trackSickDeath(s, t, ev);
  if (isDead(s)) return;

  // ---- 爱心归零 → 照料失误 ----
  trackZero(s, t, 'hunger', ev);
  trackZero(s, t, 'happy', ev);

  // ---- 需求叫唤（attention 图标亮） ----
  const needs = s.sick || s.hungerHearts === 0 || s.happinessHearts === 0;
  if (needs && s.attention === 'none') {
    s.attention = 'need';
    s.attentionSince = t;
    ev.push({ type: 'call', kind: 'need' });
  } else if (!needs && s.attention === 'need') {
    s.attention = 'none';
    s.attentionSince = null;
    ev.push({ type: 'call-cleared' });
  }

  // ---- 无理取闹叫唤（需管教；child 起才有） ----
  if (s.stage !== 'baby' && s.attention === 'none' && !s.sick) {
    s.accCallMs += 1000;
    if (s.accCallMs >= s.callIntervalMs) {
      s.accCallMs = 0;
      s.callIntervalMs = rangeMs(rng, DISCIPLINE_CALL_MIN_MS, DISCIPLINE_CALL_MAX_MS);
      s.attention = 'discipline-call';
      s.attentionSince = t;
      ev.push({ type: 'call', kind: 'discipline' });
    }
  }
  if (
    s.attention === 'discipline-call' &&
    s.attentionSince !== null &&
    t - s.attentionSince >= CALL_TIMEOUT_MS
  ) {
    s.attention = 'none';
    s.attentionSince = null;
    mistake(s, 'ignored-call', ev);
    ev.push({ type: 'call-cleared' });
  }
}

export function makeSick(s: PetState, t: number, ev: PetEvent[]): void {
  s.sick = true;
  s.sickSince = t;
  ev.push({ type: 'sick' });
}

function trackSickDeath(s: PetState, t: number, ev: PetEvent[]): void {
  if (s.sick && s.sickSince !== null && t - s.sickSince >= SICK_DEATH_MS) {
    die(s, t, 'sickness', ev);
  }
}

function trackZero(s: PetState, t: number, kind: 'hunger' | 'happy', ev: PetEvent[]): void {
  const zero = kind === 'hunger' ? s.hungerHearts === 0 : s.happinessHearts === 0;
  const sinceKey = kind === 'hunger' ? 'hungerZeroSince' : 'happyZeroSince';
  const doneKey = kind === 'hunger' ? 'hungerMistakeDone' : 'happyMistakeDone';
  const limit = kind === 'hunger' ? HUNGER_ZERO_MISTAKE_MS : HAPPY_ZERO_MISTAKE_MS;
  if (!zero) {
    s[sinceKey] = null;
    s[doneKey] = false;
    return;
  }
  if (s[sinceKey] === null) s[sinceKey] = t;
  if (!s[doneKey] && t - (s[sinceKey] as number) >= limit) {
    s[doneKey] = true;
    mistake(s, kind === 'hunger' ? 'hunger' : 'happiness', ev);
  }
}

export function mistake(s: PetState, reason: CareMistakeReason, ev: PetEvent[]): void {
  s.careMistakes += 1;
  ev.push({ type: 'care-mistake', reason, total: s.careMistakes });
}
