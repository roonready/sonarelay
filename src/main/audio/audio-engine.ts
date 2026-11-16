import { message as runtimeMessage } from '../../shared/messages';
﻿import { EventEmitter } from 'node:events';
import type { AudioSource, AudioFormat } from './audio-source';
export class AudioEngine extends EventEmitter {
 private history:Buffer[]=[];
 private historyBytes=0;
 bytes=0;
 lastDataAt=Date.now();
 constructor(readonly source: AudioSource,readonly format: AudioFormat){
  super();
  if(format.channels!==2||format.bitDepth!==16||!Number.isInteger(format.sampleRate)||format.sampleRate<8000||format.sampleRate>192000)throw new Error(runtimeMessage('runtime017'));
 }
 async start(){this.source.onAudioData(pcm=>this.accept(pcm));await this.source.start();}
 private accept(pcm: Buffer){
  if(!Buffer.isBuffer(pcm)||pcm.length>65536||pcm.length%4)throw new Error(runtimeMessage('runtime018'));
  if(!pcm.length)return;
  this.bytes+=pcm.length;this.lastDataAt=Date.now();
  // Keep at most 250 ms of PCM for a newly connected receiver.
  const limit=Math.floor(this.format.sampleRate/4)*4;
  const copy=Buffer.from(pcm);this.history.push(copy);this.historyBytes+=copy.length;
  while(this.historyBytes>limit && this.history.length){
   const first=this.history[0],excess=this.historyBytes-limit;
   if(first.length<=excess){this.history.shift();this.historyBytes-=first.length;}
   else {this.history[0]=first.subarray(excess);this.historyBytes-=excess;}
  }
  this.emit('pcm',pcm);
 }
 snapshot(){return Buffer.concat(this.history,this.historyBytes);}
 async stop(){await this.source.stop();this.removeAllListeners();this.history=[];this.historyBytes=0;}
}
