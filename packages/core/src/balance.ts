/**
 * 数值平衡表：仿初代拓麻歌子节奏（可调）。
 * 本文档与《开发文档.md》§4.2 保持一致，改数值需同步回写文档。
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const HEARTS_MAX = 4;
export const POOPS_MAX = 3;
export const DISCIPLINE_STEP = 25;

export interface StageBalance {
  hungerMs: number; // 掉 1 颗饱食爱心所需时间（清醒时）
  happyMs: number; // 掉 1 颗快乐爱心所需时间（清醒时）
  poopMs: number; // 排便基准间隔（±20% 抖动）
  sleepStartHour: number; // 入睡时刻（本地小时，含）
  sleepEndHour: number; // 醒来时刻（本地小时，不含）
  baseWeightG: number; // 该阶段体重下限
}

export const BALANCE: Record<'baby' | 'child' | 'teen' | 'adult', StageBalance> = {
  // 幼体最黏人：吃喝拉撒频繁（仿原版 baby 阶段高维护）
  baby: { hungerMs: 12 * MIN, happyMs: 15 * MIN, poopMs: 60 * MIN, sleepStartHour: 20, sleepEndHour: 9, baseWeightG: 5 },
  child: { hungerMs: 45 * MIN, happyMs: 60 * MIN, poopMs: 150 * MIN, sleepStartHour: 21, sleepEndHour: 9, baseWeightG: 10 },
  teen: { hungerMs: 60 * MIN, happyMs: 75 * MIN, poopMs: 180 * MIN, sleepStartHour: 21, sleepEndHour: 9, baseWeightG: 15 },
  adult: { hungerMs: 90 * MIN, happyMs: 90 * MIN, poopMs: 180 * MIN, sleepStartHour: 21, sleepEndHour: 9, baseWeightG: 20 },
};

// ---- 成长时长（仿 P1：卵 5 分钟孵化，幼体约 1 小时，此后按天计）----
export const EGG_HATCH_MS = 5 * MIN;
export const BABY_GROWTH_MS = 65 * MIN;
export const CHILD_GROWTH_MS = 48 * HOUR;
export const TEEN_GROWTH_MS = 72 * HOUR;

// ---- 照料失误判定 ----
export const HUNGER_ZERO_MISTAKE_MS = 30 * MIN; // 饱食归零持续 30 分钟 → 失误
export const HAPPY_ZERO_MISTAKE_MS = 30 * MIN;
export const DIRTY_SICK_MS = 30 * MIN; // 便便 ≥2 堆持续 30 分钟 → 生病
export const SICK_DEATH_MS = 3 * HOUR; // 生病不治 3 小时 → 死亡
export const CALL_TIMEOUT_MS = 15 * MIN; // 管教叫唤 15 分钟无人理 → 失误
export const DISCIPLINE_CALL_MIN_MS = 3 * HOUR; // 管教叫唤间隔（child 起）
export const DISCIPLINE_CALL_MAX_MS = 6 * HOUR;

// ---- 喂食 ----
export const MEAL_WEIGHT_G = 1; // 正餐 +1g
export const SNACK_WEIGHT_G = 2; // 零食 +2g
export const SNACK_SICK_STREAK = 3; // 连续 3 次只吃零食 → 牙痛生病
export const MEDICINE_CURE_P = 0.8; // 单次打针治愈率（仿原版有时要打两针）

// ---- 猜方向小游戏 ----
export const GAME_ROUNDS = 5;
export const GAME_WIN_MIN = 3; // 5 局赢 ≥3 为胜
export const GAME_WIN_HAPPY = 2; // 胜：快乐 +2 心
export const GAME_LOSE_HAPPY = 1; // 负：快乐 +1 心（安慰奖）
export const GAME_WEIGHT_LOSS_G = 2; // 胜：体重 −2g（不低于阶段下限）

// ---- 寿命 ----
export const AGE_YEAR_MS = 24 * HOUR; // 每 24h 长 1 岁
export const ADULT_NATURAL_DEATH_DAYS = 10; // 成年基础寿命
export const MISTAKE_LIFESPAN_PENALTY_MS = 12 * HOUR; // 每次照料失误折寿
export const MIN_ADULT_LIFESPAN_DAYS = 5; // 成年最短寿命

// ---- 离线结算 ----
export const OFFLINE_SETTLE_CAP_MS = 8 * HOUR;
