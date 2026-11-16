import { message as runtimeMessage } from '../../../shared/messages';
﻿import { ipc } from './ipc';
import workletUrl from './pcm-worklet.js?url';
export async function recordMusic(onProgress: (text: string)=>void) {
 let stream: MediaStream | undefined;
 let context: AudioContext | undefined;
 let node: AudioWorkletNode | undefined;
 let started=false;
 try {
  stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const track=stream.getAudioTracks()[0];
  if(!track)throw new Error(runtimeMessage('runtime144'));
  const rate=track.getSettings().sampleRate;
  context=new AudioContext({...(rate ? {sampleRate:rate} : {}),latencyHint:'interactive'});
  await context.audioWorklet.addModule(workletUrl);
  await ipc.captureBegin(context.sampleRate);started=true;
  node=new AudioWorkletNode(context,'pcm-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  node.port.onmessage=event=>ipc.capturePcm(new Uint8Array(event.data));
  context.createMediaStreamSource(new MediaStream([track])).connect(node);
  const silence=context.createGain();silence.gain.value=0;node.connect(silence).connect(context.destination);
  await context.resume();
  onProgress(runtimeMessage('runtime145', {p0: context.sampleRate}));
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(resolve,15000);
   track.addEventListener('ended',()=>{clearTimeout(timer);reject(new Error(runtimeMessage('runtime146')));},{once:true});
  });
  node.port.onmessage=null;
  return await ipc.captureFinish();
 } finally {
  if(node){node.port.onmessage=null;node.disconnect();}
  stream?.getTracks().forEach(track=>track.stop());
  await context?.close();
  if(started)await ipc.captureFinish().catch(()=>{});
 }
}
