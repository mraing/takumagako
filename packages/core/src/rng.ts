/** 种子随机数（mulberry32）：测试与仿真可复现 */

export type Rng = () => number; // 返回 [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 以 base 为中心、±jitter 比例抖动的间隔 */
export function nextInterval(rng: Rng, baseMs: number, jitter = 0.2): number {
  return Math.round(baseMs * (1 - jitter + rng() * 2 * jitter));
}

/** [minMs, maxMs) 均匀随机间隔 */
export function rangeMs(rng: Rng, minMs: number, maxMs: number): number {
  return Math.round(minMs + rng() * (maxMs - minMs));
}
