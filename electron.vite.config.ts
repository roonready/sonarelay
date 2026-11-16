import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  main: { build: { externalizeDeps: { include: ['ffmpeg-static','castv2-client','multicast-dns','@sonn-audio/node-airplay','@sonn-audio/node-slimproto'] } } },
  preload: { build: { externalizeDeps: true } },
  renderer: { plugins: [vue()], build: { assetsInlineLimit: 0 } },
});
