import { message as runtimeMessage } from '../../shared/messages';
import type { RendererDevice } from '../../shared/types';
import { bluosRequest, xmlText } from './client';
export class BluosController {
 private url='';
 private started=false;
 private statusCache?:{at:number;value:any};
 private statusPending?:Promise<any>;
 constructor(readonly device:RendererDevice,readonly address:string){}
 private request(endpoint:string,parameters:Record<string,string|number>={}){return bluosRequest(this.device.ip,this.device.apiPort??11000,this.address,endpoint,parameters);}
 async setUri(url:string,_title:string,_bytes?:number,_mime?:string){
  const parsed=new URL(url);if(parsed.protocol!=='http:'||parsed.hostname!==this.address)throw new Error(runtimeMessage('runtime050'));
  this.url=url;return {};
 }
 async play(){
  this.statusCache=undefined;
  this.started=true;
  const result=await this.request('Play',this.url?{url:this.url}:{});
  if(!['play','stream'].includes(xmlText(result.state).toLowerCase()))throw new Error(runtimeMessage('runtime051', {p0: xmlText(result.state)}));
  return result;
 }
 async pause(){this.statusCache=undefined;return this.request('Pause');}
 async stop(){if(!this.started)return {};this.started=false;this.statusCache=undefined;return this.request('Stop');}
 private status(){
  if(this.statusCache&&Date.now()-this.statusCache.at<1000)return Promise.resolve(this.statusCache.value);
  if(this.statusPending)return this.statusPending;
  this.statusPending=this.request('Status').then(result=>{this.statusCache={at:Date.now(),value:result};return result;}).finally(()=>{this.statusPending=undefined;});
  return this.statusPending;
 }
 async transport(){
  const result=await this.status();const status=result.status;
  if(!status)throw new Error(runtimeMessage('runtime052'));
  const state=xmlText(status.state).toLowerCase();
  return {CurrentTransportState:({play:'PLAYING',stream:'PLAYING',pause:'PAUSED_PLAYBACK',stop:'STOPPED',connecting:'TRANSITIONING'} as Record<string,string>)[state]??state,CurrentTransportStatus:'OK',CurrentSpeed:'1'};
 }
 async position(){
  const result=await this.status();return {TrackDuration:xmlText(result.status?.totlen),RelTime:xmlText(result.status?.secs)};
 }
 async volume(value?:number){
  if(value!==undefined&&(!Number.isFinite(value)||value<0||value>100))throw new Error(runtimeMessage('runtime053'));
  if(value!==undefined&&!this.device.capabilities?.includes('SetVolume'))throw new Error(runtimeMessage('runtime054'));
  const result=await this.request('Volume',value===undefined?{}:{level:Math.round(value),tell_slaves:0});
  const volume=Number(xmlText(result.volume));
  if(!Number.isFinite(volume)||volume< -1||volume>100||xmlText(result.volume)==='')throw new Error(runtimeMessage('runtime055'));
  return {CurrentVolume:volume};
 }
}
