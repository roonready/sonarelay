require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {MediaServer}=require('../src/main/media-server/http-server.ts');
const {testWav}=require('../src/main/audio/wav.ts');
const {CaptureRecorder}=require('../src/main/audio/capture-recorder.ts');
const {soap}=require('../src/main/dlna/soap-client.ts');
const {didl}=require('../src/main/dlna/didl.ts');
function request(url,options={}){return new Promise((resolve,reject)=>{const r=http.request(url,options,s=>{const parts=[];s.on('data',b=>parts.push(b));s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,body:Buffer.concat(parts)}));});r.on('error',reject);r.end();});}
test('WAV HTTP serves HEAD, full and suffix ranges and rejects invalid range / paths',async()=>{
 const server=new MediaServer(),wav=testWav(1);
 try {
  const url=await server.start('127.0.0.1','127.0.0.1',wav);
  const head=await request(url,{method:'HEAD'});assert.equal(Number(head.headers['content-length']),wav.length);assert.equal(head.body.length,0);
  const full=await request(url);assert.deepEqual(full.body,wav);
  assert.equal(full.headers['access-control-allow-origin'],'*');
  const preflight=await request(url,{method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers['access-control-allow-private-network'],'true');
  const part=await request(url,{headers:{Range:'bytes=0-43'}});assert.equal(part.status,206);assert.deepEqual(part.body,wav.subarray(0,44));
  const suffix=await request(url,{headers:{Range:'bytes=-8'}});assert.deepEqual(suffix.body,wav.subarray(-8));
  assert.equal((await request(url,{headers:{Range:'bytes=99999999-'}})).status,416);
  assert.equal((await request(url,{headers:{Range:'bytes=0-1,5-6'}})).status,416);
  assert.equal((await request(url.replace(/\/[^/]+$/,'/wrong'))).status,404);
 }finally{await server.close();}
});
test('capture WAV finalizes header and reports PCM rate, duration and signal',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sonarelay-capture-'));
 const recorder=new CaptureRecorder(directory);
 try {
  recorder.begin(44100);const pcm=testWav(1).subarray(44);
  for(let i=0;i<pcm.length;i+=16384)recorder.append(pcm.subarray(i,i+16384));
  const result=recorder.finish(),data=recorder.read();
  assert.equal(result.seconds,1);assert.equal(result.sampleRate,44100);assert.ok(result.peak>0);
  assert.equal(data.readUInt32LE(40),pcm.length);assert.equal(data.readUInt16LE(34),16);
  assert.equal(recorder.finish().path,result.path);
 }finally{recorder.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
test('SOAP escapes nested DIDL, reports UPnP faults and rejects unsupported actions',async()=>{
 let fail=false;
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   assert.equal(req.headers.soapaction,'"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"');
   assert.ok(body.includes('&lt;DIDL-Lite'));assert.ok(!body.includes('<DIDL-Lite'));
   res.writeHead(fail?500:200,{'Content-Type':'text/xml'});
   res.end(fail?'<s:Envelope xmlns:s="x"><s:Body><s:Fault><detail><UPnPError><errorCode>701</errorCode><errorDescription>Transition not available</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>':'<s:Envelope xmlns:s="x"><s:Body><u:SetAVTransportURIResponse xmlns:u="x"/></s:Body></s:Envelope>');
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const service={type:'urn:schemas-upnp-org:service:AVTransport:1',controlUrl:`http://127.0.0.1:${server.address().port}/`,scpdUrl:'',actions:['SetAVTransportURI']};
  const args={InstanceID:0,CurrentURI:'http://example/audio.wav',CurrentURIMetaData:didl('http://example/audio.wav','A & B',100)};
  await soap(service,'SetAVTransportURI',args,'127.0.0.1');
  fail=true;await assert.rejects(soap(service,'SetAVTransportURI',args,'127.0.0.1'),/701/);
  await assert.rejects(soap(service,'Pause',{},'127.0.0.1'),/не поддерживает/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
