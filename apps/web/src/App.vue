<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { usePetStore } from './stores/pet';
import { useNetStore } from './stores/net';
import DeviceShell from './ui/DeviceShell.vue';
import HelpOverlay from './ui/HelpOverlay.vue';
import OfflineSummary from './ui/OfflineSummary.vue';
import NetPanel from './ui/NetPanel.vue';
import { useRoomTime } from './ui/useRoomTime';

const store = usePetStore();
const net = useNetStore();
const netSheetOpen = ref(false);
const drawerOpen = ref(false);

// 「活的房间」：跟随真实时间 + 宠物熄灯睡觉联动
const lightsOut = computed(() => store.pet.sleeping && store.pet.lightsOff);
const { period, roomDark } = useRoomTime(lightsOut);
const room = computed(() => (roomDark.value ? 'dark' : period.value));

// URL 带 ?room= → 自动加入（扫码/链接配对）
onMounted(() => {
  const room = new URLSearchParams(location.search).get('room');
  if (room && /^\d{6}$/.test(room)) void net.joinRoom(room);
});
</script>

<template>
  <main class="page" :data-room="room">
    <!-- 房间：随本地时间流转的天空 + 熄灯压暗层 + 落地暗角 -->
    <div class="room" aria-hidden="true">
      <div class="sky dawn"></div>
      <div class="sky day"></div>
      <div class="sky dusk"></div>
      <div class="sky night"></div>
      <div class="dim"></div>
      <div class="floor"></div>
    </div>

    <div class="stage">
      <DeviceShell />
      <div class="device-shadow" aria-hidden="true"></div>
    </div>

    <!-- 说明书抽屉：桌面端右缘拉手拉出 -->
    <div class="drawer" :class="{ open: drawerOpen }">
      <button
        class="drawer-tab"
        :aria-expanded="drawerOpen"
        aria-label="打开或收起说明书"
        @click="drawerOpen = !drawerOpen"
      >
        说明书
      </button>
      <aside class="manual">
        <h1>拓麻歌子 · Web</h1>
        <p class="sub">完全复刻初代玩法 · 第 {{ store.pet.generation }} 代</p>

        <dl class="stats">
          <div><dt>名字</dt><dd>{{ store.pet.name }}</dd></div>
          <div><dt>年龄</dt><dd>{{ store.pet.ageYears }} 岁</dd></div>
          <div><dt>体重</dt><dd>{{ store.pet.weightG }}g</dd></div>
          <div><dt>照料失误</dt><dd>{{ store.pet.careMistakes }} 次</dd></div>
        </dl>

        <section class="help">
          <h2>操作</h2>
          <ul>
            <li><b>A</b>：移动图标光标 / 游戏猜左</li>
            <li><b>B</b>：确认 / 游戏猜右</li>
            <li><b>C</b>：取消返回</li>
            <li><b>A+C</b>：离世后孵新蛋</li>
            <li>键盘：<kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd></li>
          </ul>
        </section>

        <section class="journal">
          <h2>手账</h2>
          <p v-if="store.log.length === 0" class="empty">还没有记录…</p>
          <ul>
            <li v-for="(item, i) in store.log" :key="i">{{ item }}</li>
          </ul>
        </section>

        <section class="netcard">
          <NetPanel />
        </section>
      </aside>
    </div>

    <!-- 移动端联机入口 -->
    <button class="net-fab" aria-label="打开联机面板" @click="netSheetOpen = true">联</button>
    <div v-if="netSheetOpen" class="net-scrim" @click.self="netSheetOpen = false">
      <div class="net-sheet">
        <NetPanel />
        <button class="net-close" aria-label="关闭联机面板" @click="netSheetOpen = false">收起</button>
      </div>
    </div>

    <HelpOverlay />
    <OfflineSummary />
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  overflow-x: hidden;
  font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-monospace, monospace;
  color: #4b4237;
}
</style>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px calc(32px + env(safe-area-inset-bottom));
  background: #10162e; /* 兜底夜色，天空层未渲染前不闪白 */
  overflow: hidden;
}

/* ---------- 房间：时间天空 ---------- */
.room {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.sky {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 2.2s ease;
}
/* 黎明：冷蓝到蜜桃 */
.sky.dawn {
  background: linear-gradient(180deg, #b8c7e8 0%, #eec3a6 52%, #f7e3c8 100%);
}
/* 白天：晴空到暖地 */
.sky.day {
  background: linear-gradient(180deg, #a9d4de 0%, #d8ece6 58%, #ede8d2 100%);
}
/* 黄昏：紫到橘 */
.sky.dusk {
  background: linear-gradient(180deg, #4e4a78 0%, #b76e79 46%, #e8a87c 100%);
}
/* 夜晚：藏蓝 + 微星 */
.sky.night {
  background-color: #10162e;
  background-image:
    radial-gradient(circle, rgba(245, 239, 217, 0.9) 0.8px, transparent 1.4px),
    radial-gradient(circle, rgba(245, 239, 217, 0.55) 0.7px, transparent 1.2px),
    linear-gradient(180deg, #10162e 0%, #1d2747 58%, #2a3352 100%);
  background-size:
    170px 170px,
    260px 260px,
    100% 100%;
  background-position:
    24px 40px,
    120px 150px,
    0 0;
}
.page[data-room='dawn'] .sky.dawn,
.page[data-room='day'] .sky.day,
.page[data-room='dusk'] .sky.dusk {
  opacity: 1;
}
.page[data-room='dark'] .sky.night {
  opacity: 1;
}
/* 熄灯/夜晚压暗：让机身只剩轮廓光 */
.dim {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 42%, rgba(8, 11, 26, 0.42) 0%, rgba(8, 11, 26, 0.72) 100%);
  opacity: 0;
  transition: opacity 2.2s ease;
}
.page[data-room='dark'] .dim {
  opacity: 1;
}
/* 地面暗角：给机身一个「坐着」的平面感 */
.floor {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 58%, rgba(24, 20, 34, 0.16) 88%, rgba(24, 20, 34, 0.26) 100%);
}

/* ---------- 舞台：机身 + 呼吸 + 接触影 ---------- */
.stage {
  position: relative;
  z-index: 1;
  animation: breathe 7s ease-in-out infinite alternate;
}
.device-shadow {
  position: absolute;
  left: 50%;
  bottom: -30px;
  transform: translateX(-50%);
  width: 72%;
  height: 44px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(38, 30, 48, 0.34), transparent 68%);
  filter: blur(5px);
  transition: opacity 2.2s ease;
}
.page[data-room='dark'] .device-shadow {
  opacity: 0.5;
}
@keyframes breathe {
  from {
    transform: translateY(0) rotate(-0.35deg);
  }
  to {
    transform: translateY(-5px) rotate(0.35deg);
  }
}

/* 熄灯后的机身：月光轮廓光，投影收敛，整机随房间一起暗下来 */
.page[data-room='dark'] :deep(.device) {
  filter: brightness(0.78) saturate(0.85);
  box-shadow:
    inset 0 -20px 34px var(--shell-deep),
    inset 0 16px 26px rgba(255, 255, 255, 0.22),
    inset 0 2px 18px rgba(150, 178, 255, 0.28),
    0 18px 36px rgba(6, 8, 20, 0.55);
}

/* ---------- 说明书抽屉 ---------- */
.drawer {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 25;
  transform: translate(100%, -50%);
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer.open {
  transform: translate(0, -50%);
}
.drawer-tab {
  position: absolute;
  left: -36px;
  top: 24px;
  writing-mode: vertical-rl;
  letter-spacing: 0.35em;
  font-size: 12px;
  font-weight: 700;
  padding: 14px 0;
  width: 36px;
  border: 2px solid #3b3f2c;
  border-right: none;
  border-radius: 10px 0 0 10px;
  background: #fffdf6;
  color: #6d6355;
  cursor: pointer;
  box-shadow: -3px 3px 0 rgba(59, 63, 44, 0.14);
}
.drawer-tab:hover {
  background: #f6efe0;
}
.manual {
  width: 264px;
  max-height: 86vh;
  overflow-y: auto;
  background: #fffdf6;
  border: 2px solid #3b3f2c;
  border-right: none;
  border-radius: 14px 0 0 14px;
  padding: 18px 20px;
  box-shadow: -6px 6px 0 rgba(59, 63, 44, 0.14);
  font-size: 13px;
  line-height: 1.65;
}
.manual h1 {
  margin: 0;
  font-size: 20px;
  letter-spacing: 0.06em;
}
.sub {
  margin: 4px 0 12px;
  color: #8a7f6e;
  font-size: 12px;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0 0 14px;
  padding: 10px 12px;
  background: #f6efe0;
  border-radius: 8px;
}
.stats div {
  display: flex;
  justify-content: space-between;
}
.stats dt {
  color: #8a7f6e;
  font-size: 12px;
}
.stats dd {
  margin: 0;
  font-weight: 700;
}
.manual h2 {
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #b0557a;
  margin: 0 0 6px;
}
.help {
  margin-bottom: 12px;
}
.help ul,
.journal ul {
  margin: 0;
  padding-left: 1.1em;
}
.help li {
  font-size: 12.5px;
}
.journal ul {
  max-height: 130px;
  overflow-y: auto;
  font-size: 12px;
  color: #5d5548;
}
.journal .empty {
  color: #a89c8a;
  font-size: 12px;
}
kbd {
  background: #efe7d6;
  border: 1px solid #cbbfa8;
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
}
.netcard {
  margin-top: 12px;
  border-top: 1.5px dashed #cbbfa8;
  padding-top: 10px;
}
.netcard h2 {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #b0557a;
}
@media (max-width: 900px) {
  .drawer {
    display: none;
  }
}

/* ---------- 移动端联机入口（保持原样） ---------- */
.net-fab {
  display: none;
}
@media (max-width: 900px) {
  .net-fab {
    display: block;
    position: fixed;
    right: 18px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: 2px solid #3b3f2c;
    background: #f2a7c6;
    color: #5c2440;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 3px 3px 0 rgba(59, 63, 44, 0.25);
    z-index: 30;
    touch-action: manipulation;
  }
  .net-fab:active {
    transform: translateY(2px);
  }
}
.net-scrim {
  position: fixed;
  inset: 0;
  background: rgba(20, 20, 34, 0.5);
  display: grid;
  align-items: end;
  z-index: 40;
}
.net-sheet {
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
  background: #fffdf6;
  border: 2px solid #3b3f2c;
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  padding: 18px 20px calc(20px + env(safe-area-inset-bottom));
  box-shadow: 0 -6px 0 rgba(59, 63, 44, 0.12);
}
.net-close {
  margin-top: 10px;
  width: 100%;
  padding: 9px 0;
  border-radius: 10px;
  border: 2px solid #3b3f2c;
  background: #f6efe0;
  color: #6d6355;
  font-weight: 700;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .stage {
    animation: none;
  }
  .sky,
  .dim,
  .device-shadow {
    transition: none;
  }
}
</style>
