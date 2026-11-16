import { message as runtimeMessage } from '../../shared/messages';
import { EventEmitter } from 'node:events';
import { createSocket, type Socket } from 'node:dgram';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AudioEngine } from '../audio/audio-engine';
import type { RendererDevice } from '../../shared/types';
import { ffmpegPath } from '../audio/flac-encoder';
import { airplayLibrary } from './library';
import { PcmQueue } from './pcm-queue';
import type { AirPlayConnection, PtpEngine, NtpTimingResponder, RealtimeSender } from '@sonn-audio/node-airplay';
export class AirplayOutput extends EventEmitter {
 private connection?:AirPlayConnection;
 private ptp?:PtpEngine;
 private ntp?:NtpTimingResponder;
 private sender?:RealtimeSender;
 private sockets:Socket[]=[];
 private resampler?:ChildProcessWithoutNullStreams;
 private engine?:AudioEngine;
 private queue=new PcmQueue(44100*4*2);
 private clock?:NodeJS.Timeout;
 private started=false;
 private paused=false;
 private buffering=false;
 private closed=false;
 private stopPromise?:Promise<void>;
 private stderr='';
 private pcmTail=Buffer.alloc(0);
 timing:'ptp'|'ntp'='ptp';
 underruns=0;
 get packets(){return this.sender?.packetsSent??0;}
 get timingExchanges(){return this.timing==='ntp'?this.ntp?.exchanges??0:this.ptp?.exchanges??0;}
 get isPlaying(){return this.started&&!this.paused&&!this.closed;}
 constructor(readonly device:RendererDevice,readonly address:string){super();}
 private fail(message:string){if(!this.closed){this.emit('failure',message);void this.stop().catch(console.error);}}
 private ensureOpen(){if(this.closed)throw new Error(runtimeMessage('runtime004'));}
 private async socket(){
  this.ensureOpen();
  const socket=createSocket({type:'udp4',reuseAddr:true});this.sockets.push(socket);
  socket.on('error',error=>this.fail(`AirPlay 2 UDP: ${error.message}`));
  await new Promise<void>((resolve,reject)=>{socket.once('error',reject);socket.bind(0,this.address,()=>{socket.removeListener('error',reject);resolve();});});
  return socket;
 }
 async prepare(engine:AudioEngine){
  if(this.device.airplayPairingRequired)throw new Error(runtimeMessage('runtime005'));
  const ap=airplayLibrary();
  const identity=createHash('sha256').update('SonaRelay:'+os.hostname()).digest().subarray(0,8);
  try{
   const open=async()=>{
    const connection=await ap.AirPlayConnection.open({host:this.device.ip,port:this.device.apiPort??7000,identity,name:'SonaRelay',timeoutMs:3000,onEvent:event=>{if(!this.closed&&/closed|failed|returned (4|5)/i.test(event))this.fail(`AirPlay 2: ${event}`);}});
    if(this.closed){connection.close();throw new Error(runtimeMessage('runtime004'));}
    if(connection.rtsp.localAddress()!==this.address){connection.close();throw new Error(runtimeMessage('runtime006'));}
    this.connection=connection;return connection;
   };
   let connection=await open();this.timing=this.device.airplayTiming??'ptp';
   this.ptp=new ap.PtpEngine({clockId:connection.identity.clockId,peers:[this.device.ip],bindAddress:this.address,onLog:message=>{if(/error|failed/i.test(message))this.emit('diagnostic',message);}});
   if(this.timing==='ptp')await this.ptp.start();
   if(this.timing==='ntp'){this.ntp=new ap.NtpTimingResponder();}
   let timingPort=this.ntp?await this.ntp.start():undefined;
   const session=await connection.setupSession('SonaRelay',{timing:this.timing,...(timingPort?{timingPort}:{})});
   if(session.wantsNtpTiming&&this.timing==='ptp'){
    await connection.rtsp.request('TEARDOWN',{uri:connection.sessionUrl,timeoutMs:1500}).catch(()=>{});connection.close();this.ptp.stop();this.ensureOpen();
    this.timing='ntp';this.ntp=new ap.NtpTimingResponder();timingPort=await this.ntp.start();connection=await open();
    await connection.setupSession('SonaRelay',{timing:'ntp',timingPort});
   }
   this.ensureOpen();
   const data=await this.socket();this.ensureOpen();const control=await this.socket();this.ensureOpen();
   const dataPort=(data.address() as {port:number}).port,controlPort=(control.address() as {port:number}).port;
   const stream=await ap.setupRealtimeStream(connection.rtsp,connection.sessionUrl,{audioKey:connection.hap.sharedSecret,localDataPort:dataPort,localControlPort:controlPort,streamConnectionId:Date.now()%0x7fffffff});
   this.ensureOpen();
   this.sender=new ap.RealtimeSender({host:this.device.ip,dataPort:stream.dataPort,controlPort:stream.controlPort,audioKey:connection.hap.sharedSecret,ptp:this.ptp,timing:this.timing,leadMs:2000,onLog:message=>{if(/failed/i.test(message))this.emit('diagnostic',message);}},data,control);
   await ap.setMetadata(connection.rtsp,connection.sessionUrl,{title:'Яндекс Музыка',artist:'SonaRelay'},this.sender.rtpPosition);
   this.ensureOpen();this.engine=engine;
   const child=spawn(ffmpegPath(),['-hide_banner','-loglevel','error','-f','s16le','-ar',String(engine.format.sampleRate),'-ac','2','-i','pipe:0','-ar','44100','-ac','2','-f','s16le','-flush_packets','1','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   this.resampler=child;
   child.on('error',error=>this.fail(`AirPlay 2 FFmpeg: ${error.message}`));
   child.stdin.on('error',error=>{if(!this.closed)this.fail(error.message);});
   child.stdout.on('error',error=>this.fail(error.message));
   child.stdout.on('data',(data:Buffer)=>{
    if(this.closed||this.paused)return;
    const joined=this.pcmTail.length?Buffer.concat([this.pcmTail,data]):data;
    const bytes=joined.length-joined.length%4;this.pcmTail=Buffer.from(joined.subarray(bytes));
    try{this.queue.push(joined.subarray(0,bytes));}catch(error){this.fail((error as Error).message);}
   });
   child.stderr.on('data',data=>{this.stderr=(this.stderr+String(data)).slice(-2000);});
   child.on('exit',code=>{if(!this.closed)this.fail(runtimeMessage('runtime007', {p0: code, p1: this.stderr}));});
   engine.on('pcm',this.write);
  }catch(error){await this.stop();throw error;}
 }
 private write=(pcm:Buffer)=>{
  if(this.closed||!this.resampler)return;
  if(this.resampler.stdin.writableLength>(this.engine?.format.sampleRate??48000)*4*2){this.fail(runtimeMessage('runtime008'));return;}
  this.resampler.stdin.write(pcm);
 };
 async play(){
  if(this.closed||!this.sender)throw new Error(runtimeMessage('runtime009'));
  if(this.started){this.buffering=true;this.paused=false;return;}
  const deadline=Date.now()+4000;
  while(this.queue.bytes<44100 && Date.now()<deadline && !this.closed)await new Promise(resolve=>setTimeout(resolve,20));
  if(this.closed||this.queue.bytes<44100)throw new Error(runtimeMessage('runtime010'));
  this.sender.start();this.started=true;
  const start=process.hrtime.bigint();let sent=0;
  this.clock=setInterval(()=>{
   if(this.closed||!this.sender)return;
   try{
    const due=Math.floor(Number(process.hrtime.bigint()-start)/1e9*44100/352)+1;
    if(due-sent>250)throw new Error(runtimeMessage('runtime011'));
    if(this.buffering&&this.queue.bytes>=44100)this.buffering=false;
    for(let n=0;sent<due&&n<32;n++,sent++){
     const pcm=this.paused||this.buffering?undefined:this.queue.read(352*4);
     if(!pcm&&!this.paused&&!this.buffering)this.underruns++;
     this.sender.sendPacket(pcm??Buffer.alloc(352*4));
    }
   }catch(error){this.fail((error as Error).message);}
  },4);
 }
 pause(){this.paused=true;this.queue.clear();}
 async volume(value?:number){
  if(!this.connection||this.closed)throw new Error(runtimeMessage('runtime009'));
  if(value!==undefined){
   if(!Number.isFinite(value)||value<0||value>100)throw new Error(runtimeMessage('runtime012'));
   await airplayLibrary().setVolume(this.connection.rtsp,this.connection.sessionUrl,value);return {CurrentVolume:Math.round(value)};
  }
  const response=await this.connection.rtsp.request('GET_PARAMETER',{uri:this.connection.sessionUrl,contentType:'text/parameters',body:Buffer.from('volume\r\n'),timeoutMs:1500});
  const match=response.body.toString('utf8').match(/volume:\s*(-?[\d.]+)/i);
  if(!match)throw new Error(runtimeMessage('runtime013'));
  const db=Number(match[1]);return {CurrentVolume:db<=-144?0:Math.round(Math.max(0,Math.min(100,(db+30)/30*100)))};
 }
 stop():Promise<void>{
  if(this.stopPromise)return this.stopPromise;this.closed=true;
  if(this.clock)clearInterval(this.clock);this.clock=undefined;
  this.engine?.off('pcm',this.write);this.resampler?.stdin.destroy();this.resampler?.kill();this.resampler=undefined;this.queue.clear();
  try{this.sender?.stop();}catch{/* A partially established stream may already have closed a UDP socket. */}
  if(!this.sender)for(const socket of this.sockets){try{socket.close();}catch{/* Already closed. */}}
  try{this.ptp?.stop();}catch{/* PTP binding may have failed before full setup. */}try{this.ntp?.stop();}catch{/* Timing socket may be partially bound. */}
  const connection=this.connection;this.connection=undefined;
  this.stopPromise=(async()=>{
   if(connection){await connection.rtsp.request('TEARDOWN',{uri:connection.sessionUrl,timeoutMs:1500}).catch(()=>{});connection.close();}
  })();return this.stopPromise;
 }
}
