<script setup lang="ts">
import { computed } from 'vue';
import { usePetStore } from '../stores/pet';
import { ICONS } from '../renderer/sprites';
import PixelIcon from './PixelIcon.vue';
import { haptic } from '../lib/haptics';

const props = defineProps<{ position: 'top' | 'bottom' }>();
const store = usePetStore();

const ORDER = ['feed', 'light', 'play', 'medicine', 'bath', 'meter', 'discipline', 'attention'] as const;
const LABELS: Record<string, string> = {
  feed: '喂食',
  light: '灯',
  play: '游戏',
  medicine: '医疗',
  bath: '冲洗',
  meter: '状态',
  discipline: '管教',
  attention: '注意',
};

const items = computed(() => (props.position === 'top' ? ORDER.slice(0, 4) : ORDER.slice(4)));

function iconRows(key: string): string[] {
  return ICONS[key] ?? [];
}

/** 点击图标：未选中则移动光标；已选中则确认（等效 B） */
function onClick(i: number): void {
  if (i === 7) return; // attention 仅指示
  if (store.icon === i) store.press('B');
  else {
    store.icon = i;
    haptic('tap', store.prefs.haptics);
  }
}
</script>

<template>
  <div class="row">
    <button
      v-for="(key, i) in items"
      :key="key"
      class="slot"
      :class="{
        selected: key !== 'attention' && store.icon === ORDER.indexOf(key) && store.screen === 'main',
        blink: key === 'attention' && store.pet.attention !== 'none',
      }"
      :aria-label="LABELS[key]"
      @click="onClick(ORDER.indexOf(key))"
    >
      <PixelIcon :rows="iconRows(key)" :size="20" />
      <span class="label">{{ LABELS[key] }}</span>
    </button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  padding: 6px 4px;
}
.slot {
  width: 44px;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #9aa38a;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
}
/* 丝印标签：仿真机边框上的印刷字 */
.label {
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: #8f9780;
  user-select: none;
  pointer-events: none;
}
.slot.selected {
  color: #e8eccd;
  background: #3b3f2c;
  box-shadow: inset 0 0 0 1px #565b42;
}
.slot.selected .label {
  color: #e8eccd;
}
.slot.blink {
  color: #ffd98a;
}
.slot.blink .label {
  color: #ffd98a;
}
@media (prefers-reduced-motion: reduce) {
  .slot.blink { color: #ffd98a; }
}
</style>
