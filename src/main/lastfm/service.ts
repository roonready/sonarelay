import { message as runtimeMessage } from '../../shared/messages';
import { EventEmitter } from 'node:events';
import type { LastfmPreferences, LastfmState, MusicMetadataSnapshot, MusicPlaybackSnapshot } from '../../shared/types';
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
 private durations=new Map<string,number|null>();
 private latestRadio?:MusicPlaybackSnapshot;
 private activeSource?:'music'|'radio';
 private lookup?:{key:string;abort:AbortController;task:Promise<void>};
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
  this.lookup?.abort.abort();this.latestRadio=undefined;this.state.activity=undefined;
  Object.assign(this.state,{connected:false,username:'',pendingAuthorization:false,busy:true,error:''});this.publish();
  const auth=this.authTask;
  this.disconnectTask=(async()=>{try{await auth?.catch(()=>{});await this.storage.removeSession();}catch{this.state.error=runtimeMessage('runtime120');}finally{this.state.busy=false;this.publish();}})();
  try{await this.disconnectTask;return this.snapshot();}finally{this.disconnectTask=undefined;}
 }
 consume=(snapshot:MusicMetadataSnapshot)=>{
  if(this.closed||!this.session||!this.client)return;
  try{
   let playback=snapshot.error?undefined:snapshot.playback;
   const source=snapshot.source??playback?.source??'music';
   if(this.activeSource!==source){this.tracker.reset();this.activeSource=source;}
   const radio=playback?.source==='radio'?playback:undefined;
   this.latestRadio=radio?{...radio}:undefined;
   const key=radio&&radio.artist.trim()&&radio.title.trim()?JSON.stringify([radio.artist.trim(),radio.title.trim()]):'';
   if(this.lookup&&this.lookup.key!==key)this.lookup.abort.abort();
   if(radio&&key){
    if(radio.duration===null&&radio.playing&&this.state.scrobbling&&!this.durations.has(key)){
     this.durations.set(key,null);
     if(this.durations.size>64)this.durations.delete(this.durations.keys().next().value!);
     const abort=new AbortController(),generation=this.generation;
     const task=this.client.duration(radio.artist,radio.title,abort.signal).then(duration=>{
      if(this.closed||generation!==this.generation||abort.signal.aborted)return;
      this.durations.set(key,duration);
      if(this.latestRadio&&JSON.stringify([this.latestRadio.artist.trim(),this.latestRadio.title.trim()])===key)this.consume({...snapshot,playback:{...this.latestRadio}});
     }).catch(()=>{/* Missing catalog data must not interrupt radio or Now Playing. */});
     this.lookup={key,abort,task};
    }
    const duration=this.durations.get(key);
    if(duration)playback={...radio,duration};
   }
   const events=this.tracker.observe(playback,this.state,this.clock.now(),this.clock.epoch());
   for(const event of events){
    // No offline queue and no deferred/retried submissions. Keep bounded in-flight work.
    if(this.requests.size>=2)continue;
    const generation=this.generation,session=this.session,client=this.client;
    const request=client.submit(event.method,{...event.parameters,sk:session.key},this.abort.signal).then(()=>{
     if(generation===this.generation&&!this.closed){this.state.error='';this.state.activity={kind:event.method==='track.scrobble'?'scrobble':'nowPlaying',artist:event.parameters.artist,title:event.parameters.track,at:this.clock.epoch()};this.publish();}
    }).catch(async error=>{
     if(generation!==this.generation||this.closed)return;
     if(error instanceof LastfmError&&error.code===9){await this.disconnect();if(!this.closed){this.state.error=runtimeMessage('runtime121');this.publish();}}
     else{this.state.error=(error as Error).message;this.publish();}
    }).finally(()=>this.requests.delete(request));
    this.requests.add(request);
   }
  }catch{/* Last.fm must never propagate errors into metadata or playback. */}
 };
 async dispose(){this.closed=true;this.generation++;this.abort.abort();this.lookup?.abort.abort();this.tracker.reset();this.session=undefined;this.token=undefined;this.removeAllListeners();await Promise.allSettled([this.ready,this.authTask,this.disconnectTask,this.lookup?.task,...this.requests].filter(Boolean));}
}
