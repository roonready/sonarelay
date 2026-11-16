import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mediaCorsHeaders } from './cors';
export class MediaServer {
 private server?: http.Server;
 private data?: Buffer;
 private token='';
 requests=0;
 async start(address: string, receiverIp: string, data: Buffer): Promise<string> {
  await this.close();this.data=data;this.token=randomBytes(16).toString('hex');this.requests=0;
  const server=http.createServer((request,response)=>{
   if(request.socket.remoteAddress!==receiverIp || request.url!==`/${this.token}.wav`) {response.writeHead(404).end();return;}
   for(const [key,value] of Object.entries(mediaCorsHeaders()))response.setHeader(key,value);
   if(request.method==='OPTIONS'){response.writeHead(204).end();return;}
   if(request.method!=='GET' && request.method!=='HEAD') {response.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
   const buffer=this.data!;
   let start=0,end=buffer.length-1,status=200;
   if(request.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if(!match || (!match[1]&&!match[2])) {response.writeHead(416,{'Content-Range':`bytes */${buffer.length}`}).end();return;}
    if(!match[1]) start=Math.max(0,buffer.length-Number(match[2]));
    else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(start>=buffer.length || start>end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {response.writeHead(416,{'Content-Range':`bytes */${buffer.length}`}).end();return;}
    status=206;
   }
   const headers: Record<string,string|number>={'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes','transferMode.dlna.org':'Streaming','contentFeatures.dlna.org':'DLNA.ORG_OP=01;DLNA.ORG_CI=0','Cache-Control':'no-store'};
   if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${buffer.length}`;
   response.writeHead(status,headers);
   if(request.method==='HEAD')response.end();else {this.requests++;response.end(buffer.subarray(start,end+1));}
  });
  this.server=server;server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=8;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,address,()=>{server.off('error',reject);resolve();});});
  const info=server.address();if(!info || typeof info==='string')throw new Error('HTTP server unavailable');
  return `http://${address}:${info.port}/${this.token}.wav`;
 }
 async close() {
  const server=this.server;this.server=undefined;
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  this.data=undefined;
 }
}
