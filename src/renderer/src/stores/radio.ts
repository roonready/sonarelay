import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { emptyRadioState } from '../../../shared/radio';
import { ipc } from '../services/ipc';
export const useRadio = defineStore('radio', () => {
  const state=ref(emptyRadioState());
  const active=computed(()=>['connecting','playing'].includes(state.value.status));
  async function init() {
    let revision=0;
    const stop=ipc.onRadioState(value=>{revision++;state.value=value;});
    const before=revision;
    try{const initial=await ipc.radioState();if(before===revision)state.value=initial;}catch{/* Startup may be shutting down. */}
    return stop;
  }
  return {state,active,init};
});
