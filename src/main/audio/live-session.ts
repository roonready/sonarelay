import { message as runtimeMessage } from '../../shared/messages';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { interfaces } from '../network/interfaces';
import { receiverController, type ReceiverController } from '../receivers/controller';
import { AudioEngine } from './audio-engine';
import { YandexMusicSource } from './yandex-source';
import { AirplayOutput } from '../airplay2/output';
import { LiveServer } from '../media-server/live-server';
import type { RendererDevice, LiveState, PlaybackCommand } from '../../shared/types';
export class LiveSession extends EventEmitter {
 private source?:YandexMusicSource;
 private engine?:AudioEngine;
 private server?:LiveServer;
 private airplay?:AirplayOutput;
 private controller?:ReceiverController;
 private timer?:NodeJS.Timeout;
 private url='';
 private connected=false;
 private commandBusy=false;
 private lastInput=Date.now();
 private checkingPlayback=false;
 private awaitingPlayback=false;
 private playbackRevision=0;
 private playbackStartedAt=0;
 private async checkPlayback(){
  if(!this.awaitingPlayback||!this.connected||this.commandBusy||this.checkingPlayback||this.state.playbackReady)return;
  const id=this.state.sessionId,revision=this.playbackRevision,controller=this.controller,output=this.airplay;
  this.checkingPlayback=true;
  try{
   if(output){
    // AirPlay reports clock exchanges, not a speaker playback status. Include
    // the sender's two-second RTP presentation lead in its readiness estimate.
    if(output.isPlaying&&output.packets>0&&output.timingExchanges>0&&Date.now()-this.playbackStartedAt>=2000)this.state.playbackReady=true;
   }else if(controller){
    const info=await controller.transport();
    if(!this.state.active||this.state.sessionId!==id||this.commandBusy||revision!==this.playbackRevision)return;
    this.state.status=String(info.CurrentTransportState??runtimeMessage('runtime026'));
    this.state.playbackReady=this.state.status==='PLAYING'&&info.PlaybackReady!==false&&(this.server?.connections??0)>0;
   }
   if(this.state.playbackReady)this.awaitingPlayback=false;
   if(this.state.active&&this.state.sessionId===id)this.publish();
  }catch{/* Retry readiness; a failed status query is not a Play acknowledgement. */}
  finally{this.checkingPlayback=false;}
 }
 state:LiveState={volume:null,sessionId:'',deviceId:'',active:false,connected:false,status:runtimeMessage('runtime027'),error:'',sampleRate:0,pcmBytes:0,encodedBytes:0,connections:0,httpRequests:0};
 constructor(private selectedAddress:()=>string){super();}
 private publish(){
  if(this.engine)this.state.pcmBytes=this.engine.bytes;
  if(this.server){this.state.connections=this.server.connections;this.state.httpRequests=this.server.requests;this.state.encodedBytes=this.server.encodedBytes;}
  if(this.airplay){this.state.packets=this.airplay.packets;this.state.timingExchanges=this.airplay.timingExchanges;this.state.underruns=this.airplay.underruns;}
  this.emit('state',{...this.state});
 }
 async begin(device:RendererDevice,address:string,sampleRate:number):Promise<LiveState>{
  if(this.commandBusy)throw new Error(runtimeMessage('runtime028'));
  await this.stop();
  const source=new YandexMusicSource();
  const engine=new AudioEngine(source,{sampleRate,channels:2,bitDepth:16});
  const server=new LiveServer();
  this.source=source;this.engine=engine;this.server=device.protocol==='airplay2'?undefined:server;this.controller=device.protocol==='airplay2'?undefined:receiverController(device,address);
  if(device.protocol==='airplay2')this.airplay=new AirplayOutput(device,address);
  const encoding=device.protocol==='airplay2'?'alac':device.protocol==='cast'?'mp3':'flac';
  this.state={playbackReady:false,encoding,volume:null,sessionId:randomBytes(16).toString('hex'),deviceId:device.id,active:true,connected:false,status:runtimeMessage('runtime029', {p0: encoding.toUpperCase()}),error:'',sampleRate,pcmBytes:0,encodedBytes:0,connections:0,httpRequests:0};
  try {
   await engine.start();
   if(this.airplay){const output=this.airplay;output.on('failure',message=>{if(this.airplay===output)void this.fail(message);});await output.prepare(engine);}
   else this.url=await server.start(address,device.ip,engine,encoding==='alac'?'flac':encoding);
   server.on('client-error',message=>{this.state.error=message;this.publish();});
   server.on('server-error',message=>{void this.fail(message);});
   this.lastInput=Date.now();
   this.timer=setInterval(()=>{
    if(!this.state.active)return;
    if(this.selectedAddress()!==address||!interfaces().some(i=>i.address===address)){void this.fail(runtimeMessage('runtime030'));return;}
    if(Date.now()-this.lastInput>8000){void this.fail(runtimeMessage('runtime031'));return;}
    this.publish();void this.checkPlayback();
   },1000);
   this.publish();return {...this.state};
  }catch(error){await this.stop();throw error;}
 }
 push(sessionId:string,data:Uint8Array){
  if(!this.state.active||this.state.sessionId!==sessionId)throw new Error(runtimeMessage('runtime032'));
  if(!(data instanceof Uint8Array)||data.byteLength>65536||data.byteLength%4||!data.byteLength)throw new Error(runtimeMessage('runtime033'));
  this.lastInput=Date.now();this.source!.push(Buffer.from(data));
 }
 async connect(sessionId:string){
  if(this.commandBusy)throw new Error(runtimeMessage('runtime034'));
  if(!this.state.active||sessionId!==this.state.sessionId)throw new Error(runtimeMessage('runtime032'));
  if(this.connected)return {...this.state};
  this.commandBusy=true;
  const controller=this.controller!,id=this.state.sessionId;
  const ensureActive=()=>{if(!this.state.active||this.state.sessionId!==id)throw new Error(runtimeMessage('runtime035'));};
  try{
   if(!this.engine?.bytes)throw new Error(runtimeMessage('runtime036'));
   if(this.airplay){const output=this.airplay;await output.play();this.playbackStartedAt=Date.now();ensureActive();const volume=await output.volume().catch(()=>null);ensureActive();this.state.volume=volume?.CurrentVolume??null;this.connected=true;this.awaitingPlayback=true;this.state.connected=true;this.state.status=runtimeMessage('runtime037');this.publish();return {...this.state};}
   await controller.setUri(this.url,'Яндекс Музыка — SonaRelay Live',undefined,this.state.encoding==='mp3'?'audio/mpeg':'audio/flac');ensureActive();
   await controller.play();ensureActive();
   const volume=await controller.volume().catch(()=>null);ensureActive();
   this.state.volume=volume?Number(volume.CurrentVolume):null;this.connected=true;this.awaitingPlayback=true;this.state.connected=true;this.state.status=runtimeMessage('runtime038', {p0: (this.state.encoding??'flac').toUpperCase()});this.publish();return {...this.state};
  }catch(error){if(this.state.active&&this.state.sessionId===id)await this.fail((error as Error).message);throw error;}
  finally{this.commandBusy=false;}
 }
 async command(command:PlaybackCommand,value?:number){
  if(!this.state.active||(!this.controller&&!this.airplay))throw new Error(runtimeMessage('runtime039'));
  if(this.commandBusy)throw new Error(runtimeMessage('runtime040'));
  this.commandBusy=true;
  if(command==='play'||command==='pause'){this.playbackRevision++;this.awaitingPlayback=command==='play';}
  try{
   if(command==='stop'){await this.stop();return {...this.state};}
   if(this.airplay){
    if(command==='pause'){this.state.playbackReady=false;this.airplay.pause();}
    if(command==='play'){this.state.playbackReady=false;await this.airplay.play();this.playbackStartedAt=Date.now();}
    if(command==='volume'){if(typeof value!=='number')throw new Error(runtimeMessage('runtime012'));await this.airplay.volume(value);this.state.volume=value;}
    this.state.status=this.airplay.isPlaying?runtimeMessage('runtime041'):runtimeMessage('runtime042');this.publish();return {...this.state};
   }
   if(command==='pause'){this.state.playbackReady=false;await this.controller!.pause();}
   if(command==='play'){
    this.state.playbackReady=false;
    // Reconnect at the current PCM position after receiver pause; no stale queue.
    await this.controller!.stop();this.server!.disconnect();
    await this.controller!.setUri(this.url,'Яндекс Музыка — SonaRelay Live',undefined,this.state.encoding==='mp3'?'audio/mpeg':'audio/flac');
    await this.controller!.play();
   }
   if(command==='volume'){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new Error(runtimeMessage('runtime012'));
    await this.controller!.volume(value);this.state.volume=value;
   }
   const info=await this.controller!.transport();this.state.status=String(info.CurrentTransportState??runtimeMessage('runtime043'));this.publish();return {...this.state};
  }catch(error){this.state.error=(error as Error).message;this.publish();throw error;}
  finally{this.commandBusy=false;}
 }
 private async fail(message:string){await this.stop();this.state.error=message;this.state.status=runtimeMessage('runtime044');this.publish();}
 async stop(){
  if(this.timer)clearInterval(this.timer);this.timer=undefined;
  this.playbackRevision++;this.awaitingPlayback=false;this.state.error='';
  this.state.active=false;this.state.playbackReady=false;this.state.connected=false;this.connected=false;
  const controller=this.controller,server=this.server,engine=this.engine,airplay=this.airplay;this.airplay=undefined;
  this.controller=undefined;this.server=undefined;this.engine=undefined;this.source=undefined;
  // Release HTTP and FFmpeg even if the receiver no longer answers SOAP.
  await airplay?.stop();await server?.close();await engine?.stop();
  if(controller)await controller.stop().catch(()=>{});
  this.state.connections=0;this.state.status=runtimeMessage('runtime027');this.publish();
 }
}
