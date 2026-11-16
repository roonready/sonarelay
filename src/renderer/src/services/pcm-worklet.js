class PcmProcessor extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Int16Array(8192);this.offset=0;}
 process(inputs,outputs){
  const channels=inputs[0],left=channels?.[0],right=channels?.[1]||left;
  const frames=left?.length||outputs[0]?.[0]?.length||128;
  // Preserve the PCM clock through silence and track transitions.
  for(let i=0;i<frames;i++){
   this.buffer[this.offset++]=Math.round(Math.max(-1,Math.min(1,left?.[i]||0))*32767);
   this.buffer[this.offset++]=Math.round(Math.max(-1,Math.min(1,right?.[i]||0))*32767);
   if(this.offset===this.buffer.length){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Int16Array(8192);this.offset=0;}
  }
  return true;
 }
}
registerProcessor('pcm-recorder',PcmProcessor);
