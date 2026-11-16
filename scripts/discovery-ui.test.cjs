require('./register-ts.cjs');const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcileReceiverOptions}=require('../src/renderer/src/services/receiver-options.ts');
const device={id:'wiim',name:'WiiM Pro',protocol:'cast',ip:'192.168.1.21'};
test('unchanged receiver menu keeps its array and items across heartbeat and expiry refresh',()=>{
 const first=reconcileReceiverOptions([],[device]);const next=reconcileReceiverOptions(first,[{...device,expiresAt:Date.now()+90000}]);
 assert.equal(first,next);assert.equal(first[0],next[0]);assert.equal(next[0].label,'WiiM Pro (Google Cast)');
});
test('store publishes menu only after scan completion and keeps selected output through partial replies',async()=>{
 const {createPinia,setActivePinia}=require('pinia');setActivePinia(createPinia());let notify;
 const snapshot={diagnostics:{replies:0,descriptions:0,unicastPeers:0,slimAddress:'192.168.1.14'},interfaces:[],selectedAddress:'192.168.1.14',devices:[device],scanning:false,error:'',lastScan:1};
 global.window={bridge:{getState:async()=>snapshot,onState:callback=>{notify=callback;return ()=>{};}}};
 const {useDevices}=require('../src/renderer/src/stores/devices.ts');const store=useDevices();const stop=await store.init();store.selectedId=device.id;const menu=store.receiverOptions;
 notify({...snapshot,scanning:true,devices:[]});assert.equal(store.receiverOptions,menu);assert.equal(store.selectedId,device.id);
 notify({...snapshot,scanning:true,devices:[device,{...device,id:'new',protocol:'dlna'}]});assert.equal(store.receiverOptions,menu);
 notify({...snapshot,devices:[{...device,expiresAt:99999}],lastScan:2});assert.equal(store.receiverOptions,menu);assert.equal(store.selectedId,device.id);
 notify({...snapshot,devices:[],lastScan:3});assert.equal(store.receiverOptions.length,0);assert.equal(store.selectedId,'local-output');stop();
});
