require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {probeBluos}=require('../src/main/bluos/discovery.ts');
const {BluosController}=require('../src/main/bluos/controller.ts');
const {bluosRequest}=require('../src/main/bluos/client.ts');
async function fixture(callback){
 let fixed=false,invalid=false,volume=8,statusQueries=0;
 const requests=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url);
  res.setHeader('Content-Type','text/xml');
  if(url.pathname==='/SyncStatus')res.end(invalid?'<root>not a player</root>':`<SyncStatus name="Living room" modelName="PULSE FLEX 2i" brand="Bluesound" mac="90:56:82:11:22:33" initialized="true" volume="${fixed?-1:volume}"/>`);
  else if(url.pathname==='/Volume'){
   if(url.searchParams.has('level'))volume=Number(url.searchParams.get('level'));
   res.end(`<volume mute="0">${volume}</volume>`);
  }else if(url.pathname==='/Status'){statusQueries++;res.end('<status><state>stream</state><secs>10</secs><totlen>0</totlen></status>');}
  else if(url.pathname==='/Play')res.end('<state>stream</state>');
  else if(url.pathname==='/Pause')res.end('<state>pause</state>');
  else if(url.pathname==='/Stop')res.end('<state>stop</state>');
  else{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await callback({port:server.address().port,requests,setFixed:()=>{fixed=true;},setInvalid:()=>{invalid=true;},statusQueries:()=>statusQueries});}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('BluOS is identified from SyncStatus without fake UPnP services; fixed volume is respected',async()=>fixture(async f=>{
 const device=await probeBluos('127.0.0.1','127.0.0.1',f.port);
 assert.equal(device.name,'Living room');assert.equal(device.protocol,'bluos');assert.equal(device.model,'PULSE FLEX 2i');assert.deepEqual(device.services,[]);
 assert.ok(device.capabilities.includes('SetVolume'));
 f.setFixed();const fixed=await probeBluos('127.0.0.1','127.0.0.1',f.port);
 assert.ok(!fixed.capabilities.includes('SetVolume'));
 await assert.rejects(new BluosController(fixed,'127.0.0.1').volume(50),/фиксированная/);
 f.setInvalid();await assert.rejects(probeBluos('127.0.0.1','127.0.0.1',f.port),/не является BluOS/);
}));
test('BluOS sends encoded stream URL, transport commands and scoped volume; caches Status',async()=>fixture(async f=>{
 const device=await probeBluos('127.0.0.1','127.0.0.1',f.port);
 const controller=new BluosController(device,'127.0.0.1');
 await controller.stop();assert.equal(f.requests.filter(r=>r.pathname==='/Stop').length,0);
 const stream='http://127.0.0.1:12345/test.flac?token=a&part=1';
 await controller.setUri(stream,'Live',undefined,'audio/flac');await controller.play();
 assert.equal(f.requests.find(r=>r.pathname==='/Play').searchParams.get('url'),stream);
 assert.equal((await controller.transport()).CurrentTransportState,'PLAYING');
 assert.equal((await controller.position()).RelTime,'10');assert.equal(f.statusQueries(),1);
 assert.equal((await controller.volume()).CurrentVolume,8);
 assert.equal((await controller.volume(15)).CurrentVolume,15);
 const request=f.requests.find(r=>r.pathname==='/Volume'&&r.searchParams.has('level'));
 assert.equal(request.searchParams.get('tell_slaves'),'0');
 await controller.pause();await controller.transport();assert.equal(f.statusQueries(),2);
 await controller.stop();assert.equal(f.requests.filter(r=>r.pathname==='/Stop').length,1);
 await assert.rejects(controller.setUri('https://example.com/x','x'),/локальный media server/);
 await assert.rejects(controller.volume(101),/Некорректная/);
}));
test('BluOS client rejects unsupported requests and enforces request deadline',async()=>{
 await assert.rejects(bluosRequest('127.0.0.1',11000,'127.0.0.1','Reboot'),/Неподдерживаемая/);
 const server=http.createServer((_req,_res)=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(bluosRequest('127.0.0.1',server.address().port,'127.0.0.1','SyncStatus',{},80),/тайм-аут/);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
