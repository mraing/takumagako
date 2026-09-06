<script setup lang="ts">
import { onMounted, ref } from 'vue';
import PixelIcon from './PixelIcon.vue';
import { ICONS } from '../renderer/sprites';

const SEEN_KEY = 'tk-help-seen';
const open = ref(false);

function close(): void {
  open.value = false;
  localStorage.setItem(SEEN_KEY, '1');
}
function toggle(): void {
  if (open.value) close();
  else open.value = true;
}

// 首次访问自动弹出图例
onMounted(() => {
  if (!localStorage.getItem(SEEN_KEY)) {
    window.setTimeout(() => {
      open.value = true;
    }, 700);
  }
});

const LEGEND = [
  { key: 'feed', name: '喂食', desc: '正餐管饱；零食逗乐，贪多会牙痛' },
  { key: 'light', name: '灯', desc: '睡觉时关灯，亮一整夜算照料失误' },
  { key: 'play', name: '游戏', desc: '猜方向五局三胜：赢了开心还减肥' },
  { key: 'medicine', name: '医疗', desc: '出现骷髅＝生病，打针有时要补一针' },
  { key: 'bath', name: '冲洗', desc: '便便及时冲，堆两堆以上会生病' },
  { key: 'meter', name: '状态', desc: '年龄 / 体重 / 管教度 / 饱食与快乐心' },
  { key: 'discipline', name: '管教', desc: '无理取闹时管教；管教度影响进化' },
  { key: 'attention', name: '注意', desc: '亮起＋哔哔叫＝它有需求，快去看看' },
] as const;

const TIPS = [
  '悉心照料会进化成更棒的形态；放养会长残',
  '它饿了 / 不开心 / 生病时，注意图标会闪烁',
  '关掉页面它也在过日子（离线最多结算 8 小时）',
  '宠物离世后按 A+C 孵下一代，世代延续',
] as const;

function iconRows(key: string): string[] {
  return ICONS[key] ?? [];
}
</script>

<template>
  <button class="fab" aria-label="打开帮助" @click="toggle">?</button>

  <div v-if="open" class="scrim" @click.self="close">
    <div class="sheet" role="dialog" aria-label="使用说明">
      <header class="sheet-head">
        <h2>使用说明</h2>
        <button class="close" aria-label="关闭" @click="close">✕</button>
      </header>

      <section>
        <h3>三个按键</h3>
        <ul class="keys">
          <li><b>A</b>（左键）：移动光标 / 游戏中猜「左」</li>
          <li><b>B</b>（中键）：确认执行 / 游戏中猜「右」</li>
          <li><b>C</b>（右键）：取消返回</li>
          <li><b>A+C</b>：宠物离世后孵新蛋</li>
        </ul>
        <p class="kbd-hint">桌面键盘：<kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> 对应 A B C</p>
      </section>

      <section>
        <h3>八个图标</h3>
        <ul class="legend">
          <li v-for="item in LEGEND" :key="item.key">
            <span class="icon-chip"><PixelIcon :rows="iconRows(item.key)" :size="16" /></span>
            <b>{{ item.name }}</b>
            <span class="desc">{{ item.desc }}</span>
          </li>
        </ul>
      </section>

      <section>
        <h3>养育小贴士</h3>
        <ul class="tips">
          <li v-for="(tip, i) in TIPS" :key="i">{{ tip }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  right: 18px;
  bottom: calc(18px + env(safe-area-inset-bottom));
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid #3b3f2c;
  background: #fffdf6;
  color: #b0557a;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 63, 44, 0.25);
  z-index: 30;
  touch-action: manipulation;
}
.fab:active {
  transform: translateY(2px);
  box-shadow: 1px 1px 0 rgba(59, 63, 44, 0.25);
}
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(59, 63, 44, 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
}
.sheet {
  width: min(430px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  background: #fffdf6;
  border: 2px solid #3b3f2c;
  border-radius: 14px;
  padding: 18px 20px 22px;
  box-shadow: 6px 6px 0 rgba(59, 63, 44, 0.25);
  font-size: 13px;
  line-height: 1.6;
  color: #4b4237;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.sheet-head h2 {
  margin: 0;
  font-size: 17px;
  letter-spacing: 0.08em;
}
.close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1.5px solid #cbbfa8;
  background: #f6efe0;
  color: #8a7f6e;
  cursor: pointer;
  font-size: 13px;
}
.sheet h3 {
  margin: 14px 0 6px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: #b0557a;
}
.sheet ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.keys li,
.tips li {
  padding: 2px 0;
}
.kbd-hint {
  margin: 6px 0 0;
  color: #8a7f6e;
  font-size: 12px;
}
.legend {
  display: grid;
  gap: 4px 14px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}
.icon-chip {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  background: #3b3f2c;
  color: #c9d1a4;
  border-radius: 6px;
}
.legend b {
  flex: none;
  width: 2.2em;
}
.legend .desc {
  color: #6d6355;
  font-size: 12.5px;
}
kbd {
  background: #efe7d6;
  border: 1px solid #cbbfa8;
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
}
</style>
