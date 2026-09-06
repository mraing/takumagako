<script setup lang="ts">
import { computed } from 'vue';
import { usePetStore } from '../stores/pet';

const store = usePetStore();

const ICON_NAMES = ['喂食', '灯', '游戏', '医疗', '冲洗', '状态', '管教'];

/** 上下文提示：告诉玩家当前界面三个键各做什么 */
const hint = computed(() => {
  const p = store.pet;
  if (p.stage === 'dead') return '它去了天堂 · 按 A+C 孵新蛋';
  if (p.sleeping) return '它睡着了 · 光标移到「灯」按 B 关灯';
  switch (store.screen) {
    case 'feed':
      return 'A 选择食物 · B 喂它 · C 取消';
    case 'game':
      return store.game.phase === 'ask' ? '猜它会转向哪边：A 左 · B 右' : '结果揭晓…';
    case 'meter':
      return 'A / B 翻页查看 · C 返回';
    default:
      return `「${ICON_NAMES[store.icon] ?? ''}」 A 切换图标 · B 确认 · C 返回`;
  }
});
</script>

<template>
  <div class="hintbar" aria-live="polite">{{ hint }}</div>
</template>

<style scoped>
.hintbar {
  margin-top: 18px;
  padding: 8px 12px;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.4;
  letter-spacing: 0.04em;
  color: var(--shell-hint, #7d3a5c);
  background: rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  box-shadow: inset 0 1px 3px rgba(150, 62, 104, 0.18);
  user-select: none;
}
</style>
