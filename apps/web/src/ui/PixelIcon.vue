<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ rows: string[]; size?: number; blink?: boolean }>();

const pixels = computed(() => {
  const out: Array<{ x: number; y: number }> = [];
  props.rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') out.push({ x, y });
    });
  });
  return out;
});

const size = computed(() => props.size ?? 24);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 8 8"
    class="pix"
    :class="{ blink }"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect v-for="(p, i) in pixels" :key="i" :x="p.x" :y="p.y" width="1" height="1" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pix { display: block; }
.blink { animation: pix-blink 500ms steps(1) infinite; }
@keyframes pix-blink {
  50% { opacity: 0.15; }
}
@media (prefers-reduced-motion: reduce) {
  .blink { animation: none; opacity: 1; }
}
</style>
