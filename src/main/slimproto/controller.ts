import { message as runtimeMessage } from '../../shared/messages';
import type { RendererDevice } from '../../shared/types';
import { slimPlayer } from './server';
export class SlimController {
 private url='';private title='';private mime='audio/flac';private owned=false;
 constructor(readonly device:RendererDevice,readonly address:string){}
 private get player(){if(!this.device.slimPlayerId)throw new Error(runtimeMessage('runtime134'));const player=slimPlayer(this.device.slimPlayerId);if(player.deviceAddress!==this.device.ip)throw new Error(runtimeMessage('runtime135'));return player;}
 async setUri(url:string,title:string,_bytes?:number,mime='audio/wav'){
  const parsed=new URL(url);if(parsed.protocol!=='http:'||parsed.hostname!==this.address)throw new Error(runtimeMessage('runtime136'));
  this.url=url;this.title=title;this.mime=mime;return {};
 }
 async play(){if(!this.url)throw new Error(runtimeMessage('runtime137'));const player=this.player;if(this.mime==='audio/flac'&&!player.supportedCodecs.includes('flc'))throw new Error(runtimeMessage('runtime138'));this.owned=true;await player.playUrl(this.url,this.mime,{title:this.title});return {};}
 async pause(){await this.player.pause();return {};}
 async stop(){if(!this.owned)return {};this.owned=false;await this.player.stop();return {};}
 async transport(){return {CurrentTransportState:({playing:'PLAYING',paused:'PAUSED_PLAYBACK',stopped:'STOPPED',buffering:'TRANSITIONING',buffer_ready:'TRANSITIONING'} as Record<string,string>)[this.player.state]??'UNKNOWN'};}
 async position(){return {RelTime:String(this.player.elapsedMilliseconds/1000),TrackDuration:''};}
 async volume(_value?:number):Promise<{CurrentVolume:number}>{throw new Error(runtimeMessage('runtime139'));}
}
