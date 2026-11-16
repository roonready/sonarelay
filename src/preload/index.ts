import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeApi, DiscoveryState, LiveState, MusicMetadataSnapshot, LastfmState, AppUpdateState } from '../shared/types';
const api: BridgeApi = {
  getUpdateState:()=>ipcRenderer.invoke('updates:get'),
  checkUpdates:()=>ipcRenderer.invoke('updates:check'),
  installUpdate:()=>ipcRenderer.invoke('updates:install'),
  onUpdateState:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,state:AppUpdateState)=>callback(state);
    ipcRenderer.on('updates:state',listener);return ()=>ipcRenderer.removeListener('updates:state',listener);
  },
  getSystemLanguage:()=>ipcRenderer.invoke('app:system-language'),
  lastfmState:()=>ipcRenderer.invoke('lastfm:get'),
  lastfmConnect:()=>ipcRenderer.invoke('lastfm:connect'),
  lastfmConfirm:()=>ipcRenderer.invoke('lastfm:confirm'),
  lastfmDisconnect:()=>ipcRenderer.invoke('lastfm:disconnect'),
  lastfmSettings:settings=>ipcRenderer.invoke('lastfm:settings',settings),
  onLastfmState:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,state:LastfmState)=>callback(state);
    ipcRenderer.on('lastfm:state',listener);return ()=>ipcRenderer.removeListener('lastfm:state',listener);
  },
  getMetadata:()=>ipcRenderer.invoke('metadata:get'),
  onMetadata:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,snapshot:MusicMetadataSnapshot)=>callback(snapshot);
    ipcRenderer.on('metadata:state',listener);
    return ()=>ipcRenderer.removeListener('metadata:state',listener);
  },
  liveBegin:(id,rate)=>ipcRenderer.invoke('live:begin',id,rate),
  livePcm:(id,data)=>ipcRenderer.invoke('live:pcm',id,data),
  liveConnect:id=>ipcRenderer.invoke('live:connect',id),
  liveStop:id=>ipcRenderer.invoke('live:stop',id),
  onLiveState:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,state:LiveState)=>callback(state);
    ipcRenderer.on('live:state',listener);
    return ()=>ipcRenderer.removeListener('live:state',listener);
  },
  captureBegin: sampleRate => ipcRenderer.invoke('capture:begin', sampleRate),
  capturePcm: data => ipcRenderer.send('capture:pcm', data),
  captureFinish: () => ipcRenderer.invoke('capture:finish'),
  playback: (deviceId, command, value) => ipcRenderer.invoke('playback:command', deviceId, command, value),
  getState: () => ipcRenderer.invoke('discovery:state'),
  scan: address => ipcRenderer.invoke('discovery:scan', address),
  onState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: DiscoveryState) => callback(state);
    ipcRenderer.on('discovery:changed', listener);
    return () => ipcRenderer.removeListener('discovery:changed', listener);
  },
};
contextBridge.exposeInMainWorld('bridge', api);
