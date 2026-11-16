import { message as runtimeMessage } from '../../shared/messages';
import { app, ipcMain, safeStorage, shell, type WebContents } from 'electron';
import type { LastfmPreferences, MusicMetadataSnapshot } from '../../shared/types';
import { LastfmClient } from './client';
import { lastfmCredentials, LastfmStorage } from './storage';
import { LastfmService } from './service';
export function registerLastfm(ui:WebContents){
 let closed=false,service:LastfmService|undefined;
 const channels:string[]=[];
 const ready=(async()=>{
  const directory=app.getPath('userData'),credentials=await lastfmCredentials(directory);
  if(closed)return;
  const storage=new LastfmStorage(directory,{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
  service=new LastfmService(storage,credentials?new LastfmClient(credentials.apiKey,credentials.secret):undefined,url=>shell.openExternal(url));
  service.on('state',state=>{if(!closed&&!ui.isDestroyed())ui.send('lastfm:state',state);});await service.ready;
 })();
 const handle=(name:string,callback:(service:LastfmService,...args:any[])=>unknown)=>{
  channels.push(name);ipcMain.handle(name,async(event,...args)=>{if(closed||event.sender!==ui)throw new Error('Forbidden');await ready;if(closed||!service)throw new Error(runtimeMessage('runtime109'));return callback(service,...args);});
 };
 handle('lastfm:get',service=>service.snapshot());handle('lastfm:connect',service=>service.connect());handle('lastfm:confirm',service=>service.confirm());handle('lastfm:disconnect',service=>service.disconnect());
 handle('lastfm:settings',(service,preferences:LastfmPreferences)=>{
  if(!preferences||typeof preferences.scrobbling!=='boolean'||typeof preferences.nowPlaying!=='boolean'||Object.keys(preferences).some(key=>!['scrobbling','nowPlaying'].includes(key)))throw new Error(runtimeMessage('runtime110'));
  return service.preferences({scrobbling:preferences.scrobbling,nowPlaying:preferences.nowPlaying});
 });
 return {
  consume:(snapshot:MusicMetadataSnapshot)=>service?.consume(snapshot),
  dispose:async()=>{closed=true;for(const channel of channels)ipcMain.removeHandler(channel);await ready.catch(()=>{});await service?.dispose();},
 };
}
