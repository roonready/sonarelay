import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { DiscoveryState } from '../../../shared/types';
import { ipc } from '../services/ipc';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { reconcileReceiverOptions, type ReceiverOption } from '../services/receiver-options';
export const useDevices = defineStore('devices', () => {
  const state = ref<DiscoveryState>({ diagnostics: { replies: 0, descriptions: 0, unicastPeers: 0 }, interfaces: [], selectedAddress: '', devices: [], scanning: false, error: '', lastScan: null });
  const selectedId = ref(LOCAL_OUTPUT_ID);
  const receiverOptions=shallowRef<ReceiverOption[]>([]);
  let revision = 0;
  const apply = (value: DiscoveryState) => {
    const networkChanged=value.selectedAddress!==state.value.selectedAddress;
    state.value = value;
    // Publish menu membership once per completed scan. Heartbeats and refreshed
    // expiry timestamps must not invalidate the native select's options.
    if(!value.scanning||networkChanged){
      receiverOptions.value=reconcileReceiverOptions(receiverOptions.value,value.devices);
      if (selectedId.value!==LOCAL_OUTPUT_ID && !value.devices.some(d => d.id === selectedId.value)) selectedId.value = LOCAL_OUTPUT_ID;
    }
  };
  async function init() {
    const stop = ipc.onState(value => { revision++; apply(value); });
    const before = revision;
    const initial = await ipc.getState();
    if (before === revision) apply(initial);
    return stop;
  }
  async function scan(address = state.value.selectedAddress) {
    try { await ipc.scan(address); } catch (error) { state.value.error = String(error); }
  }
  return { state, selectedId, receiverOptions, init, scan };
});

