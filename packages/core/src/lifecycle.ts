import {
  ADULT_NATURAL_DEATH_DAYS,
  AGE_YEAR_MS,
  BABY_GROWTH_MS,
  BALANCE,
  CHILD_GROWTH_MS,
  EGG_HATCH_MS,
  MIN_ADULT_LIFESPAN_DAYS,
  MISTAKE_LIFESPAN_PENALTY_MS,
  TEEN_GROWTH_MS,
  type StageBalance,
} from './balance';
import type { CharacterId, DeathCause, PetEvent, PetState, Stage } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const GROWTH_MS: Partial<Record<Stage, number>> = {
  baby: BABY_GROWTH_MS,
  child: CHILD_GROWTH_MS,
  teen: TEEN_GROWTH_MS,
};

export function stageBalance(stage: Stage): StageBalance | null {
  switch (stage) {
    case 'baby':
      return BALANCE.baby;
    case 'child':
      return BALANCE.child;
    case 'teen':
      return BALANCE.teen;
    case 'adult':
      return BALANCE.adult;
    default:
      return null;
  }
}

/** 该阶段此刻是否处于睡眠时段（本地小时，跨零点） */
export function isSleepHour(stage: Stage, localHour: number): boolean {
  const bal = stageBalance(stage);
  if (!bal) return false;
  const { sleepStartHour, sleepEndHour } = bal;
  // 例如 21→9：hour >= 21 || hour < 9
  return localHour >= sleepStartHour || localHour < sleepEndHour;
}

export function hatch(s: PetState, t: number, ev: PetEvent[]): void {
  s.stage = 'baby';
  s.characterId = 'baby';
  s.stageSince = t;
  s.weightG = BALANCE.baby.baseWeightG;
  ev.push({ type: 'hatched' });
}

/**
 * 成长检查：到点即进化；分支由累计照料失误数决定（仿 P1 growth chart）。
 * adult 阶段检查寿终。
 */
export function growIfDue(s: PetState, t: number, ev: PetEvent[]): void {
  if (s.stage === 'adult') {
    checkOldAge(s, t, ev);
    return;
  }
  const dur = GROWTH_MS[s.stage];
  if (dur === undefined || t - s.stageSince < dur) return;

  switch (s.stage) {
    case 'baby':
      setStage(s, t, 'child', 'child', ev);
      break;
    case 'child': {
      const to: CharacterId = s.careMistakes <= 1 ? 'teen-a' : 'teen-b';
      setStage(s, t, 'teen', to, ev);
      break;
    }
    case 'teen': {
      const m = s.careMistakes;
      let to: CharacterId;
      if (s.characterId === 'teen-a') {
        to = m <= 2 ? 'adult-s' : m <= 5 ? 'adult-a' : 'adult-b';
      } else {
        to = m <= 3 ? 'adult-b' : 'adult-c';
      }
      setStage(s, t, 'adult', to, ev);
      break;
    }
    default:
      break;
  }
}

/** 成年寿命：基础 10 天，每次失误折寿 12h，最短 5 天（仿原版"养得好多活几天"） */
export function adultLifespanMs(careMistakes: number): number {
  const base = ADULT_NATURAL_DEATH_DAYS * DAY;
  const min = MIN_ADULT_LIFESPAN_DAYS * DAY;
  return Math.max(min, base - careMistakes * MISTAKE_LIFESPAN_PENALTY_MS);
}

function checkOldAge(s: PetState, t: number, ev: PetEvent[]): void {
  if (t - s.stageSince >= adultLifespanMs(s.careMistakes)) {
    die(s, t, 'old-age', ev);
  }
}

export function updateAge(s: PetState, t: number, ev: PetEvent[]): void {
  // 钳制 ≥0：防御 bornAt 与结算锚点不一致的异常状态（如系统时钟回拨），负年龄无意义
  const years = Math.max(0, Math.floor((t - s.bornAt) / AGE_YEAR_MS));
  if (years !== s.ageYears) {
    s.ageYears = years;
    ev.push({ type: 'aged', years });
  }
}

export function die(s: PetState, t: number, cause: DeathCause, ev: PetEvent[]): void {
  s.stage = 'dead';
  s.characterId = 'angel';
  s.deadAt = t;
  s.deathCause = cause;
  s.sleeping = false;
  s.sick = false;
  s.sickSince = null;
  s.attention = 'none';
  s.attentionSince = null;
  ev.push({ type: 'died', cause });
}

function setStage(s: PetState, t: number, stage: Stage, characterId: CharacterId, ev: PetEvent[]): void {
  s.stage = stage;
  s.characterId = characterId;
  s.stageSince = t;
  const bal = stageBalance(stage);
  if (bal && s.weightG < bal.baseWeightG) s.weightG = bal.baseWeightG;
  // 进化瞬间清空需求计时，给玩家一个"新阶段"缓冲
  s.accHungerMs = 0;
  s.accHappyMs = 0;
  s.accPoopMs = 0;
  ev.push({ type: 'evolved', to: characterId });
}

export { EGG_HATCH_MS };
