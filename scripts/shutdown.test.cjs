require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const Module=require('node:module');
const os=require('node:os');
let latestLive,latestPlayer,latestWindowsVolume,blockers=new Set(),sequence=0,standbyVolumeCalls=[];
class FakeWindowsVolume{
 constructor(){latestWindowsVolume=this;this.calls=[];this.disposed=false;}
 async request(value){this.calls.push(value);return {volume:value??40,muted:false};}
 async dispose(){this.disposed=true;}
}
class FakeLive extends EventEmitter{
 constructor(){super();latestLive=this;this.state={active:false,sessionId:'test'};this.stopped=false;}
 async begin(){this.state.active=true;this.emit('state');return this.state;}
 async stop(){await new Promise(r=>setTimeout(r,15));this.state.active=false;this.stopped=true;this.emit('state');}
 async volume(value){this.volumeCalls=(this.volumeCalls??0)+1;return value??23;}
}
class FakePlayer{
 constructor(){latestPlayer=this;this.disposed=false;this.commands=0;}
 async dispose(){await new Promise(r=>setTimeout(r,15));this.disposed=true;}
 async command(){this.commands++;await new Promise(r=>setTimeout(r,30));return {};}
}
class FakeRecorder{dispose(){}}
const ipc=new EventEmitter(),handlers=new Map();
ipc.handle=(channel,handler)=>handlers.set(channel,handler);ipc.removeHandler=channel=>handlers.delete(channel);
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(request==='electron')return {app:{getPath:()=>os.tmpdir(),getAppPath:()=>require('node:path').resolve(__dirname,'..')},ipcMain:ipc,powerSaveBlocker:{start:()=>{const id=++sequence;blockers.add(id);return id;},stop:id=>blockers.delete(id)}};
 if(request==='../audio/live-session')return {LiveSession:FakeLive};
 if(request==='../dlna/player')return {Player:FakePlayer};
 if(request==='../audio/capture-recorder')return {CaptureRecorder:FakeRecorder};
 if(request==='../runtime/windows-volume')return {WindowsVolume:FakeWindowsVolume};
 if(request==='../receivers/volume')return {receiverVolume:async(device,_devices,_address,value)=>{standbyVolumeCalls.push({id:device.id,value});return value??31;}};
 return originalLoad.call(this,request,parent,isMain);
};
let registerHandlers;
try{({registerHandlers}=require('../src/main/ipc/handlers.ts'));}finally{Module._load=originalLoad;}
function fixture(){
 let destroyed=false;
 const contents=new EventEmitter();contents.isDestroyed=()=>destroyed;contents.send=()=>{if(destroyed)throw new Error('Object has been destroyed');};
 const window={get webContents(){if(destroyed)throw new Error('Object has been destroyed');return contents;},isDestroyed:()=>destroyed};
 const discovery=new EventEmitter();discovery.state={selectedAddress:'127.0.0.1',devices:[{id:'device'}]};
 const cleanup=registerHandlers(window,discovery);
 return {contents,discovery,cleanup,destroy:()=>{destroyed=true;}};
}
test('cleanup after native window destruction safely stops active playback and is idempotent',async()=>{
 const f=fixture();await latestLive.begin();assert.equal(blockers.size,1);
 f.destroy();assert.doesNotThrow(()=>f.discovery.emit('state'));assert.doesNotThrow(()=>latestLive.emit('state'));
 const first=f.cleanup(),second=f.cleanup();assert.equal(first,second);await first;
 assert.equal(latestLive.stopped,true);assert.equal(latestPlayer.disposed,true);assert.equal(blockers.size,0);
 assert.equal(handlers.size,0);assert.equal(f.contents.listenerCount('did-start-loading'),0);assert.equal(f.discovery.listenerCount('state'),0);
});
test('shutdown waits for an accepted command before disposing its resulting playback',async()=>{
 const f=fixture();
 const operation=handlers.get('playback:command')({sender:f.contents},'device','test');
 await new Promise(r=>setImmediate(r));assert.equal(latestPlayer.commands,1);
 f.destroy();const cleanup=f.cleanup();assert.equal(latestPlayer.disposed,false);
 await operation;await cleanup;assert.equal(latestPlayer.disposed,true);assert.equal(handlers.size,0);
});

test('volume IPC works before playback and never starts or stops another receiver',async()=>{
 const f=fixture();standbyVolumeCalls=[];
 try{
  const handler=handlers.get('receiver:volume'),event={sender:f.contents};
  assert.deepEqual(await handler(event,'device'),{deviceId:'device',volume:31});
  assert.deepEqual(await handler(event,'device',5),{deviceId:'device',volume:5});
  assert.equal(latestLive.state.active,false);assert.equal(latestLive.stopped,false);assert.equal(latestPlayer.commands,0);
  latestLive.state.active=true;latestLive.state.deviceId='other';
  await handler(event,'device',7);assert.equal(latestLive.state.active,true);assert.equal(latestLive.stopped,false);
  latestLive.state.deviceId='device';
  assert.deepEqual(await handler(event,'device'),{deviceId:'device',volume:23});assert.equal(latestLive.volumeCalls,1);
  assert.equal(standbyVolumeCalls.length,3);
  await assert.rejects(handler(event,'device',101),/invalid/);
  await assert.rejects(handler(event,'missing'));
  assert.throws(()=>handler({sender:{}},'device'));
  assert.equal(standbyVolumeCalls.length,3);
 }finally{await f.cleanup();}
});

test('Windows master-volume IPC requires a trusted sender and a valid level',async()=>{
 const f=fixture(),helper=latestWindowsVolume;
 try{
  const handler=handlers.get('windows:volume'),event={sender:f.contents};
  assert.deepEqual(await handler(event),{volume:40,muted:false});
  assert.deepEqual(await handler(event,10),{volume:10,muted:false});
  for(const value of [null,'10',-1,101,NaN,Infinity])await assert.rejects(handler(event,value),/invalid/);
  assert.throws(()=>handler({sender:{}},10));
  assert.deepEqual(helper.calls,[undefined,10]);assert.equal(latestPlayer.commands,0);assert.equal(latestLive.state.active,false);
 }finally{await f.cleanup();}
 assert.equal(helper.disposed,true);
});
