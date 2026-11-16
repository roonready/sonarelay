require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),http=require('node:http');
const {SlimBridge,slimPlayer,slimDiscoveryReply}=require('../src/main/slimproto/server.ts');
const {SlimController}=require('../src/main/slimproto/controller.ts');
const {AudioEngine}=require('../src/main/audio/audio-engine.ts');const {YandexMusicSource}=require('../src/main/audio/yandex-source.ts');const {LiveServer}=require('../src/main/media-server/live-server.ts');
const wait=async check=>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('timeout');await new Promise(r=>setTimeout(r,10));}};
function frame(op,data){const length=Buffer.alloc(4);length.writeUInt32BE(data.length);return Buffer.concat([Buffer.from(op),length,data]);}
function helo(){const b=Buffer.alloc(36);b[0]=12;Buffer.from('021122334455','hex').copy(b,2);return frame('HELO',Buffer.concat([b,Buffer.from('Model=Squeezelite,MaxSampleRate=192000,flc,pcm,mp3')]));}
test('SlimProto discovery advertises SonaRelay, rejects truncated TLVs, omits nonexistent CLI',()=>{
 const reply=slimDiscoveryReply(Buffer.from('eNAME\0JSON\0VERS\0IPAD\0'),'192.168.1.14');assert.ok(reply.includes(Buffer.from('SonaRelay')));assert.ok(reply.includes(Buffer.from('192.168.1.14')));assert.ok(!reply.includes(Buffer.from('JSON')));assert.equal(slimDiscoveryReply(Buffer.from('eNAME\x05bad'),'192.168.1.14'),undefined);
});
test('real SlimProto handshake and FLAC HTTP stream, transport and cleanup without volume writes',async()=>{
 const bridge=new SlimBridge(0),source=new YandexMusicSource(),engine=new AudioEngine(source,{sampleRate:48000,channels:2,bitDepth:16}),server=new LiveServer();let socket,timer,request,response;const frames=[];let chunks=[];let errors=[];bridge.on('diagnostic',e=>errors.push(e));
 try{
  await bridge.start('127.0.0.1','255.0.0.0');socket=net.connect(bridge.port,'127.0.0.1');socket.on('error',()=>{});let incoming=Buffer.alloc(0);
  socket.on('data',data=>{incoming=Buffer.concat([incoming,data]);while(incoming.length>=2){const n=incoming.readUInt16BE(0);if(incoming.length<n+2)break;const packet=incoming.subarray(2,n+2);incoming=incoming.subarray(n+2);const op=packet.toString('ascii',0,4),body=packet.subarray(4);frames.push({op,body:Buffer.from(body)});
   if(op==='strm'&&body[0]===115){const text=body.subarray(24).toString('ascii'),path=text.match(/^GET (\S+)/)[1],host=text.match(/Host: ([^\r]+)/)[1];request=http.get('http://'+host+path,res=>{response=res;res.on('data',b=>chunks.push(b));res.on('error',()=>{});socket.write(frame('STAT',Buffer.from('STMs')));});request.on('error',()=>{});}
  }});socket.write(helo());await wait(()=>bridge.devices.length===1);const device=bridge.devices[0];assert.equal(device.protocol,'slimproto');assert.equal(slimPlayer(device.slimPlayerId).volumeLevel,50);assert.ok(!frames.some(f=>f.op==='audg'));
  await engine.start();const url=await server.start('127.0.0.1','127.0.0.1',engine);const controller=new SlimController(device,'127.0.0.1');await controller.setUri(url,'Test',undefined,'audio/flac');await controller.play();timer=setInterval(()=>source.push(Buffer.alloc(3840)),20);
  await wait(()=>chunks.reduce((n,b)=>n+b.length,0)>=4);assert.equal(Buffer.concat(chunks).subarray(0,4).toString(),'fLaC');await wait(()=>slimPlayer(device.slimPlayerId).state==='playing');assert.equal((await controller.transport()).CurrentTransportState,'PLAYING');
  const start=frames.find(f=>f.op==='strm'&&f.body[0]===115);assert.ok(start.body.includes(Buffer.from('GET /')));assert.equal(start.body[2],102);assert.ok(!frames.some(f=>f.op==='audg'));
  await controller.pause();assert.equal((await controller.transport()).CurrentTransportState,'PAUSED_PLAYBACK');await controller.stop();assert.equal((await controller.transport()).CurrentTransportState,'STOPPED');await assert.rejects(controller.volume(),/WiiM Home/);
  await bridge.stop();assert.throws(()=>slimPlayer(device.slimPlayerId),/отключён/);await bridge.stop();assert.equal(errors.length,0);
 }finally{clearInterval(timer);response?.destroy();request?.destroy();socket?.destroy();await server.close();await engine.stop();await bridge.stop();}
});
test('malformed SlimProto HELO closes only its connection',async()=>{
 const bridge=new SlimBridge(0);let socket;const diagnostics=[];bridge.on('diagnostic',e=>diagnostics.push(e));
 try{await bridge.start('127.0.0.1','255.0.0.0');socket=net.connect(bridge.port,'127.0.0.1');socket.on('error',()=>{});const closed=new Promise(r=>socket.on('close',r));socket.write(frame('HELO',Buffer.alloc(0)));await closed;assert.ok(diagnostics.length);assert.equal(bridge.devices.length,0);}finally{socket?.destroy();await bridge.stop();}
});
