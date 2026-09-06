<script setup lang="ts">
import { usePetStore } from '../stores/pet';

const store = usePetStore();
</script>

<template>
  <div v-if="store.offlineSummary" class="scrim" @click.self="store.clearOfflineSummary()">
    <div class="offline-sheet" role="dialog" aria-label="离线摘要">
      <h2>你不在的时候…</h2>
      <ul>
        <li v-for="(line, i) in store.offlineSummary" :key="i">{{ line }}</li>
      </ul>
      <button class="offline-ok ok" @click="store.clearOfflineSummary()">好的</button>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(59, 63, 44, 0.45);
  display: grid;
  place-items: center;
  z-index: 45;
  padding: 16px;
}
.offline-sheet {
  width: min(360px, 100%);
  background: #fffdf6;
  border: 2px solid #3b3f2c;
  border-radius: 14px;
  padding: 18px 22px;
  box-shadow: 6px 6px 0 rgba(59, 63, 44, 0.25);
  font-size: 13px;
  line-height: 1.7;
  color: #4b4237;
}
.offline-sheet h2 {
  margin: 0 0 8px;
  font-size: 16px;
  letter-spacing: 0.08em;
  color: #b0557a;
}
.sheet ul {
  margin: 0;
  padding-left: 1.1em;
}
.ok {
  margin-top: 12px;
  width: 100%;
  padding: 9px 0;
  border-radius: 10px;
  border: 2px solid #3b3f2c;
  background: #f2a7c6;
  color: #5c2440;
  font-weight: 700;
  letter-spacing: 0.2em;
  cursor: pointer;
  touch-action: manipulation;
}
.ok:active {
  transform: translateY(2px);
}
</style>
