<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ScrobblerSettings from './ScrobblerSettings.vue';
import { localizeError, supportedLanguages, selectLanguage } from '../i18n';
const { t, d, locale } = useI18n();
import { onMounted, onUnmounted, ref } from 'vue';
import type { LastfmPreferences, LastfmState } from '../../../shared/types';
import { ipc } from '../services/ipc';
const state=ref<LastfmState>({configured:false,connected:false,username:'',pendingAuthorization:false,busy:true,error:'',scrobbling:true,nowPlaying:true});
const error=ref('');let disposed=false,revision=0,unsubscribe:(()=>void)|undefined;
onMounted(async()=>{
 unsubscribe=ipc.onLastfmState(value=>{if(!disposed){revision++;state.value=value;}});const before=revision;
 try{const value=await ipc.lastfmState();if(!disposed&&before===revision)state.value=value;}catch{if(!disposed)error.value='lastfm.loadError';}
});
onUnmounted(()=>{disposed=true;unsubscribe?.();});
async function action(method:'connect'|'confirm'|'disconnect'){
 error.value='';
 try{const value=await ({connect:ipc.lastfmConnect,confirm:ipc.lastfmConfirm,disconnect:ipc.lastfmDisconnect}[method])();if(!disposed)state.value=value;}
 catch(reason){if(!disposed)error.value=String(reason);}
}
async function setting(key:keyof LastfmPreferences,event:Event){
 const value={scrobbling:state.value.scrobbling,nowPlaying:state.value.nowPlaying,[key]:(event.target as HTMLInputElement).checked};error.value='';
 try{const result=await ipc.lastfmSettings(value);if(!disposed)state.value=result;}catch{if(!disposed)error.value='lastfm.saveError';}
}
</script>
<template>
 <details class="app-settings">
  <summary>{{ t('settings.title') }}</summary>
  <label class="language-setting" for="language">{{ t('settings.language') }}</label>
  <select id="language" :value="locale" @change="selectLanguage(($event.target as HTMLSelectElement).value)">
   <option v-for="language in supportedLanguages" :key="language" :value="language">{{ t('language.' + language) }}</option>
  </select>
  <section class="lastfm" :aria-label="t('lastfm.brand')">
   <h2>{{ t('lastfm.brand') }}</h2>
   <p role="status">{{ t(state.busy?'lastfm.loading':state.connected?'lastfm.connected':state.pendingAuthorization?'lastfm.pending':'lastfm.disconnected') }}</p>
   <p v-if="state.username">{{ t('lastfm.username') }} <strong>{{ state.username }}</strong></p>
   <p v-if="state.connected&&state.activity" role="status">{{ t('lastfm.activity.'+state.activity.kind,{artist:state.activity.artist,title:state.activity.title,time:d(state.activity.at,'time')}) }}</p>
   <p v-if="!state.configured" class="setup-hint">{{ t('lastfm.setup') }}</p>
   <button v-if="!state.connected&&!state.pendingAuthorization" :disabled="state.busy||!state.configured" @click="action('connect')">{{ t('lastfm.connect') }}</button>
   <template v-if="state.pendingAuthorization">
    <p>{{ t('lastfm.browser') }}</p>
    <button :disabled="state.busy" @click="action('confirm')">{{ t('lastfm.confirm') }}</button>
   </template>
   <label><input type="checkbox" :checked="state.scrobbling" :disabled="state.busy" @change="setting('scrobbling',$event)"> {{ t('lastfm.scrobbling') }}</label>
   <label><input type="checkbox" :checked="state.nowPlaying" :disabled="state.busy" @change="setting('nowPlaying',$event)"> {{ t('lastfm.nowPlaying') }}</label>
   <button v-if="state.connected||state.pendingAuthorization||state.error" :disabled="state.busy" @click="action('disconnect')">{{ t('lastfm.disconnect') }}</button>
   <p v-if="error||state.error" class="error" role="alert">{{ error ? (error.startsWith('lastfm.') ? t(error) : localizeError(error)) : localizeError(state.error) }}</p>
  </section>
  <ScrobblerSettings />
 </details>
</template>
<style scoped>
.app-settings{margin-top:18px;border-top:1px solid #303b50;padding-top:14px;font-size:13px}
.app-settings[open]{display:flex;flex-direction:column;min-height:52px}
.app-settings summary{flex-shrink:0}
.app-settings[open]::details-content{min-height:0;overflow-y:auto;scrollbar-width:thin;padding:0 6px 4px}
.language-setting{display:block;margin-top:14px;margin-bottom:8px}
.lastfm{display:grid;gap:10px;padding-top:12px}.lastfm h2{font-size:15px;margin:0}.lastfm p{margin:0;font-size:12px;line-height:1.5;color:#aab5c8}
.lastfm label{display:flex;align-items:center;gap:8px;margin:0}.lastfm input{width:auto}.lastfm button{padding:9px;border:1px solid #394359;border-radius:7px;background:#28314c}.setup-hint{overflow-wrap:anywhere}
</style>
