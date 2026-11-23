import { message as runtimeMessage } from '../../shared/messages';
import { app, ipcMain, powerSaveBlocker, type BrowserWindow } from 'electron';
import path from 'node:path';
import type { AudioSource } from '../audio/audio-source';
import { LiveSession } from '../audio/live-session';
import type { Discovery } from '../discovery/ssdp';
import { receiverVolume } from '../receivers/volume';
import { WindowsVolume } from '../runtime/windows-volume';
export function registerHandlers(window: BrowserWindow, discovery: Discovery, sources: {
  capture(): Promise<{ source: AudioSource; title: string }>;
  sampleRate: number;
}) {
  // BrowserWindow.webContents must not be read after the native window is destroyed.
  const contents=window.webContents;
  let disposed=false;
  let cleanupPromise:Promise<void>|undefined;
  const channels: string[] = [];
  const pending=new Set<Promise<unknown>>();
  const handle=(channel:string,callback:(event:Electron.IpcMainInvokeEvent,...args:any[])=>unknown)=>{
    channels.push(channel);
    ipcMain.handle(channel,(event,...args)=>{
      if(disposed||event.sender!==contents)throw new Error(runtimeMessage('runtime092'));
      const operation=Promise.resolve().then(()=>callback(event,...args));
      pending.add(operation);
      void operation.then(()=>pending.delete(operation),()=>pending.delete(operation));
      return operation;
    });
  };
  const windowsVolume=new WindowsVolume(app.isPackaged?path.join(process.resourcesPath,'native-audio'):path.join(app.getAppPath(),'assets/native'));
  handle('windows:volume',(_event,value:unknown)=>{
    if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100))throw new Error('volume.invalid');
    return windowsVolume.request(value as number|undefined);
  });
  const live = new LiveSession(() => discovery.state.selectedAddress);
  handle('receiver:volume',async(_event,id:unknown,value:unknown)=>{
    if(typeof id!=='string'||(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)))throw new Error('volume.invalid');
    if(live.state.active&&live.state.deviceId===id){
      return {deviceId:id,volume:await live.volume(value as number|undefined)};
    }
    const device=discovery.state.devices.find(device=>device.id===id);
    if(!device)throw new Error(runtimeMessage('runtime096'));
    const volume=await receiverVolume(device,discovery.state.devices,discovery.state.selectedAddress,value as number|undefined);
    return {deviceId:id,volume};
  });
  let liveOperation = false;
  handle('live:begin', async(_event,id:unknown)=>{
    if(liveOperation)throw new Error(runtimeMessage('runtime093'));
    const device=discovery.state.devices.find(d=>d.id===id);
    if(!device)throw new Error(runtimeMessage('runtime094'));
    liveOperation=true;
    try {
      const input = await sources.capture();
      return await live.begin(device, discovery.state.selectedAddress, sources.sampleRate, input);
    } finally { liveOperation = false; }
  });
  handle('live:connect',async(_event,id:unknown)=>{
    if(typeof id!=='string')throw new Error('Forbidden');
    return live.connect(id);
  });
  handle('live:stop',async(_event,id:unknown)=>{
    if(id===live.state.sessionId)await live.stop();
  });
  let powerBlocker:number|undefined;
  const releasePowerBlocker=()=>{
    if(powerBlocker!==undefined){powerSaveBlocker.stop(powerBlocker);powerBlocker=undefined;}
  };
  const sendLive=()=>{
    if(live.state.active && powerBlocker===undefined)powerBlocker=powerSaveBlocker.start('prevent-app-suspension');
    if(!live.state.active)releasePowerBlocker();
    if(!disposed&&!contents.isDestroyed())contents.send('live:state',live.state);
  };
  live.on('state',sendLive);
  const rendererGone=()=>{void live.stop().catch(console.error);};
  contents.on('render-process-gone',rendererGone);
  contents.on('did-start-loading',rendererGone);
  handle('discovery:state', () => discovery.state);
  handle('discovery:scan', (_event, address: unknown) => {
    if (typeof address !== 'string') throw new Error('Forbidden');
    return discovery.scan(address);
  });
  const send = () => { if (!disposed&&!contents.isDestroyed()) contents.send('discovery:changed', discovery.state); };
  discovery.on('state', send);
  return () => {
    if(cleanupPromise)return cleanupPromise;
    disposed=true;
    live.off('state',sendLive);
    releasePowerBlocker();
    contents.removeListener('render-process-gone',rendererGone);
    contents.removeListener('did-start-loading',rendererGone);
    for (const channel of channels) ipcMain.removeHandler(channel);
    discovery.off('state', send);
    const windowsVolumeShutdown=windowsVolume.dispose();
    cleanupPromise=(async()=>{
      await Promise.allSettled([...pending]);
      const results=await Promise.allSettled([windowsVolumeShutdown,live.stop()]);
      for(const result of results)if(result.status==='rejected')console.error('Playback shutdown:',result.reason);
    })();
    return cleanupPromise;
  };
}
