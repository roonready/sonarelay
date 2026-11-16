<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import type { RendererDevice } from '../../../shared/types';
defineProps<{ device: RendererDevice; selected: boolean }>();
defineEmits<{ select: [] }>();
</script>
<template>
  <button class="device" :class="{ selected }" :aria-pressed="selected" @click="$emit('select')">
    <strong>{{ device.name }}</strong>
    <span>{{ [device.manufacturer, device.model].filter(Boolean).join(' · ') }}</span>
    <span>{{ device.protocol==='slimproto'?'Squeezelite':device.protocol==='airplay2'?'AirPlay 2':device.protocol==='cast'?'Google Cast':device.protocol==='bluos'?'BluOS':'DLNA' }} · {{ device.ip }}</span>
    <small class="online">● {{ t('devices.available') }}{{ selected ? ' · ' + t('devices.selected') : '' }}</small>
  </button>
</template>
