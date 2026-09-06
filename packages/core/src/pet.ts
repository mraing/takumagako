import { BALANCE, EGG_HATCH_MS, HEARTS_MAX } from './balance';
import { nextInterval, rangeMs, type Rng } from './rng';
import { DISCIPLINE_CALL_MIN_MS, DISCIPLINE_CALL_MAX_MS } from './balance';
import type { PetState } from './types';

/** 创建一颗新蛋（或下一代） */
export function createPet(opts: {
  id: string;
  name: string;
  now: number;
  generation?: number;
  rng: Rng;
}): PetState {
  return {
    id: opts.id,
    name: opts.name,
    generation: opts.generation ?? 1,
    bornAt: opts.now,
    stage: 'egg',
    characterId: 'egg',
    stageSince: opts.now,

    ageYears: 0,
    weightG: 1,
    hungerHearts: HEARTS_MAX,
    happinessHearts: HEARTS_MAX,
    disciplinePct: 0,

    poops: 0,
    sick: false,
    sleeping: false,
    lightsOff: false,

    attention: 'none',
    attentionSince: null,

    careMistakes: 0,
    sickSince: null,

    accHungerMs: 0,
    accHappyMs: 0,
    accPoopMs: 0,
    poopIntervalMs: nextInterval(opts.rng, BALANCE.baby.poopMs),
    accCallMs: 0,
    callIntervalMs: rangeMs(opts.rng, DISCIPLINE_CALL_MIN_MS, DISCIPLINE_CALL_MAX_MS),

    hungerZeroSince: null,
    hungerMistakeDone: false,
    happyZeroSince: null,
    happyMistakeDone: false,
    dirtySince: null,
    lightOnAtSleepStart: null,

    snackStreak: 0,

    updatedAt: opts.now,
    deadAt: null,
    deathCause: null,
  };
}

export { EGG_HATCH_MS };
