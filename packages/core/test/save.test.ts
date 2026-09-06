/** SaveFile v1：读写 / 迁移 / 坏档守卫 */
import { describe, expect, it } from 'vitest';
import { createPet, decodeSave, encodeSave, mulberry32, type PetState } from '../src';

const T0 = new Date(2025, 0, 6, 12, 0, 0).getTime();

function makePet(): PetState {
  return createPet({ id: 'pet-1', name: '小蛋', now: T0, rng: mulberry32(7) });
}

describe('SaveFile v1', () => {
  it('编码→解码往返无损', () => {
    const pet = makePet();
    const raw = encodeSave(pet, { muted: false }, { friendsMet: 3 }, T0 + 1000);
    const r = decodeSave(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.v).toBe(1);
      expect(r.save.savedAt).toBe(T0 + 1000);
      expect(r.save.pet.id).toBe('pet-1');
      expect(r.save.settings).toEqual({ muted: false });
      expect(r.save.stats).toEqual({ friendsMet: 3 });
    }
  });

  it('迁移早期 {v:1, pet}（缺 savedAt/settings/stats）', () => {
    const legacy = JSON.stringify({ v: 1, pet: makePet() });
    const r = decodeSave(legacy);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.savedAt).toBe(0); // 未知旧档
      expect(r.save.settings).toEqual({ muted: false });
      expect(r.save.stats).toEqual({ friendsMet: 0 });
      expect(r.save.pet.id).toBe('pet-1');
    }
  });

  it('迁移裸 PetState（无包装）', () => {
    const r = decodeSave(JSON.stringify(makePet()));
    expect(r.ok).toBe(true);
  });

  it('坏 JSON / 错误结构 / 未来版本 → ok:false（绝不静默清档）', () => {
    expect(decodeSave('{oops').ok).toBe(false);
    expect(decodeSave('null').ok).toBe(false);
    expect(decodeSave('{"v":1,"pet":{"id":"x"}}').ok).toBe(false); // pet 结构不完整
    expect(decodeSave(JSON.stringify({ v: 2, pet: makePet() })).ok).toBe(false);
    const bad = { ...makePet(), stage: 'dragon' };
    expect(decodeSave(JSON.stringify(bad)).ok).toBe(false);
  });

  it('解码时 pet 数字为 NaN/Infinity → 拒绝', () => {
    const pet = makePet() as unknown as Record<string, unknown>;
    pet.weightG = Number.NaN;
    expect(decodeSave(JSON.stringify(pet)).ok).toBe(false);
  });
});
