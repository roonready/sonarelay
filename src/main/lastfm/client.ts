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
interface Response {
 statusCode?: number;
 on(event: 'data' | 'error' | 'end', listener: (chunk: Buffer) => void): unknown;
}
interface Request {
 on(event: 'close' | 'error', listener: () => void): unknown;
 end(chunk?: string): unknown;
 abort(): void;
}
type RequestFactory = (url:URL,options:{method:string;headers:Record<string,string>},response:(value:Response)=>void,body?:string)=>Request;
export const createLastfmTransport=(requestFactory:RequestFactory):LastfmTransport=>(method,parameters,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new Error(runtimeMessage('runtime103')));return;}
 const form=new URLSearchParams(parameters).toString(),url=new URL('https://ws.audioscrobbler.com/2.0/');
 if(method==='GET')url.search=form;
 const body=method==='POST'?form:undefined;
 const request=requestFactory(url,{method,headers:{'User-Agent':'SonaRelay/1.0','Accept':'application/json',...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})}},response=>{
  let bytes=0;const chunks:Buffer[]=[];response.on('error',()=>reject(new Error(runtimeMessage('runtime098'))));
  response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024)cancel('runtime099');else chunks.push(chunk);});
  response.on('end',()=>{
   try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result?.error)throw new LastfmError(Number(result.error),runtimeMessage('runtime100', {p0: Number(result.error)}));if(response.statusCode!==200)throw new Error(`Last.fm: HTTP ${response.statusCode}`);resolve(result);}
   catch(error){reject(error instanceof LastfmError?error:new Error(runtimeMessage('runtime101')));}
  });
 },body);
 function cancel(key:'runtime099'|'runtime102'|'runtime103'){reject(new Error(runtimeMessage(key)));request.abort();}
 const abort=()=>cancel('runtime103');
 const deadline=setTimeout(()=>cancel('runtime102'),10000);
 signal?.addEventListener('abort',abort,{once:true});
 request.on('close',()=>{clearTimeout(deadline);signal?.removeEventListener('abort',abort);});
 request.on('error',()=>reject(new Error(runtimeMessage('runtime104'))));request.end(body);
});
export const lastfmTransport=createLastfmTransport((url,options,response,body)=>{
 if(body!==undefined)options.headers['Content-Length']=String(Buffer.byteLength(body));
 return https.request(url,options,response);
});
export class LastfmClient {
 constructor(readonly apiKey:string,private secret:string,private transport:LastfmTransport=lastfmTransport){}
 private call(method:string,parameters:Record<string,string>,signal?:AbortSignal){
  const signed={...parameters,method,api_key:this.apiKey};
  return this.transport(['track.scrobble','track.updateNowPlaying'].includes(method)?'POST':'GET',{...signed,api_sig:lastfmSignature(signed,this.secret),format:'json'},signal);
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
