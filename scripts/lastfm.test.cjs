require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LastfmClient,LastfmError,lastfmSignature,lastfmResponseShape}=require('../src/main/lastfm/client.ts');
const {LastfmStorage}=require('../src/main/lastfm/storage.ts');
const {LastfmTracker}=require('../src/main/lastfm/tracker.ts');
const {startLastfmBrowserProxy}=require('../src/main/lastfm/browser-proxy.ts');
const {parseProxyInput,formatSavedProxy}=require('../src/shared/proxy-format.ts');
const {LastfmService}=require('../src/main/lastfm/service.ts');
const settings={scrobbling:true,nowPlaying:true},epoch=1700000000000;
function track(position,extra={}){return {title:'Song',artist:'Artist',album:'Album',trackId:'123',duration:100,position,playing:true,rate:1,...extra};}
function collect(tracker,seconds,extra={}){const events=[];for(let i=0;i<=seconds;i++)events.push(...tracker.observe(track(i,extra),settings,i*1000,epoch+i*1000));return events;}
const tick=()=>new Promise(r=>setImmediate(r));
test('proxy input accepts the provider format and hides the saved password',()=>{
 assert.deepEqual(parseProxyInput('proxy.example:9195:user:one:two'),{
  server:'http://proxy.example:9195',username:'user',password:'one:two'
 });
 assert.deepEqual(parseProxyInput('socks5://[::1]:1080'),{
  server:'socks5://[::1]:1080',username:'',password:''
 });
 const saved=formatSavedProxy({server:'https://proxy.example',username:'user',hasPassword:true,loadError:false});
 assert.equal(saved,'https://proxy.example:443:user');
 assert.deepEqual(parseProxyInput(saved),{server:'https://proxy.example:443',username:'user',password:''});
 assert.deepEqual(parseProxyInput(''),{server:'',username:'',password:''});
 assert.throws(()=>parseProxyInput('proxy.example:99999:user:pass'),/Invalid proxy port/);
});
test('Last.fm browser proxy tunnels external HTTPS domains with saved authentication',async()=>{
 const http=require('node:http');
 const upstream=http.createServer();
 const requests=[];
 upstream.on('connect',(request,socket)=>{
  requests.push([request.url,request.headers['proxy-authorization']]);
  socket.end('HTTP/1.1 200 Connection Established\r\n\r\n');
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 let proxy;
 try{
  proxy=await startLastfmBrowserProxy({server:'http://127.0.0.1:'+upstream.address().port,username:'user',password:'test'});
  const connect=target=>new Promise((resolve,reject)=>{
   const request=http.request(proxy.server,{method:'CONNECT',path:target,agent:false});
   request.once('connect',(response,socket)=>{socket.destroy();resolve(response.statusCode);});
   request.once('error',reject);
   request.setTimeout(2000,()=>request.destroy(new Error('Proxy test timed out')));
   request.end();
  });
  assert.equal(await connect('cdn.example.com:443'),200);
  assert.equal(await connect('cdn.example.com:80'),403);
  assert.deepEqual(requests,[['cdn.example.com:443','Basic '+Buffer.from('user:test').toString('base64')]]);
 }finally{
  proxy?.close();
  await new Promise(resolve=>upstream.close(resolve));
 }
});
function mockStorage(){let saved,removed=0,prefs={...settings};return {get saved(){return saved;},get removed(){return removed;},preferences:async()=>prefs,loadSession:async()=>saved,saveSession:async value=>{saved=value;},removeSession:async()=>{saved=undefined;removed++;},savePreferences:async value=>{prefs=value;}};}
function mockClient(handler){const calls=[];const client=new LastfmClient('a'.repeat(32),'b'.repeat(32),async(method,parameters)=>{calls.push({method,parameters});if(handler)return handler(method,parameters);if(parameters.method==='auth.getToken')return {token:'t'.repeat(32)};if(parameters.method==='auth.getSession')return {session:{key:'k'.repeat(32),name:'Listener'}};return parameters.method==='track.scrobble'?{scrobbles:{'@attr':{accepted:1}}}:{nowplaying:{ignoredMessage:{code:'0'}}};});return {client,calls};}
test('Last.fm signature uses sorted UTF-8 raw parameters, excludes format/callback and puts writes in POST',async()=>{
 const params={track:'Песня & test',artist:'Исполнитель',method:'track.scrobble',api_key:'a',format:'json',callback:'ignore'};
 const expected=crypto.createHash('md5').update('api_keyaartistИсполнительmethodtrack.scrobbletrackПесня & testsecret').digest('hex');assert.equal(lastfmSignature(params,'secret'),expected);
 const {client,calls}=mockClient();await client.token();await client.session('t'.repeat(32));await client.submit('track.scrobble',{artist:'A',track:'T',sk:'session',timestamp:'1700000000'});
 assert.deepEqual(calls.map(c=>c.parameters.method),['auth.getToken','auth.getSession','track.scrobble']);assert.deepEqual(calls.map(c=>c.method),['GET','GET','POST']);assert.ok(calls.every(c=>!Object.values(c.parameters).includes('b'.repeat(32))));
});
test('ignored Last.fm responses are errors rather than false success',async()=>{
 const {client}=mockClient(()=>({scrobbles:{'@attr':{accepted:0}},nowplaying:{ignoredMessage:{code:'1'}}}));
 await assert.rejects(client.submit('track.scrobble',{}),/не принят/);await assert.rejects(client.submit('track.updateNowPlaying',{}),/не принят/);
});

test('authorization diagnostics describe malformed responses without exposing credentials or token values',()=>{
 const token='secret-token-value',apiKey='private-api-key',secret='private-shared-secret';
 const summary=lastfmResponseShape({token,apiKey,secret});
 assert.deepEqual(summary,{responseType:'object',hasToken:true,tokenType:'string',tokenLength:token.length});
 for(const value of [token,apiKey,secret])assert.ok(!JSON.stringify(summary).includes(value));
 assert.equal(lastfmResponseShape({token:123}).tokenType,'number');
 assert.equal(lastfmResponseShape({}).hasToken,false);
 assert.equal(lastfmResponseShape(null).responseType,'null');
});
test('one Now Playing and one scrobble after half duration; timestamp is first observed listening',()=>{
 const tracker=new LastfmTracker();const first=collect(tracker,49);assert.equal(first.filter(e=>e.method==='track.updateNowPlaying').length,1);assert.ok(!first.some(e=>e.method==='track.scrobble'));
 const events=tracker.observe(track(50),settings,50000,epoch+50000);assert.equal(events.length,1);assert.equal(events[0].method,'track.scrobble');assert.equal(events[0].parameters.timestamp,'1700000000');
 assert.deepEqual(tracker.observe(track(51),settings,51000,epoch+51000),[]);
});
test('Last.fm skips tracks <=30 seconds and scrobbles long or unknown tracks at 120 seconds',()=>{
 for(const duration of [20,30])assert.ok(!collect(new LastfmTracker(),120,{duration}).some(e=>e.method==='track.scrobble'));
 for(const duration of [1000,null,0]){
  const tracker=new LastfmTracker();
  assert.ok(!collect(tracker,119,{duration}).some(e=>e.method==='track.scrobble'));
  const [submission]=tracker.observe(track(120,{duration}),settings,120000,epoch+120000);
  assert.equal(submission.method,'track.scrobble');
  assert.equal(submission.parameters.duration,duration===1000?'1000':undefined);
 }
});
test('Now Playing and scrobbles include valid GSMTC album artist and track number',()=>{
 const events=collect(new LastfmTracker(),50,{albumArtist:' Various Artists ',trackNumber:4});
 assert.deepEqual(events.map(event=>[event.method,event.parameters.albumArtist,event.parameters.trackNumber]),[
  ['track.updateNowPlaying','Various Artists','4'],['track.scrobble','Various Artists','4']
 ]);
 for(const extra of [{},{albumArtist:' ',trackNumber:0},{trackNumber:1.5}]){
  for(const event of collect(new LastfmTracker(),50,extra)){
   assert.equal('albumArtist' in event.parameters,false);
   assert.equal('trackNumber' in event.parameters,false);
  }
 }
});
test('pauses, frozen playback, seeks and long metadata gaps do not earn listening time',()=>{
 const tracker=new LastfmTracker();collect(tracker,10);
 for(let t=11;t<70;t++)tracker.observe(track(10,{playing:false}),settings,t*1000,epoch+t*1000);
 tracker.observe(track(95),settings,70000,epoch+70000);tracker.observe(track(96),settings,71000,epoch+71000);
 tracker.observe(track(96),settings,72000,epoch+72000);tracker.observe(track(99),settings,90000,epoch+90000);
 assert.equal(tracker.listening.current.listened,11);assert.equal(tracker.listening.current.submitted,false);
});
test('replaying the same track starts fresh and late track ID does not duplicate Now Playing',()=>{
 const tracker=new LastfmTracker();const events=collect(tracker,60);assert.equal(events.filter(e=>e.method==='track.scrobble').length,1);
 tracker.observe(track(0),settings,61000,epoch+61000);assert.equal(tracker.listening.current.listened,0);
 assert.equal(tracker.observe(track(1),settings,62000,epoch+62000)[0].method,'track.updateNowPlaying');
 const late=new LastfmTracker();late.observe(track(0,{trackId:''}),settings,0,epoch);late.observe(track(1,{trackId:''}),settings,1000,epoch+1000);
 assert.deepEqual(late.observe(track(2),settings,2000,epoch+2000),[]);
});
test('disabled features submit nothing, and paused initial metadata does not backdate playback',()=>{
 const tracker=new LastfmTracker();for(let i=0;i<100;i++)assert.deepEqual(tracker.observe(track(i),{scrobbling:false,nowPlaying:false},i*1000,epoch+i*1000),[]);
 tracker.reset();tracker.observe(track(0,{playing:false}),settings,0,epoch);tracker.observe(track(0),settings,60000,epoch+60000);assert.equal(tracker.listening.current.startedAt,1700000060);
});
test('desktop auth requires explicit browser confirmation, publishes no secrets, restores and disconnects session',async()=>{
 const store=mockStorage(),{client,calls}=mockClient(),urls=[];const service=new LastfmService(store,client,async url=>urls.push(url));await service.ready;
 await service.connect();assert.equal(service.state.pendingAuthorization,true);assert.equal(service.state.connected,false);assert.equal(calls.length,1);
 const url=new URL(urls[0]);assert.equal(url.origin,'https://www.last.fm');assert.equal(url.pathname,'/api/auth/');assert.equal(url.searchParams.has('cb'),false);
 await service.confirm();assert.equal(service.state.username,'Listener');assert.equal(service.state.connected,true);assert.ok(store.saved.key);
 const publicState=JSON.stringify(service.snapshot());assert.ok(!publicState.includes('k'.repeat(32)));assert.ok(!publicState.includes('t'.repeat(32)));
 await service.dispose();const restored=new LastfmService(store,client,async()=>{});await restored.ready;assert.equal(restored.state.username,'Listener');await restored.disconnect();assert.equal(store.saved,undefined);assert.equal(restored.state.connected,false);await restored.dispose();
});
test('disconnect cancels a pending session exchange and a late result cannot restore login',async()=>{
 const store=mockStorage();let resolveSession;const {client}=mockClient((_method,p)=>p.method==='auth.getToken'?{token:'t'.repeat(32)}:new Promise(r=>resolveSession=r));
 const service=new LastfmService(store,client,async()=>{});await service.ready;await service.connect();const confirm=service.confirm();await tick();const disconnected=service.disconnect();resolveSession({session:{key:'k'.repeat(32),name:'Late'}});await assert.rejects(confirm,/отменено/);await disconnected;
 assert.equal(store.saved,undefined);assert.equal(service.state.connected,false);await service.dispose();
});
test('Last.fm outage has no retry queue and does not throw into metadata or playback',async()=>{
 const store=mockStorage();await store.saveSession({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)});
 const {client,calls}=mockClient(()=>{throw new Error('network down');});const service=new LastfmService(store,client,async()=>{});await service.ready;
 service.consume({playback:track(0),error:''});service.consume({playback:track(1),error:''}); // real wall time is tiny: send on progress, never count a seek.
 await tick();const count=calls.length;for(let i=0;i<5;i++)service.consume({playback:track(1),error:''});await tick();assert.equal(calls.length,count);assert.equal(count,1);assert.equal(service.state.error,'network down');await service.dispose();
});
test('safe storage is mandatory and only ciphertext is written; disconnect removes it',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sonarelay-lastfm-'));const secret='private-session-key';let encrypted=false,decrypted=false;
 const protector={available:async()=>true,encrypt:async text=>{encrypted=true;return Buffer.from([...Buffer.from(text)].map(n=>n^0xaa));},decrypt:async bytes=>{decrypted=true;return Buffer.from([...bytes].map(n=>n^0xaa)).toString();}};
 try{const storage=new LastfmStorage(directory,protector),value={key:secret,name:'User',apiKey:'a'.repeat(32)};await storage.saveSession(value);const raw=await fs.readFile(path.join(directory,'lastfm-session.bin'));assert.ok(!raw.includes(Buffer.from(secret)));assert.deepEqual(await storage.loadSession(),value);assert.ok(encrypted&&decrypted);
 await storage.savePreferences({scrobbling:false,nowPlaying:true});assert.deepEqual(await storage.preferences(),{scrobbling:false,nowPlaying:true});await storage.removeSession();assert.equal(await storage.loadSession(),undefined);
 const denied=new LastfmStorage(directory,{...protector,available:async()=>false});await assert.rejects(denied.saveSession(value),/хранилище/);assert.ok(!(await fs.readdir(directory)).includes('lastfm-session.bin'));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('Now Playing can use playback metadata without position, but scrobbles require observed time',()=>{
 const tracker=new LastfmTracker();const first=tracker.observe(track(null),settings,0,epoch);assert.equal(first[0].method,'track.updateNowPlaying');
 for(let i=1;i<300;i++)assert.deepEqual(tracker.observe(track(null),settings,i*1000,epoch+i*1000),[]);
});
test('unknown duration and position can scrobble after 120 seconds of playing samples',()=>{
 const tracker=new LastfmTracker();
 const observe=(second,playing=true)=>tracker.observe(track(null,{duration:null,playing}),settings,second*1000,epoch+second*1000);
 for(let second=0;second<=60;second++)assert.ok(!observe(second).some(event=>event.method==='track.scrobble'));
 observe(61,false);observe(80,false);observe(81);
 for(let second=82;second<=140;second++)assert.deepEqual(observe(second),[]);
 assert.deepEqual(observe(151),[]);
 const [submission]=observe(152);
 assert.equal(submission.method,'track.scrobble');
 assert.equal(submission.parameters.duration,undefined);
 assert.deepEqual(observe(153),[]);
});
test('metadata samples automatically produce authenticated Now Playing and scrobble independently of receiver protocol',async()=>{
 const store=mockStorage();await store.saveSession({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)});const {client,calls}=mockClient();let now=0;
 const service=new LastfmService(store,client,async()=>{},{now:()=>now,epoch:()=>epoch+now});await service.ready;
 for(let i=0;i<=50;i++){now=i*1000;service.consume({playback:track(i),error:''});await tick();}
 assert.deepEqual(calls.map(c=>c.parameters.method),['track.updateNowPlaying','track.scrobble']);assert.equal(calls[1].parameters.timestamp,'1700000000');assert.equal(calls[1].parameters.sk,'k'.repeat(32));
 await service.preferences({scrobbling:false,nowPlaying:false});now+=1000;service.consume({playback:track(0,{title:'Other'}),error:''});now+=1000;service.consume({playback:track(1,{title:'Other'}),error:''});await tick();assert.equal(calls.length,2);
 await service.disconnect();now+=1000;service.consume({playback:track(2),error:''});assert.equal(calls.length,2);await service.dispose();
});
test('revoked sessions disconnect without leaking API credentials or stopping playback metadata',async()=>{
 const store=mockStorage();await store.saveSession({key:'k'.repeat(32),name:'Listener',apiKey:'a'.repeat(32)});const {client}=mockClient(()=>{throw new LastfmError(9,'Last.fm: ошибка API 9');});
 const service=new LastfmService(store,client,async()=>{});await service.ready;service.consume({playback:track(null),error:''});await tick();await tick();assert.equal(service.state.connected,false);assert.equal(store.saved,undefined);assert.match(service.state.error,/отозвана/);await service.dispose();
});

test('Now Playing toggle preserves scrobble listening time; re-enabling scrobbling never duplicates an accepted play',()=>{
 const tracker=new LastfmTracker();collect(tracker,49);tracker.preferencesChanged(settings,{...settings,nowPlaying:false});assert.equal(tracker.listening.current.listened,49);
 const events=tracker.observe(track(50),{...settings,nowPlaying:false},50000,epoch+50000);assert.equal(events[0].method,'track.scrobble');
 tracker.preferencesChanged(settings,{scrobbling:false,nowPlaying:true});tracker.preferencesChanged({scrobbling:false,nowPlaying:true},settings);
 for(let i=51;i<110;i++)assert.ok(!tracker.observe(track(i),settings,i*1000,epoch+i*1000).some(e=>e.method==='track.scrobble'));
});
