/**
 * 方波音效（§7）：WebAudio 程序化生成，零资源文件。
 * 原机音色近似：1-bit 方波 beep。muted 时静默。
 * 注意：AudioContext 需用户手势后才能出声——首次按键时惰性创建。
 */
import type { PetEvent } from '@takumagako/core';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(freq: number, durMs: number, delayMs = 0, gain = 0.04): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

/** 音效类型（对应原机场景） */
export type SfxName = 'key' | 'attention' | 'win' | 'hatch' | 'error';

/** 音效永不阻塞输入：任何音频异常都静默吞掉（按钮必须始终可用） */
export function playSfx(name: SfxName, muted: boolean): void {
  if (muted) return;
  try {
    switch (name) {
      case 'key':
        beep(1245, 40);
        break;
      case 'attention': // 哔—哔：原机叫唤声
        beep(990, 90);
        beep(990, 90, 140);
        break;
      case 'win': // 三连升调
        beep(784, 90);
        beep(988, 90, 110);
        beep(1319, 160, 220);
        break;
      case 'hatch':
        beep(660, 70);
        beep(880, 70, 90);
        beep(1175, 140, 180);
        break;
      case 'error':
        beep(220, 160);
        break;
    }
  } catch {
    /* 音频不可用时静默 */
  }
}

/** 事件 → 音效映射（pet store 调用） */
export function sfxForEvent(e: PetEvent): SfxName | null {
  switch (e.type) {
    case 'hatched':
    case 'evolved':
      return 'hatch';
    case 'call':
      return 'attention';
    case 'sick':
      return 'error';
    case 'died':
      return 'error';
    default:
      return null;
  }
}
