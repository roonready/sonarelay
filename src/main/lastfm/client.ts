import { message as runtimeMessage } from '../../shared/messages';
import https from 'node:https';
import { createHash } from 'node:crypto';
export class LastfmError extends Error {constructor(readonly code:number,message:string){super(message);}}
export type LastfmTransport=(method:'GET'|'POST',parameters:Record<string,string>,signal?:AbortSignal)=>Promise<any>;
export function lastfmResponseShape(result:unknown){
 const response=result as {token?:unknown}|null;
 const token=response&&typeof response==='object'?response.token:undefined;
 return {responseType:result===null?'null':Array.isArray(result)?'array':typeof result,hasToken:!!response&&Object.prototype.hasOwnProperty.call(response,'token'),tokenType:typeof token,tokenLength:typeof token==='string'?token.length:null};
}
export function lastfmSignature(parameters:Record<string,string>,secret:string){
 const text=Object.keys(parameters).filter(key=>!['format','callback','api_sig'].includes(key)).sort().map(key=>key+parameters[key]).join('');
 return createHash('md5').update(text+secret,'utf8').digest('hex');
}
export const lastfmTransport:LastfmTransport=(method,parameters,signal)=>new Promise((resolve,reject)=>{
 const form=new URLSearchParams(parameters).toString(),url=new URL('https://ws.audioscrobbler.com/2.0/');
 if(method==='GET')url.search=form;
 const request=https.request(url,{method,signal,headers:{'User-Agent':'SonaRelay/1.0','Accept':'application/json',...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(form)}:{})}},response=>{
  let bytes=0;const chunks:Buffer[]=[];response.on('error',()=>reject(new Error(runtimeMessage('runtime098'))));
  response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024)request.destroy(new Error(runtimeMessage('runtime099')));else chunks.push(chunk);});
  response.on('end',()=>{
   try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result?.error)throw new LastfmError(Number(result.error),runtimeMessage('runtime100', {p0: Number(result.error)}));if(response.statusCode!==200)throw new Error(`Last.fm: HTTP ${response.statusCode}`);resolve(result);}
   catch(error){reject(error instanceof LastfmError?error:new Error(runtimeMessage('runtime101')));}
  });
 });
 const deadline=setTimeout(()=>request.destroy(new Error(runtimeMessage('runtime102'))),10000);
 request.on('close',()=>clearTimeout(deadline));request.on('error',()=>reject(new Error(signal?.aborted?runtimeMessage('runtime103'):runtimeMessage('runtime104'))));request.end(method==='POST'?form:undefined);
});
export class LastfmClient {
 constructor(readonly apiKey:string,private secret:string,private transport:LastfmTransport=lastfmTransport){}
 private call(method:string,parameters:Record<string,string>,signal?:AbortSignal){
  const signed={...parameters,method,api_key:this.apiKey};
  return this.transport(['track.scrobble','track.updateNowPlaying'].includes(method)?'POST':'GET',{...signed,api_sig:lastfmSignature(signed,this.secret),format:'json'},signal);
 }
 async duration(artist:string,title:string,signal?:AbortSignal):Promise<number|null>{
  const result=await this.call('track.getInfo',{artist,track:title,autocorrect:'0'},signal);
  const milliseconds=Number(result?.track?.duration);
  return Number.isFinite(milliseconds)&&milliseconds>0&&milliseconds<=86400000?milliseconds/1000:null;
 }
 async token(signal?:AbortSignal):Promise<string>{
  const result=await this.call('auth.getToken',{},signal);
  if(typeof result?.token!=='string'||!/^\w{16,128}$/.test(result.token)){
   console.warn('[Last.fm] Authorization response rejected',lastfmResponseShape(result));
   throw new Error(runtimeMessage('runtime105'));
  }
  return result.token;
 }
 async session(token:string,signal?:AbortSignal):Promise<{key:string;name:string}>{
  const result=await this.call('auth.getSession',{token},signal),session=result?.session;
  if(typeof session?.key!=='string'||!/^\w{16,128}$/.test(session.key)||typeof session?.name!=='string'||!session.name.trim())throw new Error(runtimeMessage('runtime106'));
  return {key:session.key,name:session.name.slice(0,200)};
 }
 async submit(method:'track.updateNowPlaying'|'track.scrobble',parameters:Record<string,string>,signal?:AbortSignal){
  const result=await this.call(method,parameters,signal);
  if(method==='track.scrobble'){
   if(Number(result?.scrobbles?.['@attr']?.accepted)!==1)throw new Error(runtimeMessage('runtime107'));
  }else if(!result?.nowplaying||Number(result.nowplaying.ignoredMessage?.code??0)!==0)throw new Error(runtimeMessage('runtime108'));
 }
}
