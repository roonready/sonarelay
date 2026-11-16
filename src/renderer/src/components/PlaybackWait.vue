<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
import { computed, onMounted, onUnmounted, ref } from 'vue';
const props=defineProps<{startedAt:number;label?:string}>();
const caption=computed(()=>props.label??t('playback.wait'));
const now=ref(Date.now());let timer:ReturnType<typeof setInterval>|undefined;
const elapsed=computed(()=>{
 const tenths=Math.max(0,Math.floor((now.value-props.startedAt)/100));
 return new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(tenths / 10) + ' ' + t('units.seconds');
});
onMounted(()=>{timer=setInterval(()=>{now.value=Date.now();},100);});
onUnmounted(()=>clearInterval(timer));
</script>
<template>
 <div class="playback-wait" role="status" :aria-label="caption">
  <div class="wait-track" aria-hidden="true"><span class="wait-dot"></span></div>
  <div class="wait-caption"><span>{{ caption }}</span><time aria-live="off">{{ elapsed }}</time></div>
 </div>
</template>
<style scoped>
.playback-wait{padding:14px 0}
.wait-track{height:10px;position:relative;overflow:hidden;border-radius:5px;background:#28314c}
.wait-dot{position:absolute;left:0;top:0;width:10px;height:10px;border-radius:50%;background:#b9c5ff;box-shadow:0 0 10px #9aaaff;animation:wait-sweep .85s ease-in-out infinite alternate}
@keyframes wait-sweep{to{left:calc(100% - 10px)}}
.wait-caption{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:13px;color:#c3cce0}
time{font-variant-numeric:tabular-nums;white-space:nowrap}
@media(prefers-reduced-motion:reduce){.wait-dot{animation-duration:2.5s}}
</style>
