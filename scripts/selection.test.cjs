require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SelectionRouter}=require('../src/renderer/src/services/selection-router.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('receiver selection starts the relay and local output stops it',async()=>{
 const events=[];
 const router=new SelectionRouter(async id=>{
  events.push('start '+id);return {stop:async()=>{events.push('stop '+id);}};
 });
 await router.route('A');
 await router.stop();assert.deepEqual(events,['start A','stop A']);
});
test('rapid destination changes stop the old receiver and skip the superseded capture',async()=>{
 const events=[];let release;
 const stopped=new Promise(resolve=>{release=resolve;});
 const router=new SelectionRouter(async id=>{
  events.push('start '+id);return {stop:async()=>{events.push('stop '+id);if(id==='A')await stopped;}};
 });
 await router.route('A');const b=router.route('B');await tick();
 const c=router.route('C');assert.ok(!events.includes('start C'));
 release();await Promise.all([b,c]);
 assert.ok(!events.includes('start B'));
 assert.ok(events.indexOf('stop A')<events.indexOf('start C'));
 await router.stop();assert.equal(events.at(-1),'stop C');
});
