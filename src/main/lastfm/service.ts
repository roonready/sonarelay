import { message as runtimeMessage } from '../../shared/messages';
import { EventEmitter } from 'node:events';
import type { LastfmPreferences, LastfmState, MusicMetadataSnapshot } from '../../shared/types';
import { LastfmClient, LastfmError } from './client';
import type { LastfmStorage, StoredSession } from './storage';
import { LastfmTracker } from './tracker';
export class LastfmService extends EventEmitter {
 private session?:StoredSession;
 private token?:string;
 private tokenCreated=0;
 private tracker=new LastfmTracker();
 private generation=0;
 private closed=false;
 private abort=new AbortController();
 private authTask?:Promise<void>;
 private disconnectTask?:Promise<void>;
 private requests=new Set<Promise<void>>();
 readonly state:LastfmState={configured:false,connected:false,username:'',pendingAuthorization:false,busy:true,error:'',scrobbling:true,nowPlaying:true};
 readonly ready:Promise<void>;
 constructor(private storage:LastfmStorage,private client:LastfmClient|undefined,private openExternal:(url:string)=>Promise<void>,private clock={now:()=>performance.now(),epoch:()=>Date.now()}){
  super();this.state.configured=!!client;this.ready=this.initialize();
 }
 private publish(){if(!this.closed)this.emit('state',this.snapshot());}
 snapshot():LastfmState{return {...this.state};}
 private async initialize(){
  try{
   const preferences=await this.storage.preferences();if(this.closed)return;Object.assign(this.state,preferences);
   const session=await this.storage.loadSession();if(this.closed)return;
   if(session){if(session.apiKey===this.client?.apiKey){this.session=session;this.state.connected=true;this.state.username=session.name;}else this.state.error=runtimeMessage('runtime111');}
  }catch(error){if(!this.closed)this.state.error=(error as Error).message;}
  finally{this.state.busy=false;this.publish();}
 }
 private check(generation:number){if(this.closed||generation!==this.generation)throw new Error(runtimeMessage('runtime112'));}
 private async auth(action:(generation:number)=>Promise<void>){
  await this.ready;if(this.closed)throw new Error(runtimeMessage('runtime092'));
  if(this.state.busy||this.disconnectTask)throw new Error(runtimeMessage('runtime113'));
  this.state.busy=true;this.state.error='';this.publish();const generation=this.generation;
  const task=(async()=>{try{await action(generation);}catch(error){if(!this.closed&&generation===this.generation){this.state.error=error instanceof LastfmError&&error.code===14?runtimeMessage('runtime114'):(error as Error).message;}throw error;}finally{if(!this.disconnectTask)this.state.busy=false;this.publish();}})();
  this.authTask=task;try{await task;return this.snapshot();}finally{if(this.authTask===task)this.authTask=undefined;}
 }
 connect(){return this.auth(async generation=>{
  if(!this.client)throw new Error(runtimeMessage('runtime115'));
  if(this.session)throw new Error(runtimeMessage('runtime116'));
  const token=await this.client.token(this.abort.signal);this.check(generation);
  const url=new URL('https://www.last.fm/api/auth/');url.searchParams.set('api_key',this.client.apiKey);url.searchParams.set('token',token);
  try{await this.openExternal(url.href);}catch{throw new Error(runtimeMessage('runtime117'));}this.check(generation);
  this.token=token;this.tokenCreated=Date.now();this.state.pendingAuthorization=true;
 });}
 confirm(){return this.auth(async generation=>{
  if(!this.client||!this.token)throw new Error(runtimeMessage('runtime118'));
  if(Date.now()-this.tokenCreated>=3600000){this.token=undefined;this.state.pendingAuthorization=false;throw new Error(runtimeMessage('runtime119'));}
  const result=await this.client.session(this.token,this.abort.signal);this.check(generation);
  const session={...result,apiKey:this.client.apiKey};await this.storage.saveSession(session);this.check(generation);
  this.session=session;this.token=undefined;this.state.connected=true;this.state.username=session.name;this.state.pendingAuthorization=false;this.tracker.reset();
 });}
 async preferences(preferences:LastfmPreferences){
  return this.auth(async generation=>{await this.storage.savePreferences(preferences);this.check(generation);this.tracker.preferencesChanged(this.state,preferences);Object.assign(this.state,preferences);});
 }
 async disconnect():Promise<LastfmState>{
  await this.ready;if(this.disconnectTask){await this.disconnectTask;return this.snapshot();}
  this.generation++;this.abort.abort();this.abort=new AbortController();this.token=undefined;this.session=undefined;this.tracker.reset();
  Object.assign(this.state,{connected:false,username:'',pendingAuthorization:false,busy:true,error:''});this.publish();
  const auth=this.authTask;
  this.disconnectTask=(async()=>{try{await auth?.catch(()=>{});await this.storage.removeSession();}catch{this.state.error=runtimeMessage('runtime120');}finally{this.state.busy=false;this.publish();}})();
  try{await this.disconnectTask;return this.snapshot();}finally{this.disconnectTask=undefined;}
 }
 consume=(snapshot:MusicMetadataSnapshot)=>{
  if(this.closed||!this.session||!this.client)return;
  try{
   const events=this.tracker.observe(snapshot.error?undefined:snapshot.playback,this.state,this.clock.now(),this.clock.epoch());
   for(const event of events){
    // No offline queue and no deferred/retried submissions. Keep bounded in-flight work.
    if(this.requests.size>=2)continue;
    const generation=this.generation,session=this.session,client=this.client;
    const request=client.submit(event.method,{...event.parameters,sk:session.key},this.abort.signal).then(()=>{
     if(generation===this.generation&&!this.closed){this.state.error='';this.publish();}
    }).catch(async error=>{
     if(generation!==this.generation||this.closed)return;
     if(error instanceof LastfmError&&error.code===9){await this.disconnect();if(!this.closed){this.state.error=runtimeMessage('runtime121');this.publish();}}
     else{this.state.error=(error as Error).message;this.publish();}
    }).finally(()=>this.requests.delete(request));
    this.requests.add(request);
   }
  }catch{/* Last.fm must never propagate errors into metadata or playback. */}
 };
 async dispose(){this.closed=true;this.generation++;this.abort.abort();this.tracker.reset();this.session=undefined;this.token=undefined;this.removeAllListeners();await Promise.allSettled([this.ready,this.authTask,this.disconnectTask,...this.requests].filter(Boolean));}
}
