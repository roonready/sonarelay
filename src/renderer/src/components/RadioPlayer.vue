<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { radioStations } from '../../../shared/radio';
import NowPlaying from './NowPlaying.vue';
import { useRadio } from '../stores/radio';
import { useDevices } from '../stores/devices';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { ipc } from '../services/ipc';
import { useReceiverVolume } from '../stores/receiver-volume';
const receiverVolume=useReceiverVolume();
const {t}=useI18n();
const radio=useRadio(),devices=useDevices();
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
 <div class="radio-workspace">
  <section class="radio-player" aria-labelledby="radio-stations-heading">
   <h2 id="radio-stations-heading">{{ t('radio.stations') }}</h2>
   <ul class="station-list">
    <li v-for="station in radioStations" :key="station.id">
     <button type="button" :data-station-id="station.id"
      :disabled="!receiverVolume.canStart&&!(radio.active&&radio.state.stationId===station.id)"
      :aria-pressed="radio.active&&radio.state.stationId===station.id" @click="toggle(station.id)">
      <span class="station-icon" aria-hidden="true">{{ radio.active&&radio.state.stationId===station.id ? '■' : '▶' }}</span>
      {{ station.name }}
     </button>
    </li>
   </ul>
  </section>
  <div class="radio-playback">
   <NowPlaying />
   <div v-if="radio.state.mode==='radio'||error||radio.state.error" class="radio-details">
    <p v-if="radio.state.mode==='radio'" role="status">{{ t('radio.status.'+radio.state.status) }}</p>
    <p v-if="error||radio.state.error" class="error" role="alert">{{ t(error||radio.state.error) }}</p>
   </div>
  </div>
 </div>
</template>
<style scoped>
.radio-workspace{display:grid;grid-template-columns:clamp(210px,23vw,320px) minmax(0,1fr);flex:1;min-width:0}
.radio-player,.radio-playback{display:flex;flex-direction:column;min-height:0;min-width:0}
.radio-player{padding:24px 14px 12px;border-right:1px solid #303744}
.radio-player h2{margin:0 6px 14px;font-size:16px}
.station-list{display:grid;align-content:start;gap:6px;overflow-y:auto;list-style:none;margin:0;padding:5px 6px}
.station-list button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid #394359;border-radius:8px;background:#1b2230;color:inherit;text-align:left;font-size:13px;overflow-wrap:anywhere}
.station-list button[aria-pressed=true]{border-color:#3989c9;background:#20394d}
.station-icon{flex:0 0 14px;color:#b9c5ff;font-size:11px;text-align:center}
.radio-details{flex-shrink:0;max-height:45%;overflow:auto;border-top:1px solid #303744;padding:14px 20px;font-size:12px}
.radio-details p{margin:0;line-height:1.5;overflow-wrap:anywhere}
</style>
