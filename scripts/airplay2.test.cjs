require('./register-ts.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PcmQueue}=require('../src/main/airplay2/pcm-queue.ts');
const {airplayAdvertisements}=require('../src/main/airplay2/discovery.ts');
const {AirplayOutput}=require('../src/main/airplay2/output.ts');
test('AirPlay PCM FIFO preserves frames across chunks and limits memory',()=>{
 const q=new PcmQueue(16);q.push(Buffer.from([1,2,3,4,5,6,7,8]));q.push(Buffer.from([9,10,11,12]));
 assert.deepEqual([...q.read(4)],[1,2,3,4]);assert.equal(q.read(12),undefined);assert.equal(q.bytes,8);
 assert.deepEqual([...q.read(8)],[5,6,7,8,9,10,11,12]);
 assert.throws(()=>q.push(Buffer.alloc(3)));q.push(Buffer.alloc(16));assert.throws(()=>q.push(Buffer.alloc(4)));assert.throws(()=>q.read(3));q.clear();assert.equal(q.bytes,0);
});
test('AirPlay mDNS joins case-insensitive DNS names and rejects off-LAN receivers',()=>{
 const records=[{type:'SRV',name:'Speaker._airplay._tcp.local',data:{target:'SPEAKER.local',port:7000}},{type:'A',name:'speaker.local',data:'192.168.1.18'}];
 assert.deepEqual(airplayAdvertisements(records,'192.168.1.14','255.255.255.0'),[{ip:'192.168.1.18',port:7000}]);
 records[1].data='10.1.1.1';assert.deepEqual(airplayAdvertisements(records,'192.168.1.14','255.255.255.0'),[]);
});
test('AirPlay shutdown releases all resources once, including partial setup',async()=>{
 const out=new AirplayOutput({ip:'192.168.1.18'},'192.168.1.14');let stopped=0,closed=0,killed=0,detached=0;
 out.sender={stop(){stopped++;}};out.ptp={stop(){stopped++;}};out.ntp={stop(){stopped++;}};
 out.engine={off(){detached++;}};out.resampler={stdin:{destroy(){}},kill(){killed++;}};
 out.connection={sessionUrl:'/',rtsp:{request:async()=>{}},close(){closed++;}};
 await Promise.all([out.stop(),out.stop()]);assert.equal(stopped,3);assert.equal(closed,1);assert.equal(killed,1);assert.equal(detached,1);await assert.rejects(out.play());
});
test('AirPlay PIN requirement is explicit before any connection',async()=>{
 const out=new AirplayOutput({ip:'192.168.1.18',airplayPairingRequired:true},'192.168.1.14');await assert.rejects(out.prepare({}),/PIN/);await out.stop();
});

test('AirPlay HAP patch matches native Node encryption and rejects forged tags',()=>{
 const {HapSession}=require('@sonn-audio/node-airplay');const fixture=require('./airplay-crypto-fixture.json');
 const key=Buffer.from(fixture.key,'hex'),plain=Buffer.from(fixture.plain,'hex'),expected=Buffer.from(fixture.encrypted,'hex');
 assert.deepEqual(new HapSession(key,key,key).encrypt(plain),expected);
 const receiver=new HapSession(key,key,key),pieces=[];
 for(let offset=0;offset<expected.length;offset+=17)pieces.push(receiver.decrypt(expected.subarray(offset,offset+17)));
 assert.deepEqual(Buffer.concat(pieces),plain);
 const forged=Buffer.from(expected);forged[100]^=1;assert.throws(()=>new HapSession(key,key,key).decrypt(forged));
});
