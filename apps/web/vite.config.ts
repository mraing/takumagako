import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 开放局域网访问：手机 / 平板连同一 Wi-Fi 即可访问（dev 与 preview 都生效）
  server: { host: true },
  preview: { host: true },
});
