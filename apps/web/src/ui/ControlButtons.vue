<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted } from 'vue';
import { usePetStore } from '../stores/pet';

const store = usePetStore();

/** 机身微倾回调（DeviceShell provide）；未提供时静默降级 */
const tiltDevice = inject<(key: 'A' | 'B' | 'C') => void>('deviceTilt', () => {});

const KEY_MAP: Record<string, 'A' | 'B' | 'C'> = { z: 'A', x: 'B', c: 'C', Z: 'A', X: 'B', C: 'C' };

function onKey(e: KeyboardEvent): void {
  if (e.repeat) return;
  const target = e.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
  const key = KEY_MAP[e.key];
  if (key) {
    e.preventDefault();
    tiltDevice(key);
    store.press(key);
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

/** 触屏按压：轻微震动反馈（支持的手机上） */
function tap(key: 'A' | 'B' | 'C'): void {
  navigator.vibrate?.(8);
  tiltDevice(key);
  store.press(key);
}
</script>

<template>
  <div class="buttons">
    <button class="key a" aria-label="A 键" @pointerdown.prevent="tap('A')">A</button>
    <button class="key b" aria-label="B 键" @pointerdown.prevent="tap('B')">B</button>
    <button class="key c" aria-label="C 键" @pointerdown.prevent="tap('C')">C</button>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 34px;
  margin-top: 22px;
}
.key {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px solid #b9b0a4;
  background: radial-gradient(circle at 35% 30%, #ffffff, #ddd8ce 60%, #c9c2b6);
  color: #6f685e;
  font-weight: 700;
  font-size: 17px;
  cursor: pointer;
  box-shadow: 0 5px 0 #a99f92, inset 0 2px 4px rgba(255, 255, 255, 0.8);
  touch-action: manipulation;
  user-select: none;
}
.key.b {
  width: 62px;
  height: 62px;
}
.key:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 #a99f92, inset 0 2px 4px rgba(0, 0, 0, 0.15);
}
.key:focus-visible {
  outline: 3px solid #d2587c;
  outline-offset: 2px;
}
/* 移动端更大触控面积 */
@media (max-width: 480px) {
  .buttons {
    gap: 34px;
  }
  .key {
    width: 56px;
    height: 56px;
    font-size: 18px;
  }
  .key.b {
    width: 66px;
    height: 66px;
  }
}
</style>
