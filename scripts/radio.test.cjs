require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {EventEmitter}=require('node:events');
const {IcyDemux}=require('../src/main/radio/icy.ts');
const {RadioHttpStream}=require('../src/main/radio/http-stream.ts');
const {RadioSource}=require('../src/main/radio/source.ts');
const {RadioService}=require('../src/main/radio/service.ts');
const {AudioEngine}=require('../src/main/audio/audio-engine.ts');
const {wavHeader}=require('../src/main/audio/wav.ts');
const {radioStations}=require('../src/shared/radio.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};}
test('ICY framing survives byte-sized chunks, strips metadata and preserves audio exactly',async()=>{
 const text=Buffer.from("StreamTitle='Artist - Track';StreamUrl='https://example.com/';");
 const metadata=Buffer.alloc(Math.ceil(text.length/16)*16);text.copy(metadata);
 const input=Buffer.concat([Buffer.from('abcd'),Buffer.from([metadata.length/16]),metadata,Buffer.from('efgh'),Buffer.from([0]),Buffer.from('ijkl')]);
 const demux=new IcyDemux(4),audio=[],events=[];
 demux.on('data',chunk=>audio.push(chunk));demux.on('metadata',value=>events.push(value));
 for(const byte of input)demux.write(Buffer.from([byte]));demux.end();
 assert.equal(Buffer.concat(audio).toString(),'abcdefghijkl');assert.equal(events[0].artist,'Artist');assert.equal(events[0].title,'Track');
 const plain=new IcyDemux(0),chunks=[];plain.on('data',chunk=>chunks.push(chunk));plain.end(Buffer.from('no metadata'));
 assert.equal(Buffer.concat(chunks).toString(),'no metadata');
});
test('direct HTTP follows relative redirects without cookies or authorization and cancels an idle connection',async()=>{
 let requests=0;
 const f=await fixture((request,response)=>{
  requests++;assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['icy-metadata'],'1');
  if(request.url==='/redirect'){response.writeHead(302,{Location:'/audio','Set-Cookie':'ignored=1'});response.end();}
  else{response.writeHead(200,{'Content-Type':'audio/mpeg'});response.write('bytes');}
 });
 const stream=new RadioHttpStream();
 try{const response=await stream.open(f.url+'/redirect');assert.equal(response.statusCode,200);assert.equal(requests,2);stream.stop();assert.equal(response.destroyed,true);}
 finally{stream.stop();await f.close();}
 const hanging=await fixture(()=>{}),pending=new RadioHttpStream(10000);
 const opening=pending.open(hanging.url);await tick();pending.stop();await assert.rejects(opening,/radio.cancelled/);await hanging.close();
});
test('bad HTTP status, redirect loop and stalled source are bounded errors',async()=>{
 const f=await fixture((request,response)=>{if(request.url==='/loop'){response.writeHead(302,{Location:'/loop'});response.end();}else{response.writeHead(503);response.end();}});
 for(const route of ['/loop','/bad']){const stream=new RadioHttpStream();try{await assert.rejects(stream.open(f.url+route),/radio\./);}finally{stream.stop();}}
 await f.close();
 const hanging=await fixture(()=>{}),source=new RadioSource(hanging.url,100);
 try{await assert.rejects(source.start());}finally{await source.stop();await hanging.close();}
});
test('FFmpeg radio source feeds the existing AudioEngine, stops sockets and decoder, and reports an interrupted stream',async()=>{
 let clientResponse;
 const f=await fixture((_request,response)=>{
  clientResponse=response;response.writeHead(200,{'Content-Type':'audio/wav'});response.write(wavHeader(0x10000000,{sampleRate:48000,channels:2,bitDepth:16}));
  const pcm=Buffer.alloc(3840);for(let i=0;i<pcm.length;i+=4){pcm.writeInt16LE(1000,i);pcm.writeInt16LE(1000,i+2);}
  const timer=setInterval(()=>response.write(pcm),20);response.on('close',()=>clearInterval(timer));
 });
 const source=new RadioSource(f.url,5000),engine=new AudioEngine(source,{sampleRate:48000,channels:2,bitDepth:16});
 const failure=new Promise(resolve=>source.once('failure',resolve));let streamInfo;
 source.on('stream-info',info=>{if(info.codec)streamInfo=info;});
 try{
  await engine.start();assert.ok(engine.bytes>0);const decoder=source.child;
  for(let i=0;i<30&&!streamInfo;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(streamInfo.codec,'pcm_s16le');assert.equal(streamInfo.sampleRate,48000);assert.equal(streamInfo.bitDepth,16);
  clientResponse.destroy();await failure;await engine.stop();
  assert.ok(decoder.exitCode!==null||decoder.signalCode!==null);assert.equal(source.child,undefined);assert.equal(engine.listenerCount('pcm'),0);
 }finally{await engine.stop();await f.close();}
});

class FakeLive extends EventEmitter{
 constructor(){super();this.state={};this.starts=0;}
 async begin(device,address,rate,input){this.starts++;this.input=input;input.source.onAudioData(()=>{});await input.source.start();this.state={sessionId:'radio-session',active:true};return this.state;}
 async connect(){this.state.playbackReady=true;this.emit('state');}
 async stop(){this.state={active:false};this.emit('state');}
}
class FakeSource extends EventEmitter{
 constructor(block){super();this.block=block;this.stopped=false;}
 onAudioData(callback){this.on('pcm',callback);}
 async start(){if(this.block)await new Promise((resolve,reject)=>{this.reject=reject;});if(this.stopped)throw new Error('radio.cancelled');this.emit('pcm',Buffer.alloc(400));}
 async stop(){this.stopped=true;this.reject?.(new Error('radio.cancelled'));}
 pause(){}resume(){}
}
class FakeOutput extends EventEmitter{
 async start(engine){this.engine=engine;engine.on('pcm',()=>this.emit('playing'));}
 async stop(){this.stopped=true;}
}
test('one radio source at a time; stop cancels startup, station switch cleans old resources, native and network routes share the audio source',async()=>{
 const live=new FakeLive(),sources=[],outputs=[];let prepare=0,blocking=true;
 const service=new RadioService(live,()=>({id:'receiver'}),()=> '127.0.0.1',async()=>{prepare++;},()=>{const output=new FakeOutput();outputs.push(output);return output;},()=>{const source=new FakeSource(blocking);sources.push(source);return source;});
 const first=service.toggle('nashe-radio','');await tick();assert.equal(service.state.status,'connecting');
 const stopped=service.toggle('nashe-radio','');await Promise.all([first,stopped]);assert.equal(service.state.status,'stopped');assert.equal(sources[0].stopped,true);
 blocking=false;
 await service.toggle('nashe-radio','');assert.equal(service.state.status,'playing');
 const secondStation=radioStations[1];
 await service.toggle(secondStation.id,'');assert.equal(service.state.stationId,secondStation.id);assert.equal(sources[1].stopped,true);assert.equal(outputs[1].stopped,true);
 await service.route('receiver');assert.equal(live.starts,1);assert.equal(live.input.title,secondStation.name);assert.equal(service.state.status,'playing');
 await service.music();assert.equal(service.state.mode,'music');assert.equal(service.state.status,'stopped');
 await service.dispose();assert.equal(live.listenerCount('state'),0);assert.ok(sources.every(source=>source.stopped));assert.ok(prepare>=3);
 assert.equal(radioStations.length,160);
 assert.equal(new Set(radioStations.map(station=>station.id)).size,radioStations.length);
});

test('external radio PCM uses the existing LiveSession and FLAC server, with station title and normal cleanup',async()=>{
 const Module=require('node:module'),original=Module._load;let streamRequest,url,title;
 const chunks=[],volumeCalls=[];
 const controller={
  async setUri(value,label){url=value;title=label;},
  async play(){streamRequest=http.get(url,response=>{response.on('data',chunk=>chunks.push(chunk));response.on('error',()=>{});});streamRequest.on('error',()=>{});},
  async stop(){streamRequest?.destroy();},async volume(value){volumeCalls.push(value);return {CurrentVolume:10};},async transport(){return {CurrentTransportState:'PLAYING'};}
 };
 let LiveSession;
 Module._load=function(request,parent,isMain){
  if(request==='../receivers/controller')return {receiverController:()=>controller};
  if(request==='../network/interfaces')return {interfaces:()=>[{address:'127.0.0.1'}]};
  return original.call(this,request,parent,isMain);
 };
 try{({LiveSession}=require('../src/main/audio/live-session.ts'));}finally{Module._load=original;}
 const source=new FakeSource(false);let interval;
 source.start=async()=>{const pcm=Buffer.alloc(3840);pcm.fill(1);source.emit('pcm',pcm);interval=setInterval(()=>source.emit('pcm',pcm),20);};
 source.stop=async()=>{clearInterval(interval);source.stopped=true;};
 const live=new LiveSession(()=> '127.0.0.1');
 try{
  await live.begin({id:'test-radio-receiver',ip:'127.0.0.1',protocol:'dlna',capabilities:['GetVolume','SetVolume'],services:[]},'127.0.0.1',48000,{source,title:'Radio Calico'});
  await live.connect(live.state.sessionId);
  assert.deepEqual(volumeCalls,[undefined]);assert.equal(live.state.volume,10);
  for(let i=0;i<250&&(!live.state.playbackReady||Buffer.concat(chunks).length<4);i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(title,'Radio Calico');assert.equal(Buffer.concat(chunks).subarray(0,4).toString(),'fLaC');
  assert.equal(live.state.playbackReady,true);assert.ok(live.state.pcmBytes>0);assert.throws(()=>live.push(live.state.sessionId,new Uint8Array(4)));
 }finally{await live.stop();streamRequest?.destroy();}
 assert.equal(source.stopped,true);assert.equal(live.state.active,false);assert.equal(live.state.connections,0);
});

test('failed radio startup releases both decoder and output and can be retried from the same button',async()=>{
 const live=new FakeLive(),sources=[],outputs=[];let attempt=0;
 const service=new RadioService(live,()=>undefined,()=>'',async()=>{},()=>{const output=new FakeOutput();outputs.push(output);return output;},()=>{
  const source=new FakeSource(false);sources.push(source);
  if(attempt++===0)source.start=async()=>{throw new Error('radio.connectionError');};
  return source;
 });
 await service.toggle('nashe-radio','');
 assert.equal(service.state.status,'error');assert.equal(service.state.error,'radio.connectionError');
 assert.equal(sources[0].stopped,true);assert.equal(outputs[0].stopped,true);
 await service.toggle('nashe-radio','');assert.equal(service.state.status,'playing');
 await service.dispose();assert.equal(sources[1].stopped,true);assert.equal(outputs[1].stopped,true);
});
