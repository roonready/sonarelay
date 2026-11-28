<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ScrobblerState } from '../../../shared/types';
import { ipc } from '../services/ipc';

const { t, d } = useI18n();
const state = ref<ScrobblerState>();
const url = ref('');
const enabled = ref(false);
const token = ref('');
const busy = ref(false);
const error = ref('');
let unsubscribe: (() => void) | undefined;
let disposed = false;

function fill(value: ScrobblerState) {
  state.value = value;
  url.value = value.url;
  enabled.value = value.enabled;
}
onMounted(async () => {
  unsubscribe = ipc.onScrobblerState(value => { if (!disposed) state.value = value; });
  try {
    const value = await ipc.scrobblerState();
    if (!disposed) fill(value);
  } catch { error.value = 'scrobbler.saveError'; }
});
onUnmounted(() => { disposed = true; unsubscribe?.(); });

async function save() {
  busy.value = true;
  error.value = '';
  try {
    const value = await ipc.saveScrobbler({ url: url.value, enabled: enabled.value, token: token.value || undefined });
    if (!disposed) {
      fill(value);
      token.value = '';
    }
  } catch (reason) {
    const keys = ['invalidUrl', 'invalidToken', 'pendingOrigin', 'tokenRequired'];
    error.value = 'scrobbler.' + (keys.find(key => String(reason).includes('scrobbler.' + key)) ?? 'saveError');
  } finally { busy.value = false; }
}
</script>

<template>
  <section class="scrobbler" :aria-label="t('scrobbler.brand')">
    <h2>{{ t('scrobbler.brand') }}</h2>
    <form v-if="state" @submit.prevent="save">
      <label class="switch"><input v-model="enabled" type="checkbox"> {{ t('scrobbler.enabled') }}</label>
      <label>{{ t('scrobbler.url') }}<input v-model.trim="url" type="url" required maxlength="2048"></label>
      <label>{{ t('scrobbler.token') }}<input v-model.trim="token" type="password" autocomplete="off" maxlength="128"
        :placeholder="state.hasToken ? t('scrobbler.savedToken') : ''"></label>
      <button :disabled="busy">{{ t('scrobbler.save') }}</button>
      <div class="delivery" role="status">
        <p>{{ t('scrobbler.pending', { count: state.pending }) }}</p>
        <p v-if="state.lastSent">{{ t('scrobbler.lastSent', { time: d(state.lastSent, 'time') }) }}</p>
        <p v-if="state.rejected">{{ t('scrobbler.rejected', { count: state.rejected }) }}</p>
        <p v-if="state.error">{{ t('scrobbler.delivery.' + state.error) }}</p>
      </div>
    </form>
    <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
  </section>
</template>

<style scoped>
.scrobbler { margin-top: 14px; padding-top: 12px; border-top: 1px solid #303b50; }
h2 { margin: 0 0 8px; font-size: 15px; }
form, label { display: grid; gap: 6px; }
form { gap: 10px; }
.switch { display: flex; align-items: center; }
.switch input { width: auto; }
input { min-width: 0; }
button { justify-self: start; padding: 8px 10px; border: 1px solid #394359; border-radius: 7px; background: #28314c; }
.delivery p { margin: 2px 0; font-size: 12px; color: #aab5c8; }
</style>
