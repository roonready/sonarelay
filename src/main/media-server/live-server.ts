import { message as runtimeMessage } from '../../shared/messages';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AudioEngine } from '../audio/audio-engine';
import { audioEncoder, ffmpegPath } from '../audio/flac-encoder';
import { mediaCorsHeaders } from './cors';
export class LiveServer extends EventEmitter {
 private server?:http.Server;
 private clients=new Set<()=>void>();
 requests=0;
 encodedBytes=0;
 get connections(){return this.clients.size;}
 async start(address:string,receiverIp:string,engine:AudioEngine,encoding:'flac'|'mp3'='flac'):Promise<string>{
  ffmpegPath();
  const token=randomBytes(16).toString('hex');
  const server=http.createServer((request,response)=>{
   if(request.socket.remoteAddress!==receiverIp||request.url!==`/${token}.${encoding}`){response.writeHead(404).end();return;}
   for(const [key,value] of Object.entries(mediaCorsHeaders()))response.setHeader(key,value);
   if(request.method==='OPTIONS'){response.writeHead(204).end();return;}
   if(!['GET','HEAD'].includes(request.method??'')){response.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
   if(request.headers.range && request.headers.range!=='bytes=0-'){response.writeHead(416).end();return;}
   if(this.clients.size>=4 && request.method==='GET'){response.writeHead(503,{'Retry-After':'1'}).end();return;}
   response.useChunkedEncodingByDefault=encoding==='mp3';
   response.writeHead(200,{'Content-Type':encoding==='mp3'?'audio/mpeg':'audio/flac','Accept-Ranges':'none','Cache-Control':'no-store',Connection:'close','transferMode.dlna.org':'Streaming','contentFeatures.dlna.org':'DLNA.ORG_OP=00;DLNA.ORG_CI=0'});
   if(request.method==='HEAD'){response.end();return;}
   this.requests++;
   const encoder=audioEncoder(engine.format,encoding);let closed=false,stderr='';
   const close=()=>{
    if(closed)return;closed=true;engine.off('pcm',write);this.clients.delete(close);
    clearInterval(check);encoder.stdout.unpipe(response);encoder.stdin.destroy();encoder.kill();response.destroy();
   };
   const fail=(message:string)=>{this.emit('client-error',message);close();};
   const write=(pcm:Buffer)=>{
    if(closed)return;
    if(encoder.stdin.writableLength>engine.format.sampleRate*4*2){fail(runtimeMessage('runtime126'));return;}
    encoder.stdin.write(pcm);
   };
   encoder.on('error',error=>fail(`FFmpeg: ${error.message}`));
   encoder.stdin.on('error',error=>{if(!closed)fail(`FFmpeg stdin: ${error.message}`);});
   encoder.stdout.on('error',error=>{if(!closed)fail(`FFmpeg stdout: ${error.message}`);});
   encoder.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-2000);});
   encoder.on('exit',code=>{if(!closed)fail(runtimeMessage('runtime127', {p0: code, p1: stderr}));});
   encoder.stdout.on('data',(data:Buffer)=>{this.encodedBytes+=data.length;});
   encoder.stdout.pipe(response);
   const check=setInterval(()=>{if(response.writableLength>1024*1024)fail(runtimeMessage('runtime128'));},1000);
   response.on('close',close);response.on('error',close);
   this.clients.add(close);engine.on('pcm',write);
   const initial=engine.snapshot();if(initial.length)write(initial);
  });
  this.server=server;server.maxConnections=8;server.headersTimeout=10000;server.requestTimeout=0;server.timeout=0;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,address,()=>{server.off('error',reject);resolve();});});
  server.on('error',error=>this.emit('server-error',error.message));
  const info=server.address();if(!info||typeof info==='string')throw new Error(runtimeMessage('runtime129'));
  return `http://${address}:${info.port}/${token}.${encoding}`;
 }
 disconnect(){for(const close of [...this.clients])close();}
 async close(){
  this.disconnect();
  const server=this.server;this.server=undefined;
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 }
}
