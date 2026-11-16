import { message as runtimeMessage } from '../../shared/messages';
import type { RendererDevice } from '../../shared/types';
import { CastLink, castLibrary } from './link';
import { CastPlaybackReadiness } from './playback-readiness';
export function castMedia(url:string,title:string,bytes?:number,mime='audio/flac'){
 return {contentId:url,contentType:mime,streamType:bytes===undefined?'LIVE':'BUFFERED',metadata:{metadataType:3,title,artist:'SonaRelay'}};
}
export class CastController {
 private link?:CastLink;
 private player?:any;
 private media?:ReturnType<typeof castMedia>;
 private readiness=new CastPlaybackReadiness();
 constructor(readonly device:RendererDevice,readonly address:string){}
 async setUri(url:string,title:string,bytes?:number,mime='audio/wav'){
  const parsed=new URL(url);if(parsed.protocol!=='http:'||parsed.hostname!==this.address)throw new Error(runtimeMessage('runtime058'));
  this.readiness.reset();this.media=castMedia(url,title,bytes,mime);return {};
 }
 private async open(){
  if(this.link?.isConnected)return this.link;
  const link=new CastLink();this.link=link;
  try{await link.open(this.device.ip,this.device.apiPort??8009,this.address);return link;}
  catch(error){link.close();if(this.link===link)this.link=undefined;throw error;}
 }
 async play(){
  if(!this.media)throw new Error(runtimeMessage('runtime059'));
  const link=await this.open();
  try{
   if(!this.player?.session){
    const launched=await link.call('LAUNCH',cb=>link.client.launch(castLibrary().DefaultMediaReceiver,cb),12000);
    this.player=launched;
    launched.on('close',()=>{if(this.player===launched)this.player=undefined;});
   }
   const player=this.player;
   const status=await link.call<any>('LOAD',cb=>player.load(this.media,{autoplay:true},cb),15000);
   if(status?.idleReason==='ERROR')throw new Error(runtimeMessage('runtime060'));
   if(player.media&&status?.mediaSessionId)player.media.currentSession=status;
   return status;
  }catch(error){await this.stop();throw error;}
 }
 async pause(){
  this.readiness.reset();
  if(!this.player||!this.link?.isConnected)throw new Error(runtimeMessage('runtime061'));
  return this.link.call('PAUSE',cb=>this.player.pause(cb));
 }
 async stop(){
  this.readiness.reset();
  const link=this.link,player=this.player;this.link=undefined;this.player=undefined;
  if(!link)return {};
  try{
   if(link.isConnected&&player?.session&&player?.media?.currentSession)await link.call('STOP',cb=>player.stop(cb),3000).catch(()=>{});
  }finally{link.close();}
  return {};
 }
 async transport(){
  if(!this.player||!this.link?.isConnected)return {CurrentTransportState:'STOPPED',PlaybackReady:false};
  const player=this.player;
  const status=await this.link.call<any>('GET_STATUS',cb=>player.getStatus(cb));
  if(player!==this.player)return {CurrentTransportState:'STOPPED',PlaybackReady:false};
  if(status?.idleReason==='ERROR')throw new Error(runtimeMessage('runtime062'));
  return {CurrentTransportState:status?.playerState==='PAUSED'?'PAUSED_PLAYBACK':status?.playerState==='BUFFERING'?'TRANSITIONING':status?.playerState==='PLAYING'?'PLAYING':'STOPPED',PlaybackReady:this.readiness.observe(status)};
 }
 async position(){
  if(!this.player||!this.link?.isConnected)return {};
  const status=await this.link.call<any>('GET_STATUS',cb=>this.player.getStatus(cb));
  return {RelTime:String(status?.currentTime??0),TrackDuration:String(status?.media?.duration??0)};
 }
 async volume(value?:number){
  if(value!==undefined&&(!Number.isFinite(value)||value<0||value>100))throw new Error(runtimeMessage('runtime063'));
  const link=await this.open();
  const volume=await link.call<any>('VOLUME',cb=>value===undefined?link.client.getVolume(cb):link.client.setVolume({level:value/100},cb));
  if(typeof volume?.level!=='number')throw new Error(runtimeMessage('runtime064'));
  return {CurrentVolume:Math.round(volume.level*100)};
 }
}
