import { defineStore } from 'pinia';
import { ref, shallowRef, watch } from 'vue';
import type { DiscoveryState } from '../../../shared/types';
import { ipc } from '../services/ipc';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { reconcileReceiverOptions, type ReceiverOption } from '../services/receiver-options';
import { useRadio } from './radio';
export const useDevices = defineStore('devices', () => {
  const radio = useRadio();
  const state = ref<DiscoveryState>({ diagnostics: { replies: 0, descriptions: 0, unicastPeers: 0 }, interfaces: [], selectedAddress: '', devices: [], scanning: false, error: '', lastScan: null });
  const selectedId = ref(LOCAL_OUTPUT_ID);
  const receiverOptions=shallowRef<ReceiverOption[]>([]);
  let revision = 0;
  let latestDiscovery: DiscoveryState | undefined;
  const apply = (value: DiscoveryState) => {
    latestDiscovery = value;
    const networkChanged=value.selectedAddress!==state.value.selectedAddress;
    const outputId = selectedId.value;
    const missingActiveOutput = !networkChanged && radio.active && radio.state.outputId === outputId &&
      !value.devices.some(device => device.id === outputId);
    const retained = missingActiveOutput ? state.value.devices.find(device => device.id === outputId) : undefined;
    const devices = retained ? [...value.devices, retained] : value.devices;
    state.value = retained ? { ...value, devices } : value;
    // Publish menu membership once per completed scan. Heartbeats and refreshed
    // expiry timestamps must not invalidate the native select's options.
    if(!value.scanning||networkChanged){
      receiverOptions.value=reconcileReceiverOptions(receiverOptions.value,devices);
      if (outputId!==LOCAL_OUTPUT_ID && !devices.some(d => d.id === outputId)) selectedId.value = LOCAL_OUTPUT_ID;
    }
  };
  watch(() => radio.active, active => {
    if (!active && latestDiscovery) apply(latestDiscovery);
  });
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

