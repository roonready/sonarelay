import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  main: { build: { externalizeDeps: { include: ['sharp','ffmpeg-static','castv2-client','multicast-dns','@sonn-audio/node-airplay','@sonn-audio/node-slimproto'] } } },
  preload: { build: { externalizeDeps: true } },
  renderer: {
    plugins: [vue()],
    server: { host: '127.0.0.1', port: 5180, strictPort: true },
    build: { assetsInlineLimit: 0 },
  },
});
