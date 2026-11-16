<script setup lang="ts">
import { metadataValue } from '../i18n/metadata';
import { useI18n } from 'vue-i18n';
import { localizeError, localizeMessage } from '../i18n';
const { t, n, d } = useI18n();
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { MusicMetadataSnapshot } from '../../../shared/types';
import { ipc } from '../services/ipc';
const snapshot=ref<MusicMetadataSnapshot>({fields:[],artwork:null,updatedAt:0,error:''});
const failedCover=ref('');
let disposed=false,unsubscribe:(()=>void)|undefined;
const available=computed(()=>snapshot.value.fields.filter(field=>field.value!==null));
const missing=computed(()=>snapshot.value.fields.filter(field=>field.value===null));
const artwork=computed(()=>snapshot.value.artwork&&snapshot.value.artwork!==failedCover.value?snapshot.value.artwork:null);
function apply(value:MusicMetadataSnapshot){if(!disposed&&value.updatedAt>=snapshot.value.updatedAt)snapshot.value=value;}
onMounted(async()=>{
 unsubscribe=ipc.onMetadata(apply);
 try{apply(await ipc.getMetadata());}catch(error){if(!disposed)snapshot.value.error=String(error);}
});
onUnmounted(()=>{disposed=true;unsubscribe?.();});
</script>
<template>
 <section class="music-metadata" :aria-label="t('metadata.label')">
  <h2>{{ t('metadata.title') }}</h2>
  <img v-if="artwork" class="metadata-cover" :src="artwork" :alt="t('metadata.cover')" referrerpolicy="no-referrer" @error="failedCover=snapshot.artwork||''">
  <p v-if="snapshot.error" class="metadata-notice" role="status">{{ localizeError(snapshot.error) }}</p>
  <p v-if="!snapshot.fields.length&&!snapshot.error" class="metadata-notice">{{ t('metadata.wait') }}</p>
  <dl>
   <div v-for="field in available" :key="field.id" class="metadata-field">
    <dt>{{ localizeMessage(field.label) }}</dt>
    <dd class="metadata-value">{{ metadataValue(field, snapshot) }}</dd>
    <dd class="metadata-source">{{ t('metadata.source', { source: localizeMessage(field.source) }) }}</dd>
    <dd class="metadata-detail">{{ localizeMessage(field.detail) }}</dd>
   </div>
  </dl>
  <details v-if="missing.length" class="metadata-missing">
   <summary>{{ t('metadata.missing', { count: n(missing.length) }) }}</summary>
   <dl><div v-for="field in missing" :key="field.id" class="metadata-field">
    <dt>{{ localizeMessage(field.label) }}</dt><dd>{{ t('metadata.noData') }}</dd><dd class="metadata-detail">{{ localizeMessage(field.detail) }}</dd>
   </div></dl>
  </details>
  <p v-if="snapshot.updatedAt" class="metadata-updated">{{ t('metadata.updated', { time: d(snapshot.updatedAt, 'time') }) }}</p>
  <p class="metadata-notice">{{ t('metadata.delay') }}</p>
 </section>
</template>
