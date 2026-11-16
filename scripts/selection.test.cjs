require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SelectionRouter}=require('../src/renderer/src/services/selection-router.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('capture is requested synchronously on selection and local output stops the current receiver',async()=>{
 const events=[];
 const router=new SelectionRouter(id=>{events.push('prepare '+id);return Promise.resolve(id);},async(id,input)=>{
  await input;events.push('start '+id);return {stop:async()=>{events.push('stop '+id);}};
 },input=>events.push('discard '+input));
 const operation=router.route('A');assert.deepEqual(events,['prepare A']);await operation;
 await router.stop();assert.deepEqual(events,['prepare A','start A','stop A']);
});
test('rapid destination changes stop the old receiver and skip the superseded capture',async()=>{
 const events=[];let release;
 const stopped=new Promise(resolve=>{release=resolve;});
 const router=new SelectionRouter(id=>{events.push('prepare '+id);return Promise.resolve(id);},async(id,input)=>{
  await input;events.push('start '+id);return {stop:async()=>{events.push('stop '+id);if(id==='A')await stopped;}};
 },input=>events.push('discard '+input));
 await router.route('A');const b=router.route('B');await tick();
 const c=router.route('C');assert.ok(events.includes('prepare C'));assert.ok(!events.includes('start C'));
 release();await Promise.all([b,c]);
 assert.ok(events.includes('discard B'));assert.ok(!events.includes('start B'));
 assert.ok(events.indexOf('stop A')<events.indexOf('start C'));
 await router.stop();assert.equal(events.at(-1),'stop C');
});
