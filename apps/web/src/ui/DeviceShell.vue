<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { usePetStore } from '../stores/pet';
import IconMenu from './IconMenu.vue';
import LcdScreen from './LcdScreen.vue';
import ControlButtons from './ControlButtons.vue';
import SpeechBubble from './SpeechBubble.vue';
import HintBar from './HintBar.vue';

const store = usePetStore();
onMounted(() => store.start());
onBeforeUnmount(() => store.stop());

// 宠物叫唤：机身像真机在桌上震动一样轻颠
const calling = computed(() => store.pet.attention !== 'none');

// 按键微倾：ControlButtons 通过 inject 上报，机身朝受力方向倾斜
type TiltKey = '' | 'a' | 'b' | 'c';
const tilt = ref<TiltKey>('');
let tiltTimer = 0;
provide('deviceTilt', (key: 'A' | 'B' | 'C') => {
  tilt.value = key.toLowerCase() as TiltKey;
  window.clearTimeout(tiltTimer);
  tiltTimer = window.setTimeout(() => {
    tilt.value = '';
  }, 140);
});
onBeforeUnmount(() => window.clearTimeout(tiltTimer));
</script>

<template>
  <div
    class="device"
    :class="[`c-${store.settings.shellColor}`, { calling }, tilt ? `tilt-${tilt}` : '']"
  >
    <div class="ring" aria-hidden="true"></div>
    <!-- 机身印刷贴花 -->
    <svg class="decal d1" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l2.4 6.2L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.6-.8z" fill="currentColor" />
    </svg>
    <svg class="decal d2" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21C7 16.5 3 13.3 3 9.6 3 6.8 5.2 5 7.5 5c1.7 0 3.4.9 4.5 2.6C13.1 5.9 14.8 5 16.5 5 18.8 5 21 6.8 21 9.6c0 3.7-4 6.9-9 11.4z" fill="currentColor" />
    </svg>
    <div class="bezel">
      <IconMenu position="top" />
      <LcdScreen />
      <IconMenu position="bottom" />
    </div>
    <HintBar />
    <ControlButtons />
    <SpeechBubble />
    <div class="serial">TAKUMAGAKO-1</div>
  </div>
</template>

<style scoped>
.device {
  position: relative;
  width: 448px;
  max-width: 94vw;
  margin-inline: auto;
  padding: 52px 28px 32px;
  border-radius: 46% 46% 44% 44% / 52% 52% 46% 46%;
  /* 三色机身（M5 换色）：粉 / 蓝 / 黄 */
  --shell-1: #ffd9e6;
  --shell-2: #f2a7c6;
  --shell-3: #d487ab;
  --shell-deep: rgba(150, 62, 104, 0.28);
  --shell-hint: #7d3a5c;
  --shell-ring: #d9a8c2;
  --shell-decal: #e08cb4;
  background:
    radial-gradient(ellipse 60% 34% at 30% 12%, rgba(255, 255, 255, 0.75), transparent 62%),
    linear-gradient(118deg, rgba(255, 255, 255, 0.38) 0%, rgba(255, 255, 255, 0.06) 26%, transparent 34%),
    linear-gradient(298deg, rgba(255, 255, 255, 0.16) 0%, transparent 20%),
    linear-gradient(160deg, var(--shell-1) 0%, var(--shell-2) 55%, var(--shell-3) 100%);
  box-shadow:
    inset 0 -22px 36px var(--shell-deep),
    inset 0 18px 28px rgba(255, 255, 255, 0.55),
    0 28px 48px var(--shell-deep);
  transition: transform 0.13s ease-out, box-shadow 2.2s ease, filter 2.2s ease;
}
.device.c-blue {
  --shell-1: #d9ecff;
  --shell-2: #a7c8f2;
  --shell-3: #7ba0d4;
  --shell-deep: rgba(52, 84, 138, 0.28);
  --shell-hint: #3a5c7d;
  --shell-ring: #a8c2d9;
  --shell-decal: #8cb4e0;
}
.device.c-yellow {
  --shell-1: #fff3d9;
  --shell-2: #f2d189;
  --shell-3: #d4ab55;
  --shell-deep: rgba(138, 100, 40, 0.28);
  --shell-hint: #7d5c3a;
  --shell-ring: #d9c2a8;
  --shell-decal: #e0c08c;
}
/* 按键微倾：朝受力方向倒 */
.device.tilt-a {
  transform: rotate(-1.4deg) translateX(-2px);
}
.device.tilt-c {
  transform: rotate(1.4deg) translateX(2px);
}
.device.tilt-b {
  transform: translateY(2px) scale(0.996);
}
/* 叫唤轻颠：周期里只有一瞬间在动 */
.device.calling {
  animation: nudge 2.8s ease-in-out infinite;
}
@keyframes nudge {
  0%,
  86%,
  100% {
    transform: none;
  }
  89% {
    transform: translateY(-4px) rotate(-1deg);
  }
  93% {
    transform: translateY(0) rotate(0.7deg);
  }
  96% {
    transform: translateY(-2px);
  }
}
.ring {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: 38px;
  height: 38px;
  border: 9px solid var(--shell-ring);
  border-radius: 50%;
  box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.6), 0 2px 3px var(--shell-deep);
}
.bezel {
  background: linear-gradient(180deg, #4b4b48, #3a3a37);
  border-radius: 24px;
  padding: 10px 16px 12px;
  box-shadow:
    inset 0 2px 6px rgba(255, 255, 255, 0.12),
    inset 0 -3px 8px rgba(0, 0, 0, 0.5),
    0 2px 0 rgba(255, 255, 255, 0.25);
}
.decal {
  position: absolute;
  color: var(--shell-decal, #e08cb4);
  opacity: 0.55;
  pointer-events: none;
  z-index: 0;
}
.decal.d1 {
  top: 30px;
  right: 40px;
  transform: rotate(16deg);
}
.decal.d2 {
  bottom: 38px;
  left: 36px;
  transform: rotate(-12deg);
}
.serial {
  margin-top: 16px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--shell-hint);
  opacity: 0.55;
  user-select: none;
}
@media (prefers-reduced-motion: reduce) {
  .device {
    transition: box-shadow 0.01s;
  }
  .device.calling {
    animation: none;
  }
  .device.tilt-a,
  .device.tilt-b,
  .device.tilt-c {
    transform: none;
  }
}
</style>
