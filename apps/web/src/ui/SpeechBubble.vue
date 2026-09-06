<script setup lang="ts">
import { usePetStore } from '../stores/pet';

const store = usePetStore();
</script>

<template>
  <Transition name="pop">
    <div v-if="store.notice" class="bubble" role="status">{{ store.notice.text }}</div>
  </Transition>
</template>

<style scoped>
.bubble {
  position: absolute;
  top: 34px;
  right: -26px;
  max-width: 180px;
  background: #fffdf6;
  border: 2px solid #3b3f2c;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #3b3f2c;
  box-shadow: 4px 4px 0 rgba(59, 63, 44, 0.18);
  z-index: 5;
}
.bubble::before {
  content: '';
  position: absolute;
  left: -8px;
  bottom: 10px;
  width: 12px;
  height: 12px;
  background: #fffdf6;
  border-left: 2px solid #3b3f2c;
  border-bottom: 2px solid #3b3f2c;
  transform: rotate(45deg);
}
.pop-enter-active,
.pop-leave-active {
  transition: transform 160ms ease, opacity 160ms ease;
}
.pop-enter-from,
.pop-leave-to {
  transform: translateY(6px) scale(0.92);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition: none;
  }
}
</style>
