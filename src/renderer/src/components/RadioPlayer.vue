<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { radioStations } from '../../../shared/radio';
import { useRadio } from '../stores/radio';
import { useDevices } from '../stores/devices';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { ipc } from '../services/ipc';
const {t}=useI18n();
const radio=useRadio(),devices=useDevices();
const error=ref('');
async function toggle(id:string){
  error.value='';
  try{await ipc.radioToggle(id,devices.selectedId===LOCAL_OUTPUT_ID?'':devices.selectedId);}
  catch{error.value='radio.connectionError';}
}
</script>
<template>
 <section class="radio-player" :aria-label="t('radio.sources')">
  <button v-for="station in radioStations" :key="station.id" :aria-pressed="radio.active&&radio.state.stationId===station.id" @click="toggle(station.id)">{{ station.name }}</button>
  <p v-if="radio.state.mode==='radio'" role="status" aria-live="polite">{{ t('radio.status.'+radio.state.status) }}</p>
  <p v-if="radio.state.mode==='radio'&&radio.state.metadata.streamTitle">{{ radio.state.metadata.streamTitle }}</p>
  <p v-if="radio.state.mode==='radio'&&radio.state.metadata.station">{{ radio.state.metadata.station }}</p>
  <p v-if="error||radio.state.error" class="error" role="alert">{{ t(error||radio.state.error) }}</p>
 </section>
</template>
<style scoped>
.radio-player{display:grid;gap:10px;margin:18px 0}.radio-player button{padding:12px;border:1px solid #394359;border-radius:8px;background:#1b2230;color:inherit;text-align:left}
.radio-player button[aria-pressed=true]{border-color:#3989c9;background:#20394d}.radio-player p{margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
</style>
