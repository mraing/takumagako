/**
 * 领域类型：完全仿照初代拓麻歌子（P1）的状态模型。
 * 属性为 0–4 颗爱心制；管教为百分比；体重克。
 */

export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult' | 'dead';

/** 进化形态（自绘占位角色，不使用万代官方形象/名称） */
export type CharacterId =
  | 'egg'
  | 'baby'
  | 'child'
  | 'teen-a'
  | 'teen-b'
  | 'adult-s'
  | 'adult-a'
  | 'adult-b'
  | 'adult-c'
  | 'angel';

/** 叫唤类型：need=有真实需求；discipline-call=无理取闹需管教 */
export type AttentionKind = 'none' | 'need' | 'discipline-call';

export type DeathCause = 'sickness' | 'old-age';

export interface PetState {
  id: string;
  name: string;
  generation: number;
  bornAt: number;

  stage: Stage;
  characterId: CharacterId;
  stageSince: number; // 进入当前 stage 的时间戳

  ageYears: number; // 每 24h 长 1 岁（仿原版）
  weightG: number;
  hungerHearts: number; // 0–4
  happinessHearts: number; // 0–4
  disciplinePct: number; // 0–100

  poops: number; // 场上便便数，上限 POOPS_MAX
  sick: boolean;
  sleeping: boolean;
  lightsOff: boolean;

  attention: AttentionKind;
  attentionSince: number | null;

  careMistakes: number; // 照料失误累计（驱动进化分支与寿命）
  sickSince: number | null;

  // ---- 内部计时器（毫秒累加器）----
  accHungerMs: number;
  accHappyMs: number;
  accPoopMs: number;
  poopIntervalMs: number; // 当前排便间隔（带随机抖动）
  accCallMs: number;
  callIntervalMs: number; // 下一次管教叫唤间隔

  // ---- 失误去重标记（每段异常只记一次失误）----
  hungerZeroSince: number | null;
  hungerMistakeDone: boolean;
  happyZeroSince: number | null;
  happyMistakeDone: boolean;
  dirtySince: number | null; // poops >= 2 的起始时刻
  lightOnAtSleepStart: boolean | null; // 入睡时灯是否亮着

  snackStreak: number; // 连续喂零食次数（正餐清零），过多 → 牙痛生病

  updatedAt: number; // 上次结算锚点
  deadAt: number | null;
  deathCause: DeathCause | null;
}

export type CareMistakeReason =
  | 'hunger' // 饱食归零过久
  | 'happiness' // 快乐归零过久
  | 'light' // 睡觉整夜没关灯
  | 'ignored-call' // 管教叫唤被无视
  | 'poop-overflow'; // 便便堆积溢出

export type PetEvent =
  | { type: 'hatched' }
  | { type: 'evolved'; to: CharacterId }
  | { type: 'pooped' }
  | { type: 'sick' }
  | { type: 'recovered' }
  | { type: 'fell-asleep' }
  | { type: 'woke-up' }
  | { type: 'call'; kind: 'need' | 'discipline' }
  | { type: 'call-cleared' }
  | { type: 'care-mistake'; reason: CareMistakeReason; total: number }
  | { type: 'aged'; years: number }
  | { type: 'died'; cause: DeathCause };
