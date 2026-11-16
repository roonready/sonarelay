import { message as runtimeMessage } from '../../../shared/messages';
﻿import { ipc } from './ipc';
import workletUrl from './pcm-worklet.js?url';
export interface LiveCapture {sessionId:string;stop():Promise<void>}
export function requestMusicStream(){return navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}
export async function startLiveCapture(deviceId:string,onFailure:(message:string)=>void,signal:AbortSignal,requestedStream?:Promise<MediaStream>):Promise<LiveCapture>{
 let stream:MediaStream|undefined,context:AudioContext|undefined,node:AudioWorkletNode|undefined;
 let sessionId='',stopped=false,inFlight=0;
 let firstResolve:()=>void=()=>{},firstReject:(error:Error)=>void=()=>{};
 let firstReceived=false;
 const first=new Promise<void>((resolve,reject)=>{firstResolve=resolve;firstReject=reject;});
 // Install rejection handling immediately, before the worklet can fail.
 void first.catch(()=>{});
 let stopPromise:Promise<void>|undefined;
 const stop=()=>{
  if(stopPromise)return stopPromise;
  stopped=true;
  signal.removeEventListener('abort',abort);
  if(node){node.port.onmessage=null;node.disconnect();}
  stream?.getTracks().forEach(track=>track.stop());
  stopPromise=(async()=>{
   await context?.close().catch(()=>{});
   if(sessionId)await ipc.liveStop(sessionId).catch(()=>{});
  })();
  return stopPromise;
 };
 const fail=(message:string)=>{
  if(stopped)return;
  firstReject(new Error(message));onFailure(message);void stop();
 };
 const abort=()=>{firstReject(new Error(runtimeMessage('runtime035')));void stop();};
 signal.addEventListener('abort',abort,{once:true});
 try{
  stream=await (requestedStream??requestMusicStream());
  if(signal.aborted||stopped)throw new Error(runtimeMessage('runtime035'));
  const track=stream.getAudioTracks()[0];if(!track)throw new Error(runtimeMessage('runtime147'));
  track.addEventListener('ended',()=>fail(runtimeMessage('runtime148')),{once:true});
  const rate=track.getSettings().sampleRate;
  context=new AudioContext({...(rate?{sampleRate:rate}:{}),latencyHint:'playback'});
  await context.audioWorklet.addModule(workletUrl);
  const state=await ipc.liveBegin(deviceId,context.sampleRate);sessionId=state.sessionId;
  if(signal.aborted||stopped)throw new Error(runtimeMessage('runtime035'));
  node=new AudioWorkletNode(context,'pcm-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  node.port.onmessage=event=>{
   if(stopped)return;
   if(inFlight>=4){fail(runtimeMessage('runtime149'));return;}
   inFlight++;
   void ipc.livePcm(sessionId,new Uint8Array(event.data)).then(()=>{
    if(!firstReceived){firstReceived=true;firstResolve();}
   }).catch(error=>fail(String(error))).finally(()=>inFlight--);
  };
  context.createMediaStreamSource(new MediaStream([track])).connect(node);
  const silence=context.createGain();silence.gain.value=0;node.connect(silence).connect(context.destination);
  await context.resume();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([first,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error(runtimeMessage('runtime150'))),5000);})]);}
  finally{clearTimeout(timeout);}
  if(signal.aborted||stopped)throw new Error(runtimeMessage('runtime035'));
  await ipc.liveConnect(sessionId);
  if(signal.aborted||stopped)throw new Error(runtimeMessage('runtime035'));
  return {sessionId,stop};
 }catch(error){
  // stop() may already have run before the asynchronous capture/begin finished.
  stream?.getTracks().forEach(track=>track.stop());
  await context?.close().catch(()=>{});
  if(sessionId)await ipc.liveStop(sessionId).catch(()=>{});
  await stop();throw error;
 }
}
