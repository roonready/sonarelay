require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const Module=require('node:module');
const os=require('node:os');
let latestLive,latestPlayer,blockers=new Set(),sequence=0;
class FakeLive extends EventEmitter{
 constructor(){super();latestLive=this;this.state={active:false,sessionId:'test'};this.stopped=false;}
 async begin(){this.state.active=true;this.emit('state');return this.state;}
 async stop(){await new Promise(r=>setTimeout(r,15));this.state.active=false;this.stopped=true;this.emit('state');}
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
 if(request==='electron')return {app:{getPath:()=>os.tmpdir()},ipcMain:ipc,powerSaveBlocker:{start:()=>{const id=++sequence;blockers.add(id);return id;},stop:id=>blockers.delete(id)}};
 if(request==='../audio/live-session')return {LiveSession:FakeLive};
 if(request==='../dlna/player')return {Player:FakePlayer};
 if(request==='../audio/capture-recorder')return {CaptureRecorder:FakeRecorder};
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
