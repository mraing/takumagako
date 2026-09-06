<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { usePetStore } from '../stores/pet';
import { renderScene, SCREEN_H, SCREEN_W } from '../renderer/screen';

const store = usePetStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const wrapRef = ref<HTMLDivElement | null>(null);
let raf = 0;
let observer: ResizeObserver | null = null;

const reduceMotion =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 整数倍缩放：宽度 / 32 取整，保证像素完美；--px 供像素网格纹理对齐 */
function rescale(): void {
  const canvas = canvasRef.value;
  const wrap = wrapRef.value;
  if (!canvas || !wrap) return;
  const s = Math.max(4, Math.floor(wrap.clientWidth / SCREEN_W));
  canvas.style.width = `${SCREEN_W * s}px`;
  canvas.style.height = `${SCREEN_H * s}px`;
  wrap.style.setProperty('--px', `${s}px`);
}

function loop(): void {
  const ctx = canvasRef.value?.getContext('2d');
  if (ctx) {
    const snap = store.snapshot();
    renderScene(ctx, { pet: snap.pet, ui: snap.ui, now: reduceMotion ? 0 : performance.now() });
  }
  raf = requestAnimationFrame(loop);
}

onMounted(() => {
  observer = new ResizeObserver(rescale);
  if (wrapRef.value) observer.observe(wrapRef.value);
  rescale();
  raf = requestAnimationFrame(loop);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
});
</script>

<template>
  <div ref="wrapRef" class="lcd-wrap">
    <div class="lcd-frame" :class="{ off: store.pet.sleeping && store.pet.lightsOff }">
      <canvas ref="canvasRef" :width="SCREEN_W" :height="SCREEN_H" class="lcd"></canvas>
      <div class="glass" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.lcd-wrap {
  display: flex;
  justify-content: center;
  padding: 6px 0;
}
.lcd-frame {
  position: relative;
  border-radius: 4px;
  /* 屏幕背光溢到边框上，像真实荧光屏 */
  box-shadow: 0 0 26px 2px rgba(201, 209, 164, 0.3);
  transition: box-shadow 0.8s ease;
}
/* 熄灯睡觉：背光熄灭 */
.lcd-frame.off {
  box-shadow: none;
}
.lcd {
  image-rendering: pixelated;
  display: block;
  border: 2px solid #23241f;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.35);
}
/* 屏面玻璃反光 + 像素网格纹理（--px 与实际像素节距对齐） */
.glass {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      115deg,
      rgba(255, 255, 255, 0.14) 0%,
      rgba(255, 255, 255, 0.05) 28%,
      transparent 30%
    ),
    repeating-linear-gradient(0deg, rgba(35, 40, 20, 0.05) 0 1px, transparent 1px var(--px, 8px)),
    repeating-linear-gradient(90deg, rgba(35, 40, 20, 0.05) 0 1px, transparent 1px var(--px, 8px));
}
</style>
