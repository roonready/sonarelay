import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeApi, DiscoveryState, LiveState, MusicMetadataSnapshot, LastfmState, AppUpdateState } from '../shared/types';
const api: BridgeApi = {
  getProxySettings:()=>ipcRenderer.invoke('proxy:get'),
  saveProxySettings:settings=>ipcRenderer.invoke('proxy:save',settings),
  windowsVolume:value=>ipcRenderer.invoke('windows:volume',value),
  receiverVolume:(id,value)=>ipcRenderer.invoke('receiver:volume',id,value),
  getUpdateState:()=>ipcRenderer.invoke('updates:get'),
  checkUpdates:()=>ipcRenderer.invoke('updates:check'),
  installUpdate:()=>ipcRenderer.invoke('updates:install'),
  onUpdateState:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,state:AppUpdateState)=>callback(state);
    ipcRenderer.on('updates:state',listener);return ()=>ipcRenderer.removeListener('updates:state',listener);
  },
  getSystemLanguage:()=>ipcRenderer.invoke('app:system-language'),
  lastfmState:()=>ipcRenderer.invoke('lastfm:get'),
  lastfmOpenProfile:()=>ipcRenderer.invoke('lastfm:open-profile'),
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
  liveBegin:id=>ipcRenderer.invoke('live:begin',id),
  liveConnect:id=>ipcRenderer.invoke('live:connect',id),
  liveStop:id=>ipcRenderer.invoke('live:stop',id),
  onLiveState:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,state:LiveState)=>callback(state);
    ipcRenderer.on('live:state',listener);
    return ()=>ipcRenderer.removeListener('live:state',listener);
  },
  getState: () => ipcRenderer.invoke('discovery:state'),
  scan: address => ipcRenderer.invoke('discovery:scan', address),
  onState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: DiscoveryState) => callback(state);
    ipcRenderer.on('discovery:changed', listener);
    return () => ipcRenderer.removeListener('discovery:changed', listener);
  },
};
contextBridge.exposeInMainWorld('bridge', api);
