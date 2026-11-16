require('./register-ts.cjs');const {test}=require('node:test'),assert=require('node:assert/strict');const {compareReceivers}=require('../src/shared/receiver-order.ts');
test('receiver order does not depend on protocol discovery reply order',()=>{
 const protocols=['slimproto','cast','dlna','bluos','airplay2'];const devices=protocols.map(protocol=>({id:protocol,name:'WiiM Pro',protocol,ip:'192.168.1.21'}));
 const expected=['airplay2','bluos','dlna','cast','slimproto'];
 for(let i=0;i<devices.length;i++){
  const order=[...devices.slice(i),...devices.slice(0,i)].reverse();assert.deepEqual(order.sort(compareReceivers).map(d=>d.id),expected);
 }
});
test('duplicate receiver names and protocols have stable numeric address and ID tie breakers',()=>{
 const devices=[{id:'b',name:'WiiM',protocol:'cast',ip:'192.168.1.21'},{id:'a',name:'WiiM',protocol:'cast',ip:'192.168.1.21'},{id:'z',name:'WiiM',protocol:'cast',ip:'192.168.1.2'}];
 assert.deepEqual(devices.sort(compareReceivers).map(d=>d.id),['z','a','b']);assert.equal(compareReceivers(devices[0],devices[0]),0);
 assert.ok(compareReceivers({name:'TV 2',id:'2',ip:'1.1.1.1'},{name:'TV 10',id:'10',ip:'1.1.1.1'})<0);
});
