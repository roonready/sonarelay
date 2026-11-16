<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppUpdateState } from '../../../shared/types';
import { ipc } from '../services/ipc';
const { t, n } = useI18n();
const state = ref<AppUpdateState>({ status: 'disabled', channel: 'stable', currentVersion: '', version: '', percent: 0, error: '' });
let disposed = false, revision = 0, unsubscribe: (() => void) | undefined;
onMounted(async () => {
  unsubscribe = ipc.onUpdateState(value => { if (!disposed) { revision++; state.value = value; } });
  const before = revision;
  try { const value = await ipc.getUpdateState(); if (!disposed && revision === before) state.value = value; }
  catch { if (!disposed) state.value = { ...state.value, status: 'error', error: 'updates.checkError' }; }
});
onUnmounted(() => { disposed = true; unsubscribe?.(); });
async function check() {
  try { const value = await ipc.checkUpdates(); if (!disposed) state.value = value; }
  catch { if (!disposed) state.value = { ...state.value, status: 'error', error: 'updates.checkError' }; }
}
async function install() {
  try { await ipc.installUpdate(); }
  catch { if (!disposed) state.value = { ...state.value, status: 'error', error: 'updates.installError' }; }
}
</script>
<template>
  <section class="app-updates" :aria-label="t('updates.title')">
    <h2>{{ t('updates.title') }}</h2>
    <p v-if="state.currentVersion">{{ t('updates.version', { version: state.currentVersion, channel: t('updates.channel.' + state.channel) }) }}</p>
    <p role="status" aria-live="polite">{{ t('updates.status.' + state.status, { version: state.version }) }}</p>
    <template v-if="state.status === 'downloading'">
      <progress max="100" :value="state.percent" :aria-label="t('updates.progress')"></progress>
      <p>{{ t('updates.percent', { percent: n(state.percent, 'decimal') }) }}</p>
    </template>
    <p v-if="state.error" class="error" role="alert">{{ t(state.error) }}</p>
    <button v-if="state.status === 'downloaded'" @click="install">{{ t('updates.restart') }}</button>
    <button v-if="state.status === 'idle' || state.status === 'error'" @click="check">{{ t('updates.check') }}</button>
  </section>
</template>
<style scoped>
.app-updates{border-top:1px solid #303b50;margin-top:18px;padding-top:14px;display:grid;gap:8px;font-size:12px}
h2{font-size:14px;margin:0}p{margin:0;line-height:1.5}progress{width:100%;accent-color:#3989c9}
button{padding:9px;border:1px solid #394359;border-radius:7px;background:#28314c;color:inherit;cursor:pointer}
</style>
