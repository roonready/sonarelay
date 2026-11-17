import type { IncomingHttpHeaders } from 'node:http';
import type { RadioStreamInfo } from '../../shared/radio';

/** Inspect diagnostics from the existing decoder, never open a second radio connection. */
export class RadioStreamProbe {
 private buffer='';
 private input=false;
 private finished=false;
 private info:RadioStreamInfo={codec:null,sampleRate:null,channels:null,bitDepth:null,bitrate:null,bitrateSource:null};
 constructor(private publish:(info:RadioStreamInfo)=>void,headers:IncomingHttpHeaders={}){
  const bitrate=typeof headers['icy-br']==='string'?Number(headers['icy-br']):NaN;
  if(Number.isFinite(bitrate)&&bitrate>0&&bitrate<=100000){this.info.bitrate=bitrate*1000;this.info.bitrateSource='station';}
  this.publish({...this.info});
 }
 push(data:Buffer|string){
  if(this.finished)return;
  this.buffer+=data.toString();
  const lines=this.buffer.split(/\r?\n/);this.buffer=(lines.pop()??'').slice(-8192);
  for(const line of lines)this.line(line);
 }
 private line(line:string){
  if(this.finished)return;
  if(/^Input #0,/.test(line)){this.input=true;return;}
  if(/^(Output #|Stream mapping:)/.test(line)){this.finished=true;return;}
  if(!this.input||!/^\s*Stream #0:\d+.*Audio:/.test(line))return;
  const audio=line.slice(line.indexOf('Audio:')+6),codec=audio.match(/^\s*([a-z0-9_]+)/i)?.[1]?.toLowerCase()??null;
  const rate=Number(audio.match(/\b(\d+) Hz\b/)?.[1]);
  const layout=audio.match(/,\s*(mono|stereo|[257]\.1(?:\([^)]*\))?|\d+ channels)\s*,/i)?.[1]?.toLowerCase();
  const channels=layout==='mono'?1:layout==='stereo'?2:layout?.startsWith('2.1')?3:layout?.startsWith('5.1')?6:layout?.startsWith('7.1')?8:layout?Number.parseInt(layout):null;
  const lossless=codec==='flac'||codec==='alac'||codec?.startsWith('pcm_');
  const depth=lossless?Number(audio.match(/\((\d+) bit\)/)?.[1]??audio.match(/,\s*[su](8|16|24|32|64)p?\b/)?.[1]):null;
  const bitrate=Number(audio.match(/\b(\d+(?:\.\d+)?) kb\/s\b/)?.[1]);
  this.info={...this.info,codec,sampleRate:Number.isFinite(rate)&&rate>0?rate:null,channels:channels&&Number.isFinite(channels)?channels:null,bitDepth:depth&&Number.isFinite(depth)?depth:null,
   ...(Number.isFinite(bitrate)&&bitrate>0?{bitrate:bitrate*1000,bitrateSource:'codec' as const}:{})};
  this.publish({...this.info});
 }
}
