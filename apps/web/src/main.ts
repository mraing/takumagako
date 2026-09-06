import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useNetStore } from './stores/net';
import { usePetStore } from './stores/pet';

const app = createApp(App).use(createPinia());
app.mount('#app');

// dev-only 调试钩子：供视觉走查脚本驱动三键/状态（scripts/snap.mjs）与联机诊断
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pet = usePetStore();
  (window as unknown as Record<string, unknown>).__net = useNetStore();
}

// PWA（M5）：生产构建注册 Service Worker，离线可玩 / 可加到主屏
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
