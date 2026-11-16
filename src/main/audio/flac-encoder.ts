import { message as runtimeMessage } from '../../shared/messages';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AudioFormat } from './audio-source';
export function ffmpegPath(){
 const load=createRequire(__filename);
 const candidates:string[]=[];
 if(process.env.FFMPEG_BIN)candidates.push(process.env.FFMPEG_BIN);
 try{
  const configured=load('ffmpeg-static') as string|null;
  if(configured)candidates.push(configured);
 }catch{/* Resolve the installed binary independently of cached module exports. */}
 try{
  const directory=path.dirname(load.resolve('ffmpeg-static/package.json'));
  candidates.push(path.join(directory,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'));
 }catch{/* A packaged app may instead ship the binary as an extra resource. */}
 if(process.resourcesPath)candidates.push(path.join(process.resourcesPath,'ffmpeg',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'));
 const checked=[...new Set(candidates.flatMap(candidate=>[
  candidate.replace(/app\.asar([\\/])/,'app.asar.unpacked$1'),candidate,
 ]))];
 for(const candidate of checked){
  try{if(!/app\.asar[\\/]/.test(candidate)&&fs.statSync(candidate).isFile())return candidate;}catch{/* Try the next known installation path. */}
 }
 throw new Error(runtimeMessage('runtime024', {p0: checked.join('; ')||'пакет ffmpeg-static отсутствует'}));
}
export function flacEncoder(format:AudioFormat):ChildProcessWithoutNullStreams {
 return audioEncoder(format,'flac');
}
export function audioEncoder(format:AudioFormat,encoding:'flac'|'mp3'):ChildProcessWithoutNullStreams {
 const codec=encoding==='mp3'?['-c:a','libmp3lame','-b:a',format.sampleRate>=32000?'320k':'128k',...(format.sampleRate>48000?['-ar','48000']:[]),'-write_xing','0','-id3v2_version','3','-f','mp3']:['-c:a','flac','-compression_level','0','-frame_size','2048','-f','flac'];
 return spawn(ffmpegPath(),['-hide_banner','-loglevel','error','-f','s16le','-ar',String(format.sampleRate),'-ac','2','-i','pipe:0','-vn',...codec,'-flush_packets','1','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
}
