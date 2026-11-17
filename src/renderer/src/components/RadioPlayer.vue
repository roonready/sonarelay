<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { radioStations, radioOutputInfo } from '../../../shared/radio';
import type { LiveState } from '../../../shared/types';
import RadioStreamDetails from './RadioStreamDetails.vue';
import { useRadio } from '../stores/radio';
import { useDevices } from '../stores/devices';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { ipc } from '../services/ipc';
import { useReceiverVolume } from '../stores/receiver-volume';
const receiverVolume=useReceiverVolume();
const {t}=useI18n();
const radio=useRadio(),devices=useDevices();
const live=ref<LiveState>();
const stopLive=ipc.onLiveState(state=>{live.value=state;});
onUnmounted(stopLive);
const outputInfo=computed(()=>radio.active?radioOutputInfo(radio.state.outputId,live.value):null);
const error=ref('');
async function toggle(id:string){
  error.value='';
  try{
    if(!(radio.active&&radio.state.stationId===id))await receiverVolume.ready(devices.selectedId);
    await ipc.radioToggle(id,devices.selectedId===LOCAL_OUTPUT_ID?'':devices.selectedId);
  }
  catch{error.value=receiverVolume.canStart?'radio.connectionError':'volume.selectionFailed';}
}
</script>
<template>
 <section class="radio-player" :aria-label="t('radio.sources')">
  <button v-for="station in radioStations" :key="station.id" :disabled="!receiverVolume.canStart&&!(radio.active&&radio.state.stationId===station.id)" :aria-pressed="radio.active&&radio.state.stationId===station.id" @click="toggle(station.id)">{{ station.name }}</button>
  <p v-if="radio.state.mode==='radio'" role="status" aria-live="polite">{{ t('radio.status.'+radio.state.status) }}</p>
  <p v-if="radio.state.mode==='radio'&&radio.state.metadata.streamTitle">{{ radio.state.metadata.streamTitle }}</p>
  <p v-if="radio.state.mode==='radio'&&radio.state.metadata.station">{{ radio.state.metadata.station }}</p>
  <RadioStreamDetails v-if="radio.state.mode==='radio'&&(radio.active||radio.state.stream)" :stream="radio.state.stream??null" :output="outputInfo" />
  <p v-if="error||radio.state.error" class="error" role="alert">{{ t(error||radio.state.error) }}</p>
 </section>
</template>
<style scoped>
.radio-player{display:grid;gap:10px;margin:18px 0}.radio-player button{padding:12px;border:1px solid #394359;border-radius:8px;background:#1b2230;color:inherit;text-align:left}
.radio-player button[aria-pressed=true]{border-color:#3989c9;background:#20394d}.radio-player p{margin:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
</style>
