require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LastfmClient}=require('../src/main/lastfm/client.ts');
const {LastfmTracker}=require('../src/main/lastfm/tracker.ts');
const {LastfmService}=require('../src/main/lastfm/service.ts');
const {RadioService}=require('../src/main/radio/service.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settings={scrobbling:true,nowPlaying:true},epoch=1700000000000;
function track(position,extra={}){return {source:'radio',sourceId:'nashe-radio',title:'Track',artist:'Artist',album:'',trackId:'play-1',duration:null,position,playing:true,rate:1,...extra};}
test('radio sends Now Playing immediately and exactly one unknown-duration scrobble after 240 listened seconds',()=>{
 const tracker=new LastfmTracker(),events=[];
 for(let i=0;i<=245;i++)events.push(...tracker.observe(track(i),settings,i*1000,epoch+i*1000));
 const np=events.filter(event=>event.method==='track.updateNowPlaying'),scrobbles=events.filter(event=>event.method==='track.scrobble');
 assert.equal(np.length,1);assert.equal(scrobbles.length,1);
 assert.equal(scrobbles[0].parameters.chosenByUser,'0');assert.equal(scrobbles[0].parameters.timestamp,String(epoch/1000));
 assert.equal(scrobbles[0].parameters.duration,undefined);assert.equal(np[0].parameters.chosenByUser,undefined);
});
test('radio buffering, stop, missing artist and station changes do not accumulate false listening time',()=>{
 const tracker=new LastfmTracker();tracker.observe(track(0),settings,0,epoch);
 for(let i=1;i<=300;i++)assert.ok(!tracker.observe(track(0),settings,i*1000,epoch+i*1000).some(event=>event.method==='track.scrobble'));
 for(let i=301;i<=500;i++)assert.ok(!tracker.observe(track(i,{playing:false}),settings,i*1000,epoch+i*1000).some(event=>event.method==='track.scrobble'));
 assert.deepEqual(tracker.observe(track(501,{artist:''}),settings,501000,epoch+501000),[]);
 const changed=tracker.observe(track(0,{sourceId:'radio-calico',trackId:'play-2'}),settings,502000,epoch+502000);
 assert.equal(changed.filter(event=>event.method==='track.updateNowPlaying').length,1);assert.equal(tracker.current.listened,0);
});
test('Last.fm duration lookup is GET, converts milliseconds and never invents missing catalog durations',async()=>{
 const calls=[];
 const client=new LastfmClient('a'.repeat(32),'b'.repeat(32),async(method,parameters)=>{calls.push({method,parameters});return {track:{duration:'180000'}};});
 assert.equal(await client.duration('Artist','Track'),180);assert.equal(calls[0].method,'GET');assert.equal(calls[0].parameters.method,'track.getInfo');assert.equal(calls[0].parameters.autocorrect,'0');
 for(const value of [undefined,0,'invalid',-1,Number.POSITIVE_INFINITY]){
  const unknown=new LastfmClient('a'.repeat(32),'b'.repeat(32),async()=>({track:{duration:value}}));assert.equal(await unknown.duration('Artist','Track'),null);
 }
});
class Source extends EventEmitter{
 onAudioData(callback){this.on('pcm',callback);}
 async start(){this.emit('metadata',{artist:'Artist',title:'Track',streamTitle:'Artist - Track'});this.emit('pcm',Buffer.alloc(400));}
 async stop(){this.removeAllListeners();}
 pause(){}resume(){}
}
class Output extends EventEmitter{
 async start(engine){engine.once('pcm',()=>this.emit('playing'));}
 async stop(){}
}
test('actual radio playback snapshots reach Last.fm through PCM progress; catalog duration enables a normal short-song scrobble',async()=>{
 let now=0;const calls=[],sources=[];
 const client=new LastfmClient('a'.repeat(32),'b'.repeat(32),async(method,parameters)=>{
  calls.push({method,parameters});
  if(parameters.method==='track.getInfo')return {track:{duration:'120000'}};
  return parameters.method==='track.scrobble'?{scrobbles:{'@attr':{accepted:'1'}}}:{nowplaying:{ignoredMessage:{code:'0'}}};
 });
 const storage={preferences:async()=>settings,loadSession:async()=>({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)}),removeSession:async()=>{}};
 const lastfm=new LastfmService(storage,client,async()=>{}, {now:()=>now,epoch:()=>epoch+now});await lastfm.ready;
 const live=new EventEmitter();live.state={};live.stop=async()=>{};
 const radio=new RadioService(live,()=>undefined,()=>'',async()=>{},()=>new Output(),()=>{const source=new Source();sources.push(source);return source;},{now:()=>now});
 radio.on('playback',playback=>lastfm.consume({fields:[],artwork:null,updatedAt:epoch+now,error:'',playback}));
 try{
  await radio.toggle('nashe-radio','');await tick();
  assert.equal(calls.filter(call=>call.parameters.method==='track.updateNowPlaying').length,1);
  assert.equal(lastfm.state.activity.kind,'nowPlaying');
  for(let second=1;second<=60;second++){
   now=second*1000;
   for(let i=0;i<4;i++)sources[0].emit('pcm',Buffer.alloc(48000));
   radio.publishPlayback();await tick();
  }
  const submitted=calls.filter(call=>call.parameters.method==='track.scrobble');assert.equal(submitted.length,1);assert.equal(submitted[0].parameters.duration,'120');
  assert.equal(lastfm.state.activity.kind,'scrobble');
  await radio.stop();now+=1000;radio.publishPlayback();await tick();
  assert.equal(calls.filter(call=>call.parameters.method==='track.scrobble').length,1);
  await radio.toggle('radio-calico','');await tick();
  assert.equal(calls.filter(call=>call.parameters.method==='track.updateNowPlaying').length,2);
 }finally{await radio.dispose();await lastfm.dispose();}
});
test('late duration lookup cannot resurrect radio after switching to Yandex Music',async()=>{
 let resolveInfo;const submissions=[];
 const client=new LastfmClient('a'.repeat(32),'b'.repeat(32),async(_method,parameters)=>{
  if(parameters.method==='track.getInfo')return new Promise(resolve=>{resolveInfo=resolve;});
  submissions.push(parameters);return {nowplaying:{ignoredMessage:{code:'0'}}};
 });
 const storage={preferences:async()=>settings,loadSession:async()=>({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)})};
 const service=new LastfmService(storage,client,async()=>{});await service.ready;
 service.consume({fields:[],artwork:null,updatedAt:0,error:'',playback:track(0)});await tick();
 service.consume({fields:[],artwork:null,updatedAt:1,error:'',playback:track(null,{source:'music',sourceId:undefined,title:'Music track',trackId:'music'})});await tick();
 resolveInfo({track:{duration:180000}});await tick();
 assert.equal(submissions.length,2);assert.equal(service.state.activity.title,'Music track');await service.dispose();
});

test('switching through radio without track metadata does not suppress Now Playing when returning to the same music track',async()=>{
 const submitted=[];
 const client=new LastfmClient('a'.repeat(32),'b'.repeat(32),async(_method,parameters)=>{submitted.push(parameters);return {nowplaying:{ignoredMessage:{code:'0'}}};});
 const storage={preferences:async()=>settings,loadSession:async()=>({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)})};
 const service=new LastfmService(storage,client,async()=>{});await service.ready;
 const music={fields:[],artwork:null,updatedAt:0,error:'',playback:track(null,{source:'music',sourceId:undefined})};
 service.consume(music);await tick();
 service.consume({source:'radio',fields:[],artwork:null,updatedAt:1,error:''});
 service.consume(music);await tick();
 assert.equal(submitted.length,2);await service.dispose();
});
