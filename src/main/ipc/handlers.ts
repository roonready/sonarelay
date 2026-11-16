import { message as runtimeMessage } from '../../shared/messages';
import { app, ipcMain, powerSaveBlocker, type BrowserWindow } from 'electron';
import path from 'node:path';
import { CaptureRecorder } from '../audio/capture-recorder';
import { LiveSession } from '../audio/live-session';
import type { Discovery } from '../discovery/ssdp';
import { Player } from '../dlna/player';
import type { PlaybackCommand } from '../../shared/types';
export function registerHandlers(window: BrowserWindow, discovery: Discovery) {
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
  const live = new LiveSession(() => discovery.state.selectedAddress);
  let liveOperation = false;
  const authorize = (event:Electron.IpcMainInvokeEvent) => {
    if(event.sender!==contents)throw new Error('Forbidden');
  };
  handle('live:begin', async(event,id:unknown,rate:unknown)=>{
    authorize(event);
    if(liveOperation)throw new Error(runtimeMessage('runtime093'));
    const device=discovery.state.devices.find(d=>d.id===id);
    if(!device||typeof rate!=='number')throw new Error(runtimeMessage('runtime094'));
    liveOperation=true;
    try{await player.dispose();return await live.begin(device,discovery.state.selectedAddress,rate);}
    finally{liveOperation=false;}
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
    if(live.state.active && powerBlocker===undefined)powerBlocker=powerSaveBlocker.start('prevent-app-suspension');
    if(!live.state.active)releasePowerBlocker();
    if(!disposed&&!contents.isDestroyed())contents.send('live:state',live.state);
  };
  live.on('state',sendLive);
  const rendererGone=()=>{void live.stop().catch(console.error);};
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
    live.off('state',sendLive);
    releasePowerBlocker();
    contents.removeListener('render-process-gone',rendererGone);
    contents.removeListener('did-start-loading',rendererGone);
    for(const channel of ['live:begin','live:pcm','live:connect','live:stop'])ipcMain.removeHandler(channel);
    ipcMain.removeListener('capture:pcm', onPcm);
    ipcMain.removeHandler('capture:begin'); ipcMain.removeHandler('capture:finish');
    ipcMain.removeHandler('playback:command');
    discovery.off('state', send);
    ipcMain.removeHandler('discovery:state'); ipcMain.removeHandler('discovery:scan');
    cleanupPromise=(async()=>{
      await Promise.allSettled([...pending]);
      try{recorder.dispose();}catch(error){console.error('WAV finalization:',error);}
      const results=await Promise.allSettled([live.stop(),player.dispose()]);
      for(const result of results)if(result.status==='rejected')console.error('Playback shutdown:',result.reason);
    })();
    return cleanupPromise;
  };
}
