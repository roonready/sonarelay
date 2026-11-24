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
    <div class="updates-heading">
      <h2>{{ t('updates.title') }}</h2>
      <span v-if="state.currentVersion">{{ state.currentVersion }}</span>
    </div>
    <p v-if="['checking', 'available', 'installing'].includes(state.status)" role="status">
      {{ t('updates.status.' + state.status, { version: state.version }) }}
    </p>
    <div v-if="state.status === 'downloading'" class="updates-progress">
      <progress max="100" :value="state.percent" :aria-label="t('updates.progress')"></progress>
      <span>{{ n(state.percent, 'decimal') }}%</span>
    </div>
    <p v-if="state.error" class="error" role="alert">{{ t(state.error) }}</p>
    <button v-if="state.status === 'downloaded'" @click="install">{{ t('updates.restart') }}</button>
    <button v-if="state.status === 'idle' || state.status === 'error'" @click="check">{{ t('updates.check') }}</button>
  </section>
</template>
<style scoped>
.app-updates{border-top:1px solid #303b50;margin-top:10px;padding-top:6px;display:grid;gap:4px;font-size:12px}
.updates-heading,.updates-progress{display:flex;align-items:center;gap:8px}
.updates-heading{justify-content:space-between}
.updates-heading span{color:#aab5c8}
h2{font-size:13px;margin:0}p{margin:0;line-height:1.35}
progress{flex:1;min-width:0;accent-color:#3989c9}
.error{padding:6px}
button{justify-self:start;padding:4px 7px;border:1px solid #394359;border-radius:5px;background:#28314c;color:inherit;cursor:pointer}
</style>
