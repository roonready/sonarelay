import { message as runtimeMessage } from '../../shared/messages';
import { app, ipcMain, safeStorage, type WebContents } from 'electron';
import type { LastfmPreferences, MusicMetadataSnapshot } from '../../shared/types';
import { LastfmClient, type LastfmTransport } from './client';
import { lastfmCredentials, LastfmStorage } from './storage';
import { LastfmService } from './service';
import { openLastfmInChrome } from './chrome';
export function registerLastfm(ui:WebContents,credentialsFallback:string|undefined,transport:LastfmTransport,browserProxy:()=>Promise<{server:string;profile?:string}>){
 let closed=false,service:LastfmService|undefined;
 const openExternal = async (url:string) => openLastfmInChrome(url,await browserProxy());
 const channels:string[]=[];
 const ready=(async()=>{
  const directory=app.getPath('userData');
  const credentials=await lastfmCredentials(directory)??(credentialsFallback?await lastfmCredentials(credentialsFallback):undefined);
  if(closed)return;
  const storage=new LastfmStorage(directory,{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
  service=new LastfmService(storage,credentials?new LastfmClient(credentials.apiKey,credentials.secret,transport):undefined,openExternal);
  service.on('state',state=>{if(!closed&&!ui.isDestroyed())ui.send('lastfm:state',state);});await service.ready;
 })();
 const handle=(name:string,callback:(service:LastfmService,...args:any[])=>unknown)=>{
  channels.push(name);ipcMain.handle(name,async(event,...args)=>{if(closed||event.sender!==ui)throw new Error('Forbidden');await ready;if(closed||!service)throw new Error(runtimeMessage('runtime109'));return callback(service,...args);});
 };
 handle('lastfm:get',service=>service.snapshot());handle('lastfm:connect',service=>service.connect());handle('lastfm:confirm',service=>service.confirm());handle('lastfm:disconnect',service=>service.disconnect());
 handle('lastfm:open-profile',async service=>{
  const {connected,username}=service.snapshot();
  if(!connected||!username)return;
  await openExternal('https://www.last.fm/user/'+encodeURIComponent(username));
 });
 handle('lastfm:settings',(service,preferences:LastfmPreferences)=>{
  if(!preferences||typeof preferences.scrobbling!=='boolean'||typeof preferences.nowPlaying!=='boolean'||Object.keys(preferences).some(key=>!['scrobbling','nowPlaying'].includes(key)))throw new Error(runtimeMessage('runtime110'));
  return service.preferences({scrobbling:preferences.scrobbling,nowPlaying:preferences.nowPlaying});
 });
 return {
  consume:(snapshot:MusicMetadataSnapshot)=>service?.consume(snapshot),
  dispose:async()=>{closed=true;for(const channel of channels)ipcMain.removeHandler(channel);await ready.catch(()=>{});await service?.dispose();},
 };
}
