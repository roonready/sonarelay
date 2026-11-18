import { message as runtimeMessage } from '../../shared/messages';
import { app, ipcMain, powerSaveBlocker, shell, type BrowserWindow } from 'electron';
import path from 'node:path';
import { CaptureRecorder } from '../audio/capture-recorder';
import { LiveSession } from '../audio/live-session';
import type { Discovery } from '../discovery/ssdp';
import { Player } from '../dlna/player';
import type { PlaybackCommand, MusicPlaybackSnapshot } from '../../shared/types';
import { RadioService } from '../radio/service';
import { NativeOutput } from '../radio/native-output';
import { MusicConsentStore } from '../runtime/music-consent';
import { SOURCE_REPOSITORY_URL } from '../../shared/music-consent';
import { receiverVolume } from '../receivers/volume';
import { WindowsVolume } from '../runtime/windows-volume';
import { MusicCatalog } from '../metadata/music-catalog';
import { musicTrackUrl } from '../../shared/music-catalog';
export function registerHandlers(window: BrowserWindow, discovery: Discovery, sources?: {openMusic():Promise<void>;closeMusic():void;onRadioPlayback?(playback:MusicPlaybackSnapshot|undefined):void}) {
  // BrowserWindow.webContents must not be read after the native window is destroyed.
  const contents=window.webContents;
  let disposed=false;
  let cleanupPromise:Promise<void>|undefined;
  const pending=new Set<Promise<unknown>>();
  const handle=(channel:string,callback:(event:Electron.IpcMainInvokeEvent,...args:any[])=>unknown)=>{
    ipcMain.handle(channel,(event,...args)=>{
      if(disposed||event.sender!==contents)throw new Error(runtimeMessage('runtime092'));
      const operation=Promise.resolve().then(()=>callback(event,...args));
      pending.add(operation);
      void operation.then(()=>pending.delete(operation),()=>pending.delete(operation));
      return operation;
    });
  };
  const player = new Player();
  const catalog=new MusicCatalog();
  handle('catalog:search',(_event,artist:unknown,title:unknown)=>catalog.search(artist,title));
  handle('catalog:open',async(_event,id:unknown,albumId:unknown,provider:unknown)=>{
    await shell.openExternal(musicTrackUrl(id,albumId,provider));
  });
  const windowsVolume=new WindowsVolume(app.isPackaged?path.join(process.resourcesPath,'native-audio'):path.join(app.getAppPath(),'assets/native'));
  handle('windows:volume',(_event,value:unknown)=>{
    if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100))throw new Error('volume.invalid');
    return windowsVolume.request(value as number|undefined);
  });
  const musicConsent=new MusicConsentStore(app.getPath('userData'),app.getPath('sessionData'));
  handle('music-consent:get',()=>musicConsent.state());
  handle('music-consent:accept',(_event,version:unknown)=>musicConsent.accept(version));
  handle('source:repository',()=>shell.openExternal(SOURCE_REPOSITORY_URL));
  const live = new LiveSession(() => discovery.state.selectedAddress);
  handle('receiver:volume',async(_event,id:unknown,value:unknown)=>{
    if(typeof id!=='string'||(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)))throw new Error('volume.invalid');
    const device=discovery.state.devices.find(device=>device.id===id);
    if(!device)throw new Error(runtimeMessage('runtime096'));
    const volume=live.state.active&&live.state.deviceId===id
      ?await live.volume(value as number|undefined)
      :await receiverVolume(device,discovery.state.devices,discovery.state.selectedAddress,value as number|undefined);
    return {deviceId:id,volume};
  });
  let musicBegin: Promise<unknown> | undefined;
  const radio = new RadioService(live,id=>discovery.state.devices.find(device=>device.id===id),()=>discovery.state.selectedAddress,
    async()=>{sources?.closeMusic();await musicBegin?.catch(()=>{});await player.dispose();await live.stop();},
    ()=>new NativeOutput(app.isPackaged?path.join(process.resourcesPath,'native-audio'):path.join(app.getAppPath(),'assets/native')));
  const sendRadio=()=>{if(!disposed&&!contents.isDestroyed())contents.send('radio:state',radio.state);};
  radio.on('state',sendRadio);
  const sendRadioPlayback=(playback:MusicPlaybackSnapshot|undefined)=>sources?.onRadioPlayback?.(playback);
  radio.on('playback',sendRadioPlayback);
  handle('radio:get',()=>radio.state);
  handle('radio:toggle',(_event,id:unknown,output:unknown)=>{
    if(typeof id!=='string'||typeof output!=='string')throw new Error('Forbidden');
    return radio.toggle(id,output);
  });
  handle('radio:output',(_event,output:unknown)=>{
    if(typeof output!=='string')throw new Error('Forbidden');return radio.route(output);
  });
  handle('source:music',async()=>{await musicConsent.requireAccepted();if(radio.state.mode==='music'){await sources?.openMusic();return radio.state;}await radio.stop();await sources?.openMusic();await radio.music();return radio.state;});
  let liveOperation = false;
  const authorize = (event:Electron.IpcMainInvokeEvent) => {
    if(event.sender!==contents)throw new Error('Forbidden');
  };
  handle('live:begin', async(event,id:unknown,rate:unknown)=>{
    authorize(event);
    if(liveOperation)throw new Error(runtimeMessage('runtime093'));
    if(radio.state.mode!=='music')throw new Error('radio.cancelled');
    const device=discovery.state.devices.find(d=>d.id===id);
    if(!device||typeof rate!=='number')throw new Error(runtimeMessage('runtime094'));
    liveOperation=true;
    const operation=(async()=>{await player.dispose();return live.begin(device,discovery.state.selectedAddress,rate);})();
    musicBegin=operation;
    try{return await operation;}
    finally{if(musicBegin===operation)musicBegin=undefined;liveOperation=false;}
  });
  handle('live:pcm',(event,id:unknown,data:Uint8Array)=>{
    authorize(event);if(typeof id!=='string')throw new Error('Forbidden');live.push(id,data);
  });
  handle('live:connect',async(event,id:unknown)=>{
    authorize(event);if(typeof id!=='string')throw new Error('Forbidden');
    return live.connect(id);
  });
  handle('live:stop',async(event,id:unknown)=>{
    authorize(event);
    if(id===live.state.sessionId)await live.stop();
  });
  let powerBlocker:number|undefined;
  const releasePowerBlocker=()=>{
    if(powerBlocker!==undefined){powerSaveBlocker.stop(powerBlocker);powerBlocker=undefined;}
  };
  const sendLive=()=>{
    const radioActive=['connecting','playing'].includes(radio.state.status);
    if((live.state.active||radioActive) && powerBlocker===undefined)powerBlocker=powerSaveBlocker.start('prevent-app-suspension');
    if(!live.state.active&&!radioActive)releasePowerBlocker();
    if(!disposed&&!contents.isDestroyed())contents.send('live:state',live.state);
  };
  live.on('state',sendLive);
  radio.on('state',sendLive);
  const rendererGone=()=>{void radio.stop().catch(console.error);void live.stop().catch(console.error);};
  contents.on('render-process-gone',rendererGone);
  contents.on('did-start-loading',rendererGone);
  const recorder = new CaptureRecorder(path.join(app.getPath('userData'), 'captures'));
  handle('capture:begin', (event, rate: unknown) => {
    if (event.sender !== contents || typeof rate !== 'number') throw new Error('Forbidden');
    if(live.state.active)throw new Error(runtimeMessage('runtime095'));
    recorder.begin(rate);
  });
  const onPcm = (event: Electron.IpcMainEvent, data: Uint8Array) => {
    if (disposed || event.sender !== contents) return;
    try { recorder.append(data); } catch (error) { console.error(error); recorder.dispose(); }
  };
  ipcMain.on('capture:pcm', onPcm);
  handle('capture:finish', event => {
    if (event.sender !== contents) throw new Error('Forbidden');
    return recorder.finish();
  });
  handle('playback:command', async (event, id: unknown, command: unknown, value: unknown) => {
    if (event.sender !== contents || typeof id !== 'string' || typeof command !== 'string' || !['test','recording','play','pause','stop','status','volume'].includes(command)) throw new Error('Forbidden');
    const device = discovery.state.devices.find(d => d.id === id);
    if (!device) throw new Error(runtimeMessage('runtime096'));
    if(live.state.active){
      if(command==='test'||command==='recording')await live.stop();
      else {
        if(live.state.deviceId!==id)throw new Error(runtimeMessage('runtime097'));
        const state=await live.command(command as PlaybackCommand,typeof value==='number'?value:undefined);
        return {deviceId:state.deviceId,status:state.status,error:state.error,busy:false,volume:state.volume,httpRequests:state.httpRequests};
      }
    }
    return player.command(device, discovery.state.selectedAddress, command as PlaybackCommand, typeof value === 'number' ? value : undefined, command === 'recording' ? recorder.read() : undefined);
  });
  handle('discovery:state', event => {
    if (event.sender !== contents) throw new Error('Forbidden');
    return discovery.state;
  });
  handle('discovery:scan', (event, address: unknown) => {
    if (event.sender !== contents || typeof address !== 'string') throw new Error('Forbidden');
    return discovery.scan(address);
  });
  const send = () => { if (!disposed&&!contents.isDestroyed()) contents.send('discovery:changed', discovery.state); };
  discovery.on('state', send);
  return () => {
    if(cleanupPromise)return cleanupPromise;
    disposed=true;
    catalog.dispose();ipcMain.removeHandler('catalog:search');ipcMain.removeHandler('catalog:open');
    live.off('state',sendLive);
    radio.off('state',sendRadio);radio.off('state',sendLive);
    releasePowerBlocker();
    contents.removeListener('render-process-gone',rendererGone);
    contents.removeListener('did-start-loading',rendererGone);
    for(const channel of ['live:begin','live:pcm','live:connect','live:stop'])ipcMain.removeHandler(channel);
    for(const channel of ['radio:get','radio:toggle','radio:output','source:music','receiver:volume','windows:volume'])ipcMain.removeHandler(channel);
    for(const channel of ['music-consent:get','music-consent:accept','source:repository'])ipcMain.removeHandler(channel);
    ipcMain.removeListener('capture:pcm', onPcm);
    ipcMain.removeHandler('capture:begin'); ipcMain.removeHandler('capture:finish');
    ipcMain.removeHandler('playback:command');
    discovery.off('state', send);
    ipcMain.removeHandler('discovery:state'); ipcMain.removeHandler('discovery:scan');
    const radioShutdown=radio.dispose();
    const windowsVolumeShutdown=windowsVolume.dispose();
    cleanupPromise=(async()=>{
      await Promise.allSettled([...pending]);
      try{recorder.dispose();}catch(error){console.error('WAV finalization:',error);}
      const results=await Promise.allSettled([radioShutdown,windowsVolumeShutdown,live.stop(),player.dispose()]);
      for(const result of results)if(result.status==='rejected')console.error('Playback shutdown:',result.reason);
    })();
    return cleanupPromise;
  };
}
