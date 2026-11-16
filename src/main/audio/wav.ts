export interface PcmFormat { sampleRate: number; channels: 2; bitDepth: 16 }
export function wavHeader(bytes: number, format: PcmFormat): Buffer {
 const header=Buffer.alloc(44), block=format.channels*format.bitDepth/8;
 header.write('RIFF');header.writeUInt32LE(bytes+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);
 header.writeUInt16LE(1,20);header.writeUInt16LE(format.channels,22);header.writeUInt32LE(format.sampleRate,24);
 header.writeUInt32LE(format.sampleRate*block,28);header.writeUInt16LE(block,32);header.writeUInt16LE(format.bitDepth,34);
 header.write('data',36);header.writeUInt32LE(bytes,40);return header;
}
export function testWav(seconds=8): Buffer {
 const sampleRate=44100, frames=sampleRate*seconds, pcm=Buffer.alloc(frames*4);
 for(let i=0;i<frames;i++) {
  const fade=Math.min(1,i/(sampleRate*.05),(frames-i)/(sampleRate*.05));
  const value=Math.round(Math.sin(i*2*Math.PI*440/sampleRate)*650*fade);
  pcm.writeInt16LE(value,i*4);pcm.writeInt16LE(value,i*4+2);
 }
 return Buffer.concat([wavHeader(pcm.length,{sampleRate,channels:2,bitDepth:16}),pcm]);
}
