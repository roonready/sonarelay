import { message as runtimeMessage } from '../../shared/messages';
﻿/** A bounded FIFO of interleaved stereo s16le; never split a PCM frame. */
export class PcmQueue {
 private chunks:Buffer[]=[];
 private offset=0;
 bytes=0;
 constructor(readonly limit:number){}
 push(data:Buffer){
  if(data.length%4)throw new Error(runtimeMessage('runtime014'));
  if(this.bytes+data.length>this.limit)throw new Error(runtimeMessage('runtime015'));
  if(data.length){this.chunks.push(Buffer.from(data));this.bytes+=data.length;}
 }
 read(size:number):Buffer|undefined{
  if(size%4||size<=0)throw new Error(runtimeMessage('runtime016'));
  if(this.bytes<size)return;
  const output=Buffer.allocUnsafe(size);let written=0;
  while(written<size){
   const chunk=this.chunks[0],count=Math.min(size-written,chunk.length-this.offset);
   chunk.copy(output,written,this.offset,this.offset+count);written+=count;this.offset+=count;this.bytes-=count;
   if(this.offset===chunk.length){this.chunks.shift();this.offset=0;}
  }return output;
 }
 clear(){this.chunks=[];this.offset=0;this.bytes=0;}
}
