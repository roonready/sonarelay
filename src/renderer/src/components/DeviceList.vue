<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { useDevices } from '../stores/devices';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { computed } from 'vue';
import PlaybackWait from './PlaybackWait.vue';
const store = useDevices();
const searchStartedAt=Date.now();
const initialSearch=computed(()=>store.state.lastScan===null&&(store.state.scanning||!store.state.error));

</script>
<template>
  <section class="devices" :aria-label="t('devices.outputs')">
    <label for="audio-output">{{ t('devices.receiver') }}</label>
    <select id="audio-output" v-model="store.selectedId">
      <option :value="LOCAL_OUTPUT_ID">{{ t('devices.localOption') }}</option>
      <option v-for="device in store.receiverOptions" :key="device.id" :value="device.id">
        {{ device.label }}
      </option>
    </select>
    <PlaybackWait v-if="initialSearch" :started-at="searchStartedAt" :label="t('devices.networkSearching')" />
    <div v-if="!store.state.devices.length&&!initialSearch" class="empty">
      <strong>{{ t(store.state.scanning ? 'devices.searching' : 'devices.empty') }}</strong>
      <p>{{ t('devices.help') }}</p>
    </div>
  </section>
</template>
