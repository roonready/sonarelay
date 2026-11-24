<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProxySettings } from '../../../shared/types';
import { formatSavedProxy } from '../../../shared/proxy-format';
import { ipc } from '../services/ipc';

const { t } = useI18n();
const proxy = ref('');
const reveal = ref(false);
const hasPassword = ref(false);
const busy = ref(true);
const status = ref('');

function apply(settings: ProxySettings) {
  proxy.value = formatSavedProxy(settings);
  reveal.value = false;
  hasPassword.value = settings.hasPassword;
}

onMounted(async () => {
  try {
    const settings = await ipc.getProxySettings();
    apply(settings);
    if (settings.loadError) status.value = 'proxy.loadError';
  } catch { status.value = 'proxy.loadError'; }
  finally { busy.value = false; }
});

async function save() {
  if (busy.value) return;
  busy.value = true;
  status.value = '';
  try {
    apply(await ipc.saveProxySettings(proxy.value));
    status.value = 'proxy.saved';
  } catch { status.value = 'proxy.saveError'; }
  finally { busy.value = false; }
}
</script>

<template>
  <details class="proxy-settings">
    <summary>{{ t('proxy.title') }}</summary>
    <form autocomplete="off" @submit.prevent="save">
      <p>{{ t('proxy.hint') }}</p>
      <label for="proxy-server">{{ t('proxy.input') }}</label>
      <input id="proxy-server" v-model="proxy" :type="reveal ? 'text' : 'password'" placeholder="proxy.example:8080:user:password"
        maxlength="3400" autocomplete="new-password" spellcheck="false" :disabled="busy">
      <p v-if="hasPassword">{{ t('proxy.passwordSaved') }}</p>
      <div class="proxy-actions">
        <button type="submit" :disabled="busy">{{ t('proxy.save') }}</button>
        <button type="button" :disabled="busy" :aria-pressed="reveal" @click="reveal = !reveal">{{ t(reveal ? 'proxy.hide' : 'proxy.show') }}</button>
      </div>
      <p v-if="status" role="status" :class="{ error: status !== 'proxy.saved' }">{{ t(status) }}</p>
    </form>
  </details>
</template>

<style scoped>
.proxy-settings { border-top: 1px solid #303b50; margin-top: 10px; padding-top: 8px; font-size: 12px; }
summary { cursor: pointer; }
form { display: grid; gap: 4px; margin-top: 6px; }
form p { margin: 0; color: #aab5c8; }
form label { margin: 4px 0 0; }
form input { min-width: 0; padding: 5px 6px; border: 1px solid #394359; border-radius: 5px; background: #1b2230; color: inherit; }
.proxy-actions { display: flex; flex-wrap: wrap; gap: 5px; }
form button { justify-self: start; padding: 4px 7px; border: 1px solid #394359; border-radius: 5px; background: #28314c; color: inherit; cursor: pointer; }
</style>
