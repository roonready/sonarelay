<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { localizeError, localizeMessage } from '../i18n';
const { t, n } = useI18n();
import { ref, shallowRef, watch, computed, onMounted, onUnmounted } from 'vue';
import type { LiveState } from '../../../shared/types';
import { useDevices } from '../stores/devices';
import { ipc } from '../services/ipc';
import { SelectionRouter } from '../services/selection-router';
import { LOCAL_OUTPUT_ID } from '../services/output';
import PlaybackWait from './PlaybackWait.vue';
import { useReceiverVolume } from '../stores/receiver-volume';
const receiverVolume=useReceiverVolume();
const props = defineProps<{ sourceId?: string; playing: boolean }>();
const devices=useDevices();
const routeError=ref('');
const busy=ref(false),message=ref(''),live=ref<LiveState>();
const waitingSince=ref<number|null>(null);
let revision=0,disposed=false;
const selected=computed(()=>devices.state.devices.find(d=>d.id===devices.selectedId));
const isLocal=computed(()=>devices.selectedId===LOCAL_OUTPUT_ID);
const isLive=computed(()=>live.value?.active===true && live.value.deviceId===devices.selectedId);
const volumeDraft=shallowRef<{id:string;value:number}>();
const volumeValue=computed(()=>{
 const id=devices.selectedId;
 if(volumeDraft.value?.id===id)return volumeDraft.value.value;
 return receiverVolume.deviceId===id?receiverVolume.value:null;
});
const router=new SelectionRouter(
 async(id,signal)=>{
  await receiverVolume.ready(id);
  signal.throwIfAborted();
  const session=await ipc.liveBegin(id);
  const stop=()=>ipc.liveStop(session.sessionId);
  try {
   signal.throwIfAborted();
   await ipc.liveConnect(session.sessionId);
   return {stop};
  } catch(error) {
   await stop().catch(()=>{});
   throw error;
  }
 },
);
function supported(action:string){return selected.value?.capabilities?.includes(action)||selected.value?.services.some(s=>s.actions.includes(action));}
const unsubscribe=ipc.onLiveState(value=>{
 if(disposed)return;
 if(value.deviceId===devices.selectedId || value.sessionId===live.value?.sessionId)live.value=value;
 if(value.deviceId===devices.selectedId){
  receiverVolume.observe(value.deviceId,value.volume);
  if(value.active&&value.playbackReady){waitingSince.value=null;message.value='playback.ready';}
  if(value.error)waitingSince.value=null;
 }
});
async function routeSelection(id:string){
 const current=++revision;
 const target=id!==LOCAL_OUTPUT_ID&&props.playing&&props.sourceId?id:'';
 waitingSince.value=target?Date.now():null;
 live.value=undefined;
 busy.value=true;routeError.value='';message.value=target?'playback.connectReceiver':'';
 try{
  await router.route(target);
  if(current!==revision||disposed)return;
  if(id===LOCAL_OUTPUT_ID || !id){
   live.value=undefined;message.value='playback.onLocal';
  }else if(target) message.value=waitingSince.value===null?'playback.ready':'playback.waiting';
 }catch(error){if(current===revision&&!disposed){waitingSince.value=null;routeError.value=String(error);message.value='playback.retry';}}
 finally{if(current===revision&&!disposed)busy.value=false;}
}
watch([()=>devices.selectedId,()=>props.sourceId,()=>props.playing],([id,source,playing],previous)=>{
 if(id!==previous?.[0])volumeDraft.value=undefined;
 if(id!==previous?.[0]||source!==previous?.[1]||(playing&&!isLive.value))void routeSelection(id);
},{immediate:true});
let volumeRefresh:ReturnType<typeof setInterval>|undefined;
onMounted(()=>{volumeRefresh=setInterval(()=>{if(isLocal.value&&!receiverVolume.busy&&!volumeDraft.value&&!disposed)void receiverVolume.request(LOCAL_OUTPUT_ID);},2500);});
onUnmounted(()=>{disposed=true;revision++;clearInterval(volumeRefresh);receiverVolume.reset();unsubscribe();void router.stop().catch(console.error);});
async function loadVolume(){
 const id=devices.selectedId;
 if(!receiverVolume.initialized){await receiverVolume.select(id,!!(isLocal.value||supported('SetVolume'))).catch(()=>{});return;}
 if(id&&(isLocal.value||supported('SetVolume')))await receiverVolume.request(id);
}
watch([()=>devices.selectedId,()=>selected.value?.id],()=>{
 const id=devices.selectedId;
 // Discovery refreshes are not a new user selection; never reset a manual level.
 if(receiverVolume.deviceId===id&&(receiverVolume.initialized||receiverVolume.busy||receiverVolume.error))return;
 if(!isLocal.value&&!selected.value){if(receiverVolume.deviceId!==id)receiverVolume.reset(id);return;}
 void receiverVolume.select(id,!!(isLocal.value||supported('SetVolume'))).catch(()=>{});
},{flush:'sync',immediate:true});
function previewVolume(event:Event){
 const draft={id:devices.selectedId,value:(event.target as HTMLInputElement).valueAsNumber};
 volumeDraft.value=draft;
 return draft;
}
async function volume(event:Event){
 const draft=previewVolume(event);
 try{await receiverVolume.request(draft.id,draft.value);}
 finally{if(volumeDraft.value===draft)volumeDraft.value=undefined;}
}
function cancelVolumePreview(){
 if(!receiverVolume.busy)volumeDraft.value=undefined;
}
</script>
<template>
 <section v-if="isLocal||selected" class="controls" :aria-label="t('playback.controls')">
  <h2>{{ isLocal?t('devices.local'):selected?.name }}</h2>
  <template v-if="isLocal"><p>{{ t('volume.windowsScope') }}</p></template>
  <template v-else>
   <template>
   <PlaybackWait v-if="waitingSince!==null&&!routeError&&!live?.error" :started-at="waitingSince" />
   <p v-else-if="busy" role="status">{{ t('playback.connecting') }}</p>
   <p v-else>{{ t('playback.auto') }}</p>
   <p v-if="isLive">{{ t('playback.format', { encoding: (live?.encoding||'flac').toUpperCase(), rate: n(live?.sampleRate??0) }) }}<br>{{ localizeMessage(live?.status) }}<br><span v-if="live?.encoding==='alac'">{{ t('playback.alac', { rate: n(44100) }) }}<br>{{ t('playback.rtp', { packets: n(live?.packets??0), exchanges: n(live?.timingExchanges??0) }) }}<br>{{ t('playback.underruns', { count: n(live?.underruns??0) }) }}</span><br v-if="live?.encoding==='mp3'"><span v-if="live?.encoding==='mp3'">{{ t('playback.mp3') }}</span></p>
   </template>
   <p v-if="selected?.protocol==='slimproto'">{{ t('playback.wiimVolume') }}</p>
  </template>
  <label v-if="isLocal||supported('SetVolume')">{{ volumeValue===null?t(isLocal?(receiverVolume.busy?'volume.windowsLoading':'volume.windowsUnknown'):(receiverVolume.busy?'volume.loading':'volume.unknown')):t(isLocal?'volume.windowsLabel':'playback.volume', { value: n(volumeValue) }) }}
   <input :key="devices.selectedId" type="range" min="0" max="100" :value="volumeValue??0" :aria-valuetext="volumeValue===null?t(isLocal?'volume.windowsUnknown':'volume.unknown'):n(volumeValue)" :disabled="busy||receiverVolume.busy||volumeValue===null" @input="previewVolume" @change="volume" @pointercancel="cancelVolumePreview" @blur="cancelVolumePreview">
  </label>
  <p v-if="isLocal&&receiverVolume.muted">{{ t('volume.windowsMuted') }}</p>
  <p v-if="receiverVolume.error||(!receiverVolume.initialized&&!receiverVolume.busy&&(isLocal||supported('SetVolume')))" class="error" role="alert">{{ localizeError(receiverVolume.error||'volume.selectionFailed') }} <button type="button" :disabled="receiverVolume.busy" @click="loadVolume">{{ t('volume.retry') }}</button></p>
  <p v-if="message" role="status">{{ t(message) }}</p>
  <p v-if="routeError||(!isLocal&&live?.error)" class="error" role="alert">
   {{ localizeError(routeError||live?.error) }}
   <button v-if="!isLocal&&playing" type="button" :disabled="busy" @click="routeSelection(devices.selectedId)">{{ t('playback.streamRetry') }}</button>
  </p>
 </section>
</template>
