require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const Module=require('node:module');
const {castAdvertisements}=require('../src/main/cast/discovery.ts');
const {CastLink:RealLink}=require('../src/main/cast/link.ts');
let latest;
class FakeLink{
 constructor(){latest=this;this.isConnected=false;this.calls=[];
  const player=new EventEmitter();player.session={sessionId:'owned'};player.media={currentSession:null};
  player.load=(media,options,cb)=>{this.loaded={media,options};cb(null,{mediaSessionId:42,playerState:'PLAYING'});};
  player.pause=cb=>{this.calls.push('PAUSE');cb(null,{});};
  player.stop=cb=>{this.calls.push('STOP');cb(null,{});};
  player.getStatus=cb=>cb(null,{playerState:'PLAYING',currentTime:4});
  this.client={launch:(_app,cb)=>{this.calls.push('LAUNCH');cb(null,player);},getVolume:cb=>cb(null,{level:.13}),setVolume:(value,cb)=>{this.changedVolume=value;cb(null,value);}};
 }
 async open(ip,port,address){this.target={ip,port,address};this.isConnected=true;}
 call(_label,invoke){return new Promise((resolve,reject)=>invoke((error,value)=>error?reject(error):resolve(value)));}
 close(){this.isConnected=false;this.closed=true;}
}
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(request==='./link'&&parent?.filename.endsWith('cast\\controller.ts'))return {CastLink:FakeLink,castLibrary:()=>({DefaultMediaReceiver:{APP_ID:'CC1AD845'}})};
 return originalLoad.call(this,request,parent,isMain);
};
let CastController,castMedia;
try{({CastController,castMedia}=require('../src/main/cast/controller.ts'));}finally{Module._load=originalLoad;}
test('Cast mDNS combines SRV TXT and A, rejects VPN addresses',()=>{
 const records=[{type:'SRV',name:'TV._googlecast._tcp.local',data:{target:'tv.local',port:8009}},{type:'TXT',name:'TV._googlecast._tcp.local',data:[Buffer.from('fn=Living room'),Buffer.from('md=Chromecast'),Buffer.from('id=abc')]},{type:'A',name:'tv.local',data:'192.168.1.2'}];
 assert.deepEqual(castAdvertisements(records,'192.168.1.14','255.255.255.0'),[{ip:'192.168.1.2',port:8009,name:'Living room',model:'Chromecast',id:'abc'}]);
 records[2].data='10.8.1.2';assert.deepEqual(castAdvertisements(records,'192.168.1.14','255.255.255.0'),[]);
});
test('Cast media distinguishes a live stream from a finite WAV without invented duration',()=>{
 assert.equal(castMedia('http://x/a.mp3','Live',undefined,'audio/mpeg').streamType,'LIVE');
 const file=castMedia('http://x/a.wav','Test',100,'audio/wav');assert.equal(file.streamType,'BUFFERED');assert.equal(file.duration,undefined);
});
test('Cast loads owned media, converts volume and closes its connection on stop',async()=>{
 const controller=new CastController({ip:'192.168.1.2',apiPort:8009},'192.168.1.14');
 await controller.stop();
 await controller.setUri('http://192.168.1.14:1234/token.mp3','Live',undefined,'audio/mpeg');
 await controller.play();assert.deepEqual(latest.target,{ip:'192.168.1.2',port:8009,address:'192.168.1.14'});
 assert.equal(latest.loaded.media.streamType,'LIVE');assert.equal(latest.loaded.media.contentType,'audio/mpeg');assert.equal(latest.loaded.options.autoplay,true);
 assert.equal((await controller.transport()).CurrentTransportState,'PLAYING');assert.equal((await controller.volume()).CurrentVolume,13);
 await controller.volume(33);assert.deepEqual(latest.changedVolume,{level:.33});
 await controller.pause();await controller.stop();assert.ok(latest.calls.includes('STOP'));assert.equal(latest.closed,true);
 await assert.rejects(controller.setUri('https://example.com/a.mp3','Other'),/локальный media server/);
});
test('Cast commands have a deadline and a closed link rejects new requests',async()=>{
 const link=new RealLink();await assert.rejects(link.call('test',()=>{},30),/тайм-аут/);
 await assert.rejects(link.call('test',()=>{},30),/закрыто/);
});
test('cold Cast serializer is ready synchronously before any I/O callback',()=>{
 const {spawnSync}=require('node:child_process');
 const code=`
  const assert=require('node:assert/strict'),path=require('node:path');
  const proto=require(path.join(path.dirname(require.resolve('castv2')),'lib/proto.js'));
  const payload={protocolVersion:0,sourceId:'sender-0',destinationId:'receiver-0',namespace:'urn:x-cast:com.google.cast.receiver',payloadType:0,payloadUtf8:'{"type":"GET_STATUS"}'};
  const decoded=proto.CastMessage.parse(proto.CastMessage.serialize(payload));
  assert.equal(decoded.payloadUtf8,payload.payloadUtf8);assert.equal(decoded.sourceId,'sender-0');
 `;
 const result=spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);
});

const {CastPlaybackReadiness}=require('../src/main/cast/playback-readiness.ts');
test('Cast confirms the first media-clock progress without a two-second delay',()=>{
 const readiness=new CastPlaybackReadiness();const status=(time,state='PLAYING',id=42)=>({playerState:state,currentTime:time,mediaSessionId:id});
 assert.equal(readiness.observe(status(0)),false);assert.equal(readiness.observe(status(0)),false);
 assert.equal(readiness.observe(status(.5)),true);assert.equal(readiness.observe(status(1.5)),true);
 assert.equal(readiness.observe(status(1.5,'BUFFERING')),false);
 assert.equal(readiness.observe(status(1.5)),false);assert.equal(readiness.observe(status(2.5)),true);assert.equal(readiness.observe(status(3.5)),true);
 assert.equal(readiness.observe(status(4.5,'PLAYING',99)),false);readiness.reset();assert.equal(readiness.observe(status(5.5)),false);
});
test('Cast missing time, frozen time and seeks cannot prematurely confirm audio startup',()=>{
 const readiness=new CastPlaybackReadiness();
 assert.equal(readiness.observe({playerState:'PLAYING'}),false);
 const sample=time=>readiness.observe({playerState:'PLAYING',currentTime:time});
 assert.equal(sample(10),false);assert.equal(sample(10),false);assert.equal(sample(25),false);assert.equal(sample(26),true);
 assert.equal(sample(NaN),false);
});
