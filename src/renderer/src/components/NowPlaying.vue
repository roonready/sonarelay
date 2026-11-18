<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRadio } from '../stores/radio';
import { useNowPlaying } from '../stores/now-playing';
import { radioStations } from '../../../shared/radio';
import { musicTrackUrl } from '../../../shared/music-catalog';
import { ipc } from '../services/ipc';
const {t}=useI18n();
const radio=useRadio(),catalog=useNowPlaying();
const coverFailed=ref(false),portraitFailed=ref(false);
const linkFailed=ref(false);
const active=computed(()=>radio.state.mode==='radio'&&radio.active);
const artist=computed(()=>active.value?radio.state.metadata.artist.trim():'');
const title=computed(()=>active.value?radio.state.metadata.title.trim():'');
const station=computed(()=>radioStations.find(item=>item.id===radio.state.stationId)?.name??radio.state.metadata.station);
const hasTrack=computed(()=>!!artist.value&&!!title.value);
const streamTitle=computed(()=>active.value?radio.state.metadata.streamTitle.trim():'');
watch([()=>radio.state.stationId,artist,title],()=>{void catalog.load(artist.value,title.value);},{immediate:true});
watch(()=>catalog.track,()=>{coverFailed.value=false;portraitFailed.value=false;linkFailed.value=false;});
onUnmounted(()=>catalog.clear());
function retry(){void catalog.load(artist.value,title.value);}
async function openCatalog(){
 const track=catalog.track;if(!track)return;
 linkFailed.value=false;
 try{await ipc.catalogOpen(track.id,track.albumId,track.provider);}catch{if(catalog.track===track)linkFailed.value=true;}
}
</script>
<template>
 <main class="now-playing" :aria-label="t('nowPlaying.panel')">
  <img v-if="catalog.track?.cover&&!coverFailed" class="now-backdrop" :src="catalog.track.cover" alt="" aria-hidden="true" referrerpolicy="no-referrer">
  <div v-if="!hasTrack" class="now-empty">
   <img src="/favicon.svg" width="72" height="72" alt="" aria-hidden="true">
   <p class="now-eyebrow">{{ t('app.brand') }}</p>
   <h2>{{ streamTitle||t(active?'nowPlaying.waiting':'nowPlaying.chooseStation') }}</h2>
   <p>{{ active?station:t('nowPlaying.emptyHelp') }}</p>
   <p v-if="active&&!streamTitle" class="now-muted">{{ t('nowPlaying.noMetadata') }}</p>
  </div>
  <article v-else class="now-card">
   <div class="now-artwork">
    <img v-if="catalog.track?.cover&&!coverFailed" :key="catalog.track.cover" class="now-cover" :src="catalog.track.cover" :alt="t('nowPlaying.coverAlt',{album:catalog.track.album||title})" referrerpolicy="no-referrer" @error="coverFailed=true">
    <div v-else class="now-cover now-placeholder"><span aria-hidden="true">♪</span><p>{{ t(catalog.status==='loading'?'nowPlaying.loading':'nowPlaying.noCover') }}</p></div>
   </div>
   <div class="now-copy">
    <p class="now-eyebrow">{{ t('nowPlaying.live') }} <span class="now-station">{{ station }}</span></p>
    <h1>{{ catalog.track?.title||title }}</h1>
    <div class="now-artist">
     <img v-if="catalog.track?.artistPicture&&!portraitFailed" :key="catalog.track.artistPicture" :src="catalog.track.artistPicture" :alt="t('nowPlaying.artistAlt',{artist:catalog.track.artist})" referrerpolicy="no-referrer" @error="portraitFailed=true">
     <h2>{{ catalog.track?.artist||artist }}</h2>
    </div>
    <dl class="now-album"><dt>{{ t('nowPlaying.album') }}</dt><dd>{{ catalog.track?.album||t(catalog.status==='loading'?'nowPlaying.loading':'nowPlaying.unknownAlbum') }}</dd></dl>
    <p v-if="catalog.status==='loading'" class="now-status" role="status">{{ t('nowPlaying.loading') }}</p>
    <p v-else-if="catalog.status==='missing'" class="now-status" role="status">{{ t('nowPlaying.notFound') }}</p>
    <p v-else-if="catalog.status==='error'" class="now-status" role="status">{{ t('catalog.unavailable') }} <button type="button" @click="retry">{{ t('nowPlaying.retry') }}</button></p>
    <p v-if="catalog.track" class="now-credit">{{ t(catalog.track.provider==='deezer'?'nowPlaying.deezerCredit':'nowPlaying.credit') }}</p>
    <a v-if="catalog.track" class="now-catalog-link" :href="musicTrackUrl(catalog.track.id,catalog.track.albumId,catalog.track.provider)" target="_blank" rel="noopener noreferrer" @click.prevent="openCatalog">{{ t(catalog.track.provider==='deezer'?'nowPlaying.openDeezer':'nowPlaying.openCatalog') }}</a>
    <p v-if="linkFailed" class="now-status" role="alert">{{ t('catalog.openFailed') }}</p>
   </div>
  </article>
 </main>
</template>
<style scoped>
.now-playing{position:relative;isolation:isolate;flex:1;min-width:0;min-height:0;overflow:auto;display:flex;align-items:safe center;justify-content:center;padding:clamp(20px,3vw,48px);background:radial-gradient(ellipse at 70% 20%,#202e4522,transparent 70%);container-type:inline-size}
.now-backdrop{position:absolute;z-index:-1;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(65px);opacity:.14;pointer-events:none}
.now-card{display:grid;grid-template-columns:minmax(220px,400px) minmax(180px,1fr);gap:clamp(28px,4vw,60px);align-items:center;width:100%;max-width:1050px;position:relative}
.now-cover{width:100%;aspect-ratio:1;object-fit:cover;display:block;border-radius:18px;border:1px solid #ffffff14;box-shadow:0 24px 70px #0007}
.now-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,#26334b,#161e2c);color:#8496b0;text-align:center;padding:24px}.now-placeholder span{font-size:80px;color:#a9b7ff88}.now-placeholder p{font-size:13px;line-height:1.5}
.now-copy{min-width:0}.now-eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a9b7ff;margin:0 0 20px;line-height:1.8}.now-station{display:block;font-size:11px;letter-spacing:.4px;text-transform:none;color:#a6b3c7;margin-top:5px}
.now-catalog-link{display:inline-block;margin-top:14px;color:#b9c5ff;font-size:13px;text-underline-offset:4px}.now-catalog-link:focus-visible{outline:2px solid #b9c5ff;outline-offset:5px}
.now-copy h1{font-size:clamp(28px,3.5vw,55px);line-height:1.12;letter-spacing:-1px;margin:0 0 24px;overflow-wrap:anywhere}.now-artist{display:flex;align-items:center;gap:14px;margin-bottom:32px}.now-artist img{width:54px;height:54px;border-radius:50%;object-fit:cover;flex-shrink:0}.now-artist h2{font-size:clamp(20px,2vw,28px);font-weight:400;line-height:1.3;margin:0;color:#c5d0e1;overflow-wrap:anywhere}
.now-album{margin:0;padding-top:22px;border-top:1px solid #ffffff19}.now-album dt{font-size:11px;color:#8f9fb6;margin-bottom:8px}.now-album dd{font-size:16px;line-height:1.5;margin:0;color:#dce3ef;overflow-wrap:anywhere}.now-credit,.now-status{font-size:12px;line-height:1.7;color:#8f9fb6;margin:24px 0 0}.now-status button{color:#b9c5ff;background:none;border:0;text-decoration:underline;font:inherit;padding:0;cursor:pointer}
.now-empty{max-width:520px;text-align:center;color:#a1afc4}.now-empty>img{margin-bottom:24px;opacity:.7}.now-empty h2{font-size:25px;color:#d8e0ee;line-height:1.4}.now-empty p{font-size:14px;line-height:1.7}.now-empty .now-muted{font-size:12px;color:#8392a9}.now-empty .now-eyebrow{font-size:11px}
@container (max-width:560px){.now-card{grid-template-columns:1fr;max-width:420px;gap:28px}.now-cover{max-width:280px;margin:0 auto}.now-copy h1{font-size:32px}.now-artist{margin-bottom:20px}.now-credit,.now-status{margin-top:16px}}
</style>
