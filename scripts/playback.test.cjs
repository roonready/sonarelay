require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {soap}=require('../src/main/dlna/soap-client.ts');
const {didl}=require('../src/main/dlna/didl.ts');
const {Controller}=require('../src/main/dlna/controller.ts');

test('DLNA uses MP3 only when the receiver advertises it without FLAC', async () => {
 let sink = '';
 const server = http.createServer((request, response) => {
  assert.equal(request.headers.soapaction, '"urn:schemas-upnp-org:service:ConnectionManager:1#GetProtocolInfo"');
  response.end(`<Envelope><Body><GetProtocolInfoResponse><Sink>${sink}</Sink></GetProtocolInfoResponse></Body></Envelope>`);
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const service = {
  type: 'urn:schemas-upnp-org:service:ConnectionManager:1',
  controlUrl: `http://127.0.0.1:${server.address().port}/connection`,
  actions: ['GetProtocolInfo'],
 };
 try {
  const controller = new Controller({ services: [service] }, '127.0.0.1');
  for (const [advertised, expected] of [
   ['http-get:*:audio/mpeg:DLNA.ORG_PN=MP3', 'mp3'],
   ['http-get:*:audio/mpeg:*,http-get:*:audio/flac:*', 'flac'],
   ['http-get:*:audio/mpeg:*,http-get:*:audio/*:*', 'flac'],
   ['rtsp-rtp-udp:*:audio/mpeg:*', 'flac'],
   ['', 'flac'],
  ]) {
   sink = advertised;
   assert.equal(await controller.liveEncoding(), expected, advertised);
  }
  assert.equal(await new Controller({ services: [] }, '127.0.0.1').liveEncoding(), 'flac');
 } finally { await new Promise(resolve => server.close(resolve)); }
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
