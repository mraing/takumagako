/**
 * M1 验收仿真（《开发文档.md》§11）：
 *  - 精心照料策略：应活到成年、进化优质形态、寿终正寝；
 *  - 放任不管策略：应迅速死亡。
 * 运行：pnpm sim
 */
import {
  advance,
  createPet,
  feedMeal,
  feedSnack,
  flushPoop,
  giveMedicine,
  mulberry32,
  playGuessGame,
  scold,
  toggleLight,
  type PetEvent,
  type PetState,
} from '../src';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 本地 2025-01-06 12:00 开始 */
const T0 = new Date(2025, 0, 6, 12, 0, 0).getTime();

interface RunResult {
  pet: PetState;
  deathDay: number | null;
  deathCause: string | null;
  finalCharacter: string;
  maxStage: string;
  mistakes: number;
}

function run(days: number, policy: 'attentive' | 'neglect', seed: number): RunResult {
  const rng = mulberry32(seed);
  const pet = createPet({ id: 'sim', name: '仿真蛋', now: T0, rng });
  const stepMs = 30_000;
  const steps = Math.floor((days * DAY) / stepMs);
  let lastDay = -1;
  let deathDay: number | null = null;

  for (let i = 0; i < steps; i++) {
    const now = T0 + i * stepMs;
    const events = advance(pet, now, rng);

    if (policy === 'attentive') care(pet, now, rng);

    for (const e of events) {
      if (e.type === 'evolved') console.log(`  [day ${dayNo(now)}] ⬆ 进化 → ${e.to}`);
      if (e.type === 'died') {
        console.log(`  [day ${dayNo(now)}] 💀 死亡（${e.cause}）`);
        deathDay = dayNo(now);
      }
    }

    const d = dayNo(now);
    if (d !== lastDay) {
      lastDay = d;
      console.log(
        `  day ${String(d).padStart(2)} | ${pet.stage.padEnd(5)} ${pet.characterId.padEnd(8)} | ` +
          `饿 ${pet.hungerHearts} 乐 ${pet.happinessHearts} | ${pet.weightG}g | ` +
          `管教 ${pet.disciplinePct}% | 失误 ${pet.careMistakes} | ${pet.sick ? '病' : '  '} ${pet.sleeping ? '睡' : '  '}`,
      );
    }
    if (pet.stage === 'dead') break;
  }

  return {
    pet,
    deathDay,
    deathCause: pet.deathCause,
    finalCharacter: pet.characterId,
    maxStage: pet.stage,
    mistakes: pet.careMistakes,
  };
}

function care(pet: PetState, now: number, rng: () => number): void {
  if (pet.stage === 'dead' || pet.stage === 'egg') return;
  if (pet.sleeping) {
    if (!pet.lightsOff) toggleLight(pet); // 睡前关灯
    return;
  }
  if (pet.attention === 'discipline-call') scold(pet);
  if (pet.sick) {
    giveMedicine(pet, rng);
    return;
  }
  if (pet.poops > 0) flushPoop(pet);
  if (pet.hungerHearts < 4) {
    feedMeal(pet);
    return;
  }
  if (pet.happinessHearts < 4) {
    if (pet.stage === 'baby') {
      if (pet.snackStreak < 2) feedSnack(pet, now); // baby 不会玩游戏，零食节制
    } else {
      const moves = Array.from({ length: 5 }, () => (rng() < 0.5 ? 'L' : 'R') as 'L' | 'R');
      playGuessGame(pet, moves, rng);
    }
  }
}

function dayNo(now: number): number {
  return Math.floor((now - T0) / DAY);
}

function expect(cond: boolean, msg: string): boolean {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  return cond;
}

console.log('=== 仿真 A：精心照料 18 天 ===');
const a = run(18, 'attentive', 20250106);
console.log('--- 验收 ---');
let ok = true;
ok &&= expect(a.pet.characterId === 'angel' || a.maxStage === 'adult', '活到了成年（或成年后寿终）');
ok &&= expect(a.mistakes <= 1, `照料失误 ≤1（实际 ${a.mistakes}）`);
ok &&= expect(
  ['adult-s', 'adult-a', 'angel'].includes(a.pet.characterId) ||
    ['adult-s', 'adult-a'].includes(a.finalCharacter),
  `进化形态优质（最终 ${a.finalCharacter}）`,
);
ok &&= expect(
  a.deathDay === null || (a.deathCause === 'old-age' && a.deathDay >= 15),
  `若死亡则为寿终（实际 day ${a.deathDay} / ${a.deathCause}）`,
);

console.log('\n=== 仿真 B：放任不管 ===');
const b = run(18, 'neglect', 99);
console.log('--- 验收 ---');
ok &&= expect(b.deathDay !== null && b.deathDay <= 2, `2 天内死亡（实际 day ${b.deathDay}）`);
ok &&= expect(b.deathCause === 'sickness', `死因为生病（实际 ${b.deathCause}）`);

console.log(`\n${ok ? '🎉 M1 仿真验收通过' : '⚠️ 验收未通过'}`);
process.exit(ok ? 0 : 1);
