<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { localizeError, localizeMessage } from '../i18n';
const { t, n } = useI18n();
import { ref, watch, computed, onUnmounted } from 'vue';
import type { PlaybackState, PlaybackCommand, LiveState } from '../../../shared/types';
import { useDevices } from '../stores/devices';
import { ipc } from '../services/ipc';
import { startLiveCapture, requestMusicStream } from '../services/live-capture';
import { SelectionRouter } from '../services/selection-router';
import { LOCAL_OUTPUT_ID } from '../services/output';
import PlaybackWait from './PlaybackWait.vue';
const devices=useDevices();
const state=ref<PlaybackState>({deviceId:'',status:'lastfm.disconnected',error:'',busy:false,volume:null,httpRequests:0});
const busy=ref(false),message=ref(''),live=ref<LiveState>();
const waitingSince=ref<number|null>(null);
let revision=0,disposed=false;
const selected=computed(()=>devices.state.devices.find(d=>d.id===devices.selectedId));
const isLocal=computed(()=>devices.selectedId===LOCAL_OUTPUT_ID);
const isLive=computed(()=>live.value?.active===true && live.value.deviceId===devices.selectedId);
const active=computed(()=>state.value.deviceId===devices.selectedId || isLive.value);
const volumeValue=computed(()=>isLive.value?live.value?.volume:state.value.volume);
const router=new SelectionRouter<MediaStream>(
 ()=>requestMusicStream(),
 (id,input,signal)=>startLiveCapture(id,error=>{if(!disposed&&devices.selectedId===id)state.value.error=error;},signal,input),
 stream=>stream.getTracks().forEach(track=>track.stop()),
);
function supported(action:string){return selected.value?.capabilities?.includes(action)||selected.value?.services.some(s=>s.actions.includes(action));}
const unsubscribe=ipc.onLiveState(value=>{
 if(disposed)return;
 if(value.deviceId===devices.selectedId || value.sessionId===live.value?.sessionId)live.value=value;
 if(value.deviceId===devices.selectedId){
  if(value.active&&value.playbackReady){waitingSince.value=null;message.value='playback.ready';}
  if(value.error)waitingSince.value=null;
 }
});
async function routeSelection(id:string){
 const current=++revision;
 waitingSince.value=id&&id!==LOCAL_OUTPUT_ID?Date.now():null;
 live.value=undefined;
 busy.value=true;state.value.error='';message.value=id===LOCAL_OUTPUT_ID?'playback.switchLocal':'playback.connectReceiver';
 try{
  await router.route(id===LOCAL_OUTPUT_ID?'':id);
  if(current!==revision||disposed)return;
  if(id===LOCAL_OUTPUT_ID || !id){
   if(state.value.deviceId)await ipc.playback(state.value.deviceId,'stop').catch(()=>{});
   live.value=undefined;state.value.deviceId='';message.value='playback.onLocal';
  }else message.value=waitingSince.value===null?'playback.ready':'playback.waiting';
 }catch(error){if(current===revision&&!disposed){waitingSince.value=null;state.value.error=String(error);message.value='playback.retry';}}
 finally{if(current===revision&&!disposed)busy.value=false;}
}
async function command(command:PlaybackCommand,value?:number){
 const target=devices.selectedId;if(!target||isLocal.value)return;
 if(command==='play'&&!isLive.value){await routeSelection(target);return;}
 if(command==='play')waitingSince.value=Date.now();
 if(command==='pause'||command==='stop')waitingSince.value=null;
 busy.value=true;
 try{
  if(command==='stop'&&isLive.value){await router.stop();message.value='playback.stopped';return;}
  state.value=await ipc.playback(target,command,value);
 }catch(error){waitingSince.value=null;state.value.error=String(error);}
 finally{busy.value=false;}
}
watch(()=>devices.selectedId,id=>{void routeSelection(id);},{flush:'sync',immediate:true});
onUnmounted(()=>{disposed=true;revision++;unsubscribe();void router.stop().catch(console.error);});
function volume(event:Event){void command('volume',Number((event.target as HTMLInputElement).value));}
</script>
<template>
 <section v-if="isLocal||selected" class="controls" :aria-label="t('playback.controls')">
  <h2>{{ isLocal?t('devices.local'):selected?.name }}</h2>
  <template v-if="isLocal"><p>{{ t('playback.localHelp') }}</p></template>
  <template v-else>
   <PlaybackWait v-if="waitingSince!==null&&!state.error&&!live?.error" :started-at="waitingSince" />
   <p v-else-if="busy" role="status">{{ t('playback.connecting') }}</p>
   <p v-else>{{ t('playback.auto') }}</p>
   <p v-if="isLive">{{ t('playback.format', { encoding: (live?.encoding||'flac').toUpperCase(), rate: n(live?.sampleRate??0) }) }}<br>{{ localizeMessage(live?.status) }}<br><span v-if="live?.encoding==='alac'">{{ t('playback.alac', { rate: n(44100) }) }}<br>{{ t('playback.rtp', { packets: n(live?.packets??0), exchanges: n(live?.timingExchanges??0) }) }}<br>{{ t('playback.underruns', { count: n(live?.underruns??0) }) }}</span><br v-if="live?.encoding==='mp3'"><span v-if="live?.encoding==='mp3'">{{ t('playback.mp3') }}</span></p>
   <p v-if="selected?.protocol==='slimproto'">{{ t('playback.wiimVolume') }}</p>
   <label v-if="active && volumeValue!=null && supported('SetVolume')">{{ t('playback.volume', { value: n(volumeValue??0) }) }}
    <input type="range" min="0" max="100" :value="volumeValue" :disabled="busy" @change="volume">
   </label>
   <p v-if="active&&!isLive">{{ localizeMessage(state.status) }}</p>
  </template>
  <p v-if="message" role="status">{{ t(message) }}</p>
  <p v-if="state.error||(!isLocal&&live?.error)" class="error" role="alert">{{ localizeError(state.error||live?.error) }}</p>
 </section>
</template>
