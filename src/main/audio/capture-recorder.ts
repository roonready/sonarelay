import { message as runtimeMessage } from '../../shared/messages';
﻿import fs from 'node:fs';
import path from 'node:path';
import { wavHeader } from './wav';
import type { CaptureResult } from '../../shared/types';
export class CaptureRecorder {
 private fd?: number;
 private bytes=0;
 private peak=0;
 private sampleRate=48000;
 private timer?: NodeJS.Timeout;
 private file='';
 result?: CaptureResult;
 constructor(private readonly directory: string) {}
 begin(sampleRate: number) {
  if(this.fd!==undefined)throw new Error(runtimeMessage('runtime019'));
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error(runtimeMessage('runtime020'));
  fs.mkdirSync(this.directory,{recursive:true});
  this.file=path.join(this.directory,`yandex-${Date.now()}.wav`);
  this.sampleRate=sampleRate;this.bytes=0;this.peak=0;this.result=undefined;
  this.fd=fs.openSync(this.file,'w');fs.writeSync(this.fd,Buffer.alloc(44));
  this.timer=setTimeout(()=>this.finish(),20000);
 }
 append(data: Uint8Array) {
  if(this.fd===undefined)return;
  if(!(data instanceof Uint8Array)||data.byteLength>65536||data.byteLength%4)throw new Error(runtimeMessage('runtime021'));
  const buffer=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  const remaining=this.sampleRate*4*16-this.bytes;
  const chunk=buffer.subarray(0,Math.max(0,remaining));
  for(let i=0;i<chunk.length;i+=2)this.peak=Math.max(this.peak,Math.abs(chunk.readInt16LE(i)));
  fs.writeSync(this.fd,chunk);this.bytes+=chunk.length;
  if(this.bytes>=this.sampleRate*4*16)this.finish();
 }
 finish(): CaptureResult {
  if(this.fd===undefined){if(this.result)return this.result;throw new Error(runtimeMessage('runtime022'));}
  if(this.timer)clearTimeout(this.timer);
  fs.writeSync(this.fd,wavHeader(this.bytes,{sampleRate:this.sampleRate,channels:2,bitDepth:16}),0,44,0);
  fs.closeSync(this.fd);this.fd=undefined;
  this.result={path:this.file,sampleRate:this.sampleRate,bitDepth:16,channels:2,seconds:this.bytes/(this.sampleRate*4),peak:this.peak/32768};
  return this.result;
 }
 read() {
  if(!this.result || this.result.seconds<1 || this.result.peak<0.0001)throw new Error(runtimeMessage('runtime023'));
  return fs.readFileSync(this.result.path);
 }
 dispose(){if(this.fd!==undefined)this.finish();}
}
