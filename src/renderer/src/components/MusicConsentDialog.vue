<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
defineProps<{busy:boolean;error:string;sessionPath:string}>();
const emit=defineEmits<{cancel:[];continue:[];repository:[]}>();
const {t}=useI18n();
const dialog=ref<HTMLDialogElement>();
let previousFocus:HTMLElement|null=null;
onMounted(()=>{previousFocus=document.activeElement as HTMLElement;dialog.value?.showModal();});
onBeforeUnmount(()=>{dialog.value?.close();if(previousFocus?.isConnected)previousFocus.focus();});
</script>
<template>
 <Teleport to="body">
  <dialog ref="dialog" class="music-consent" aria-labelledby="music-consent-title" aria-describedby="music-consent-intro" @cancel.prevent="!busy&&emit('cancel')">
   <form class="consent-layout" @submit.prevent="emit('continue')">
    <header class="consent-header">
     <p class="consent-eyebrow">{{ t('musicConsent.eyebrow') }}</p>
     <h2 id="music-consent-title">{{ t('musicConsent.title') }}</h2>
    </header>
    <div class="consent-body" tabindex="0">
     <p id="music-consent-intro">{{ t('musicConsent.intro') }}</p>
     <p>{{ t('musicConsent.credentials') }}</p>
     <h3>{{ t('musicConsent.privacyTitle') }}</h3>
     <ul><li>{{ t('musicConsent.privacyCode') }}</li><li>{{ t('musicConsent.privacySending') }}</li><li>{{ t('musicConsent.privacyUse') }}</li></ul>
     <p>{{ t('musicConsent.session') }}</p>
     <details><summary>{{ t('musicConsent.storageTitle') }}</summary><p>{{ t('musicConsent.storageAccess') }}</p><code>{{ sessionPath }}</code></details>
     <p>{{ t('musicConsent.source') }} <button type="button" class="consent-link" :disabled="busy" @click="emit('repository')">{{ t('musicConsent.sourceLink') }}</button></p>
     <h3>{{ t('musicConsent.recommendationTitle') }}</h3>
     <p>{{ t('musicConsent.recommendation') }}</p>
     <h3>{{ t('musicConsent.responsibilityTitle') }}</h3>
     <p>{{ t('musicConsent.unofficial') }}</p><p>{{ t('musicConsent.responsibility') }}</p>
     <p class="consent-acknowledgement">{{ t('musicConsent.acknowledgement') }}</p>
    </div>
    <footer class="consent-footer">
     <p v-if="error" class="consent-error" role="alert">{{ t(error) }}</p>
     <div class="consent-actions"><button type="button" class="consent-cancel" :disabled="busy" autofocus @click="emit('cancel')">{{ t('musicConsent.cancel') }}</button><button type="submit" class="consent-continue" :disabled="busy">{{ t(busy?'musicConsent.saving':'musicConsent.continue') }}</button></div>
    </footer>
   </form>
  </dialog>
 </Teleport>
</template>
<style scoped>
.music-consent{width:min(700px,calc(100vw - 32px));max-width:700px;max-height:calc(100dvh - 32px);padding:0;border:1px solid #394359;border-radius:16px;background:#1b2230;color:#e7eaf0;box-shadow:0 24px 80px #0008}
.music-consent::backdrop{background:#080d18b8;backdrop-filter:blur(4px)}
.consent-layout{display:flex;flex-direction:column;max-height:calc(100dvh - 34px);min-height:0;margin:0}
.consent-header{padding:24px 28px 18px;flex-shrink:0;border-bottom:1px solid #303b50}.consent-eyebrow{margin:0 0 8px;color:#a9b7ff;font-size:11px;letter-spacing:1.5px}h2{margin:0;font-size:23px;line-height:1.25}
.consent-body{padding:8px 28px 20px;overflow:auto;min-height:0;font-size:13px;line-height:1.6;color:#c7cfde;scrollbar-gutter:stable}.consent-body p{margin:14px 0}.consent-body h3{margin:20px 0 8px;color:#edf1fa;font-size:14px}.consent-body ul{margin:8px 0;padding-left:20px}.consent-body li{margin:7px 0}summary{cursor:pointer;color:#b9c5ff}code{display:block;white-space:normal;overflow-wrap:anywhere;color:#b5bfd0;font-size:11px}.consent-acknowledgement{color:#aab5c8}
.consent-link{display:inline;padding:0;border:0;background:none;color:#a9b7ff;text-decoration:underline;font:inherit;cursor:pointer}
.consent-footer{flex-shrink:0;padding:16px 28px 20px;border-top:1px solid #303b50;background:#19212f}.consent-actions{display:flex;justify-content:flex-end;gap:12px}.consent-actions button{padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}.consent-cancel{border:1px solid #46516b;background:transparent;color:#d1d9e8}.consent-continue{border:1px solid #a9b7ff;background:#a9b7ff;color:#11151e}.consent-error{font-size:12px;margin:0 0 12px;color:#ffb9b9}
button:focus-visible,.consent-body:focus-visible{outline:2px solid #b9c5ff;outline-offset:3px}button:disabled{opacity:.55;cursor:wait}
@media(max-width:520px){.consent-header{padding:18px 18px 14px}h2{font-size:20px}.consent-body{padding-left:18px;padding-right:18px}.consent-footer{padding:14px 18px}.consent-actions button{flex:1;padding:11px 12px}}
</style>
