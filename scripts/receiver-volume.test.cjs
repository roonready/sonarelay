require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {receiverVolume,readVolume}=require('../src/main/receivers/volume.ts');
const device=(protocol='dlna',id='speaker',ip='192.168.1.21')=>({id,ip,protocol,services:[],capabilities:['GetVolume','SetVolume']});

test('standby receiver volume reads and writes without any playback or transport commands',async()=>{
 for(const protocol of ['dlna','bluos','cast']){
  const calls=[];let actual=81;
  const controller={async volume(value){calls.push(value===undefined?'read':value);if(value!==undefined){actual=value;return {};}return {CurrentVolume:String(actual)};},async stop(){assert.equal(protocol,'cast');calls.push('close');}};
  const factory=()=>new Proxy(controller,{get(target,key){if(!(key in target))throw Error('Unexpected media command: '+String(key));return target[key];}});
  const speaker=device(protocol);
  assert.equal(await receiverVolume(speaker,[speaker],'192.168.1.14',undefined,factory),81);
  assert.equal(await receiverVolume(speaker,[speaker],'192.168.1.14',7,factory),7);
  assert.deepEqual(calls,protocol==='cast'?['read','close',7,'read','close']:['read',7,'read']);
 }
});

test('AirPlay before playback uses only a matching physical receiver control API',async()=>{
 const airplay=device('airplay2'),other=device('dlna','wrong','192.168.1.99'),dlna=device('dlna','same');let target;
 const factory=d=>{target=d.id;return {volume:async()=>({CurrentVolume:19})};};
 assert.equal(await receiverVolume(airplay,[other,airplay,dlna],'192.168.1.14',undefined,factory),19);assert.equal(target,'same');
 await assert.rejects(receiverVolume(airplay,[other,airplay],'192.168.1.14',undefined,()=>{throw Error('Must not open AirPlay');}),/beforePlaybackUnavailable/);
});

test('unknown and invalid volume is never represented as a confirmed zero',async()=>{
 for(const raw of [null,undefined,'',' ',true,NaN,Infinity,-1,101,'invalid'])assert.throws(()=>readVolume(raw),/unavailable/);
 assert.equal(readVolume('0'),0);assert.equal(readVolume(100),100);
 const speaker=device();
 for(const value of [-1,101,NaN,Infinity])await assert.rejects(receiverVolume(speaker,[speaker],'',value,()=>{throw Error('Should not contact receiver');}),/invalid/);
 await assert.rejects(receiverVolume({...speaker,capabilities:[]},[],''),/unsupported/);
});

test('late volume reads cannot overwrite a newly selected receiver or a confirmed write',async()=>{
 const {createPinia}=require('pinia');let respond;
 global.window={bridge:{receiverVolume:()=>new Promise(resolve=>{respond=resolve;})}};
 const {useReceiverVolume}=require('../src/renderer/src/stores/receiver-volume.ts');
 const store=useReceiverVolume(createPinia());
 const old=store.request('old');store.reset('new');respond({deviceId:'old',volume:95});await old;
 assert.equal(store.deviceId,'new');assert.equal(store.value,null);
 const pending=store.request('new');const first=respond;
 const write=store.request('new',5);respond({deviceId:'new',volume:5});await write;first({deviceId:'new',volume:95});await pending;
 assert.equal(store.value,5);assert.equal(store.busy,false);
 window.bridge.receiverVolume=async()=>{throw Error('Readback failed');};await store.request('new',9);
 assert.equal(store.value,null);assert.match(store.error,/Readback failed/);
});

test('active receiver volume uses its existing output and confirms the actual value without transport commands',async()=>{
 const {LiveSession}=require('../src/main/audio/live-session.ts');
 for(const airplay of [false,true]){
  const live=new LiveSession(()=>''),calls=[];let actual=80;
  live.state={...live.state,active:true,sessionId:'current',volume:actual};
  const output={async volume(value){calls.push(value);if(value!==undefined){actual=value;return {};}return {CurrentVolume:actual};}};
  if(airplay)live.airplay=output;else live.controller=output;
  assert.equal(await live.volume(5),5);assert.equal(live.state.volume,5);assert.deepEqual(calls,[5,undefined]);
  output.volume=async value=>value===undefined?{CurrentVolume:''}:{};
  await assert.rejects(live.volume(9),/unavailable/);assert.equal(live.state.volume,null);
 }
});

test('selection sets 10 before readiness and preserves later manual changes when starting',async()=>{
 const {createPinia}=require('pinia'),{useReceiverVolume}=require('../src/renderer/src/stores/receiver-volume.ts');
 const store=useReceiverVolume(createPinia()),calls=[];let confirm;
 window.bridge.receiverVolume=(id,value)=>{calls.push({id,value});return new Promise(resolve=>{confirm=()=>resolve({deviceId:id,volume:value});});};
 const selection=store.select('speaker',true),ready=store.ready('speaker');
 assert.equal(store.canStart,false);assert.deepEqual(calls,[{id:'speaker',value:10}]);
 confirm();await selection;await ready;assert.equal(store.value,10);assert.equal(store.canStart,true);
 window.bridge.receiverVolume=async(id,value)=>{calls.push({id,value});return {deviceId:id,volume:value};};
 await store.request('speaker',4);await store.ready('speaker');assert.equal(store.value,4);assert.deepEqual(calls.at(-1),{id:'speaker',value:4});
 assert.equal(calls.filter(c=>c.value===10).length,1);
 window.bridge.windowsVolume=async value=>{calls.push({id:'local-output',value});return {volume:value,muted:false};};
 await store.select('local-output',true);assert.equal(store.value,10);assert.deepEqual(calls.at(-1),{id:'local-output',value:10});
});

test('failed selection blocks startup; unsupported outputs never receive a volume command',async()=>{
 const {createPinia}=require('pinia'),{useReceiverVolume}=require('../src/renderer/src/stores/receiver-volume.ts');
 const store=useReceiverVolume(createPinia());let calls=0;
 window.bridge.receiverVolume=async id=>{calls++;return {deviceId:id,volume:80};};
 await assert.rejects(store.select('speaker',true),/selectionFailed/);assert.equal(store.canStart,false);
 await assert.rejects(store.ready('speaker'),/selectionFailed/);assert.equal(store.value,null);
 await store.select('fixed-output',false);await store.ready('fixed-output');assert.equal(store.canStart,true);assert.equal(calls,1);
});

test('a volume response from a stopped session never overwrites the replacement session',async()=>{
 const {LiveSession}=require('../src/main/audio/live-session.ts');let resolve;
 const live=new LiveSession(()=>'');live.state={...live.state,active:true,sessionId:'old',volume:75};
 live.controller={volume:()=>new Promise(r=>{resolve=r;})};
 const request=live.volume();live.state={...live.state,sessionId:'new',volume:8};live.controller={};resolve({CurrentVolume:75});
 await assert.rejects(request);assert.equal(live.state.volume,8);
});
