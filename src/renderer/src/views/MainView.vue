<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { localizeError } from '../i18n';
const { t } = useI18n();
import { onMounted, onUnmounted } from 'vue';
import { useDevices } from '../stores/devices';
import DeviceList from '../components/DeviceList.vue';
import DeviceControls from '../components/DeviceControls.vue';
import LastfmSettings from '../components/LastfmSettings.vue';
import AppUpdates from '../components/AppUpdates.vue';
import RadioPlayer from '../components/RadioPlayer.vue';
import { useRadio } from '../stores/radio';
const radio=useRadio();
const store = useDevices();
let cleanup: (() => void) | undefined;
let disposed = false;
onMounted(async () => {
  try { const stops = await Promise.all([store.init(),radio.init()]);const stop=()=>stops.forEach(stop=>stop()); if (disposed) stop(); else cleanup = stop; }
  catch (error) { store.state.error = String(error); }
});
onUnmounted(() => { disposed = true; cleanup?.(); });
function changeInterface(event: Event) { void store.scan((event.target as HTMLSelectElement).value); }
</script>
<template>
  <aside class="panel">
    <header><img src="/favicon.svg" width="40" height="40" alt="" aria-hidden="true"><span class="brand">{{ t('app.brand') }}</span><h1>{{ t('devices.title') }}</h1><p>{{ t('app.protocols') }}</p></header>
    <RadioPlayer />
    <label for="network">{{ t('network.label') }}</label>
    <select id="network" :value="store.state.selectedAddress" @change="changeInterface">
      <option value="" disabled>{{ t('network.choose') }}</option>
      <option v-for="network in store.state.interfaces" :key="network.address" :value="network.address">
        {{ network.name }} · {{ network.address }}{{ network.virtual ? t('network.virtual') : '' }}
      </option>
    </select>
    <p class="error" v-if="store.state.error" role="alert">{{ localizeError(store.state.error) }}</p>
    <DeviceList />
    <DeviceControls />
    <LastfmSettings />
    <AppUpdates />
  </aside>
</template>
