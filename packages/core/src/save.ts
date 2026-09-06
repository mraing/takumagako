/**
 * SaveFile v1：持久化容器（§9）。
 * - v1 结构：{ v, savedAt, pet, settings, stats }
 * - 迁移：按版本链式升级，缺失字段用默认值补齐（绝不静默清档，坏档由调用方备份）；
 * - 校验为手写守卫，核心层保持零依赖。
 */
import type { AttentionKind, CharacterId, DeathCause, PetState, Stage } from './types';

export interface SaveSettings {
  muted: boolean;
  shellColor?: string; // M5 机身换色
}

export interface SaveStats {
  friendsMet: number; // M4 联机：见过的朋友数
}

export interface SaveFileV1 {
  v: 1;
  savedAt: number; // 上次落盘时间戳（0 = 迁移来的未知旧档）
  pet: PetState;
  settings: SaveSettings;
  stats: SaveStats;
}

export type DecodeResult =
  | { ok: true; save: SaveFileV1 }
  | { ok: false; reason: string };

const STAGES: readonly Stage[] = ['egg', 'baby', 'child', 'teen', 'adult', 'dead'];
const CHARACTERS: readonly CharacterId[] = [
  'egg', 'baby', 'child', 'teen-a', 'teen-b',
  'adult-s', 'adult-a', 'adult-b', 'adult-c', 'angel',
];

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isStr(x: unknown): x is string {
  return typeof x === 'string';
}

/** PetState 关键字段守卫：必填键类型正确即放行（多余/缺失的可补字段交给迁移兜底） */
export function isPetState(x: unknown): x is PetState {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    isStr(p.id) &&
    isStr(p.name) &&
    isNum(p.generation) &&
    isNum(p.bornAt) &&
    isStr(p.stage) && STAGES.includes(p.stage as Stage) &&
    isStr(p.characterId) && CHARACTERS.includes(p.characterId as CharacterId) &&
    isNum(p.stageSince) &&
    isNum(p.ageYears) &&
    isNum(p.weightG) &&
    isNum(p.hungerHearts) &&
    isNum(p.happinessHearts) &&
    isNum(p.disciplinePct) &&
    isNum(p.poops) &&
    typeof p.sick === 'boolean' &&
    typeof p.sleeping === 'boolean' &&
    typeof p.lightsOff === 'boolean' &&
    isStr(p.attention) && ['none', 'need', 'discipline-call'].includes(p.attention as AttentionKind) &&
    isNum(p.careMistakes) &&
    isNum(p.updatedAt) &&
    (typeof p.deathCause === 'string' && ['sickness', 'old-age'].includes(p.deathCause as DeathCause) || p.deathCause === null || p.deathCause === undefined)
  );
}

/** 迁移链：v0（早期内测裸 pet / 早期 {v:1,pet}）→ v1。未来版本在此追加。 */
function migrateToV1(raw: Record<string, unknown>): SaveFileV1 | null {
  // 早期内测 {v:1, pet} 没有 savedAt/settings/stats；或者直接就是裸 PetState
  const petLike = isPetState(raw.pet) ? raw.pet : isPetState(raw) ? raw : null;
  if (!petLike) return null;
  const isV1 = raw.v === 1;
  const settingsRaw = (isV1 ? raw.settings : null) as SaveSettings | null;
  const statsRaw = (isV1 ? raw.stats : null) as SaveStats | null;
  const settings: SaveSettings = { muted: settingsRaw?.muted === true };
  if (typeof settingsRaw?.shellColor === 'string') settings.shellColor = settingsRaw.shellColor;
  return {
    v: 1,
    savedAt: isNum(raw.savedAt) ? raw.savedAt : 0,
    pet: petLike,
    settings,
    stats: { friendsMet: isNum(statsRaw?.friendsMet) ? statsRaw.friendsMet : 0 },
  };
}

/** 反序列化 + 校验 + 迁移。坏档返回 ok:false，由调用方决定备份与重建。 */
export function decodeSave(raw: string): DecodeResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, reason: 'bad-shape' };
  const obj = data as Record<string, unknown>;

  // 未来版本：宁可拒绝也不回滚
  if (isNum(obj.v) && obj.v > 1) return { ok: false, reason: 'future-version' };

  const migrated = migrateToV1(obj);
  if (!migrated) return { ok: false, reason: 'bad-pet' };
  if (!isPetState(migrated.pet)) return { ok: false, reason: 'bad-pet' };
  return { ok: true, save: migrated };
}

/** 构造一份 v1 存档（store 落盘用） */
export function encodeSave(
  pet: PetState,
  settings: SaveSettings,
  stats: SaveStats,
  now: number,
): string {
  const file: SaveFileV1 = { v: 1, savedAt: now, pet, settings, stats };
  return JSON.stringify(file);
}
