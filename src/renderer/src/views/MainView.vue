<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { localizeError } from '../i18n';
const { t } = useI18n();
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import type { LastfmState, MusicMetadataSnapshot } from '../../../shared/types';
import { ipc } from '../services/ipc';
import { useDevices } from '../stores/devices';
import DeviceList from '../components/DeviceList.vue';
import DeviceControls from '../components/DeviceControls.vue';
import LastfmSettings from '../components/LastfmSettings.vue';
import AppUpdates from '../components/AppUpdates.vue';
import ProxySettings from '../components/ProxySettings.vue';
const store = useDevices();
const media = shallowRef<MusicMetadataSnapshot>();
const lastfm = shallowRef<LastfmState>();
const profileError = shallowRef(false);
const profileUrl = computed(() => lastfm.value?.connected && lastfm.value.username
  ? 'https://www.last.fm/user/' + encodeURIComponent(lastfm.value.username)
  : '');
let stopMetadata: (() => void) | undefined;
let stopLastfm: (() => void) | undefined;
let cleanup: (() => void) | undefined;
let disposed = false;
onMounted(async () => {
  let receivedLastfmState = false;
  stopLastfm = ipc.onLastfmState(state => {
    receivedLastfmState = true;
    lastfm.value = state;
    if (!state.connected) profileError.value = false;
  });
  void ipc.lastfmState().then(state => {
    if (!disposed && !receivedLastfmState) lastfm.value = state;
  }).catch(() => {});
  stopMetadata = ipc.onMetadata(snapshot => { media.value = snapshot; });
  void ipc.getMetadata().then(snapshot => {
    if (!disposed && (!media.value || snapshot.updatedAt >= media.value.updatedAt)) media.value = snapshot;
  }).catch(() => {});
  try { const stop = await store.init(); if (disposed) stop(); else cleanup = stop; }
  catch (error) { store.state.error = String(error); }
});
onUnmounted(() => { disposed = true; stopMetadata?.(); stopLastfm?.(); cleanup?.(); });
async function openLastfmProfile() {
  profileError.value = false;
  try { await ipc.lastfmOpenProfile(); }
  catch { profileError.value = true; }
}
</script>
<template>
  <aside class="panel">
    <header><img src="/favicon.svg" width="40" height="40" alt="" aria-hidden="true"><span class="brand">{{ t('app.brand') }}</span><p>{{ t('app.protocols') }}</p></header>
    <section class="current-media" :aria-label="t('monitor.nowPlaying')">
      <img v-if="media?.artwork" :src="media.artwork" alt="" width="54" height="54">
      <div>
        <strong>{{ media?.playback?.title || t('monitor.waiting') }}</strong>
        <p v-if="media?.playback?.artist">{{ media.playback.artist }}</p>
        <p v-if="media?.playback?.sourceId">{{ media.playback.sourceId }}</p>
      </div>
    </section>
    <a v-if="profileUrl" class="lastfm-profile" :href="profileUrl" @click.prevent="openLastfmProfile">
      {{ t('lastfm.profile', { username: lastfm?.username }) }}
    </a>
    <p v-if="profileUrl && profileError" class="error" role="alert">{{ t('lastfm.profileError') }}</p>
    <p v-if="media?.error" class="error" role="status">{{ t(media.error) }}</p>
    <p class="error" v-if="store.state.error" role="alert">{{ localizeError(store.state.error) }}</p>
    <DeviceList />
    <DeviceControls :source-id="media?.playback?.sourceId" :playing="media?.playback?.playing ?? false" />
    <LastfmSettings />
    <AppUpdates />
    <ProxySettings />
  </aside>
</template>
