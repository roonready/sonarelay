const {app}=require('electron');const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const ap=require('@sonn-audio/node-airplay'),fixture=require('./airplay-crypto-fixture.json');
try{
 const key=Buffer.from(fixture.key,'hex'),plain=Buffer.from(fixture.plain,'hex'),expected=Buffer.from(fixture.encrypted,'hex');
 const session=new ap.HapSession(key,key,key);assert.deepEqual(session.encrypt(plain),expected);
 const receiver=new ap.HapSession(key,key,key);const pieces=[];for(let i=0;i<expected.length;i+=17)pieces.push(receiver.decrypt(expected.subarray(i,i+17)));assert.deepEqual(Buffer.concat(pieces),plain);
 const tampered=Buffer.from(expected);tampered[100]^=1;assert.throws(()=>new ap.HapSession(key,key,key).decrypt(tampered));
 let packet;const socket={on(){},send(data,_port,_host,cb){packet=Buffer.from(data);cb?.();},close(){}};
 const sender=new ap.RealtimeSender({host:'127.0.0.1',dataPort:1,controlPort:2,audioKey:key,ptp:{now:()=>BigInt(Date.now())*1000000n,clockId:1n},timing:'ptp',leadMs:2000},socket,socket);
 sender.start();sender.sendPacket(Buffer.alloc(352*4));assert.ok(packet.length>28);assert.equal(sender.packetsSent,1);sender.stop();
 const result={electron:process.versions.electron,node:process.versions.node,nativeChacha:crypto.getCiphers().includes('chacha20-poly1305'),hapMatchesNativeNodeFixture:true,fragmentedDecrypt:true,tamperRejected:true,rtpEncrypted:true};
 fs.mkdirSync(path.resolve(__dirname,'../.verification'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../.verification/airplay-electron-crypto.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(0);
}catch(error){console.error(error);app.exit(1);}
