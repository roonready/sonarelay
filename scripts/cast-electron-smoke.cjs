const {app}=require('electron');const assert=require('node:assert/strict');const path=require('node:path');
const deadline=setTimeout(()=>{console.error('Cast Electron smoke timeout');app.exit(1);},20000);
app.whenReady().then(async()=>{
 const proto=require(path.join(path.dirname(require.resolve('castv2')),'lib/proto.js'));
 const message={protocolVersion:0,sourceId:'sender-0',destinationId:'receiver-0',namespace:'urn:x-cast:com.google.cast.receiver',payloadType:0,payloadUtf8:'{"type":"GET_STATUS"}'};
 assert.equal(proto.CastMessage.parse(proto.CastMessage.serialize(message)).payloadUtf8,message.payloadUtf8);
 require('./register-ts.cjs');const {interfaces}=require('../src/main/network/interfaces.ts');const {probeCast}=require('../src/main/cast/probe.ts');
 const address=interfaces().find(i=>i.address.startsWith('192.168.1.')).address;
 const device=await probeCast(process.argv[2]||'192.168.1.2',address);
 console.log(JSON.stringify({electron:process.versions.electron,synchronousSchema:true,device}));clearTimeout(deadline);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1);});
