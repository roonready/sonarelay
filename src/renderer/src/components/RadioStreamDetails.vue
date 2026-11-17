<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { RadioStreamInfo } from '../../../shared/radio';
defineProps<{stream:RadioStreamInfo|null;output:RadioStreamInfo|null}>();
const {t,n}=useI18n();
function fields(info:RadioStreamInfo){
 const unknown=t('stream.unknown');
 const rows=[
  {label:t('stream.codec'),value:info.codec?(info.codec.startsWith('pcm_')?'PCM':info.codec.toUpperCase()):unknown},
  {label:t('stream.sampleRate'),value:info.sampleRate?t('stream.hz',{value:n(info.sampleRate)}):unknown},
  {label:t('stream.channels'),value:info.channels?n(info.channels):unknown},
 ];
 if(info.bitDepth!==null||info.codec==='flac'||info.codec==='alac'||info.codec?.startsWith('pcm_'))rows.push({label:t('stream.bitDepth'),value:info.bitDepth?t('stream.bits',{value:n(info.bitDepth)}):unknown});
 rows.push({label:t('stream.bitrate'),value:info.bitrate&&info.bitrateSource!=='station'?t('stream.kbps',{value:n(info.bitrate/1000,'decimal')}):unknown});
 if(info.bitrate&&info.bitrateSource==='station')rows.push({label:t('stream.stationBitrate'),value:t('stream.kbps',{value:n(info.bitrate/1000,'decimal')})});
 return rows;
}
</script>
<template>
 <details class="stream-details" open>
  <summary>{{ t('stream.details') }}</summary>
  <h3>{{ t('stream.source') }}</h3>
  <p v-if="!stream?.codec" class="stream-pending">{{ t('stream.detecting') }}</p>
  <dl v-if="stream"><template v-for="field in fields(stream)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
  <p v-if="stream?.bitrateSource==='station'" class="stream-pending">{{ t('stream.reportedNote') }}</p>
  <template v-if="output"><h3>{{ t('stream.output') }}</h3><dl><template v-for="field in fields(output)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl></template>
 </details>
</template>
<style scoped>
.stream-details{padding:12px;border:1px solid #394359;border-radius:8px;background:#18212d;font-size:12px}.stream-details summary{cursor:pointer;color:#d6e0f2;font-weight:600}.stream-details h3{font-size:12px;margin:14px 0 8px;color:#b7c5d9}.stream-details dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 10px;margin:0}.stream-details dt{color:#a3b0c2;overflow-wrap:anywhere}.stream-details dd{margin:0;color:#e7edf6;text-align:right;overflow-wrap:anywhere}.stream-pending{color:#a3b0c2;font-size:12px}
</style>
