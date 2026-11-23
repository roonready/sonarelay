require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const ffmpeg=require('ffmpeg-static');
const {AudioEngine}=require('../src/main/audio/audio-engine.ts');
const {PcmFixture}=require('./pcm-fixture.cjs');
const {LiveServer}=require('../src/main/media-server/live-server.ts');
const {didl}=require('../src/main/dlna/didl.ts');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function connect(url){
 const result={chunks:[],response:null,request:null};
 result.ready=new Promise((resolve,reject)=>{
  result.request=http.get(url,response=>{result.response=response;response.on('data',chunk=>result.chunks.push(chunk));response.on('error',()=>{});resolve(response);});
  result.request.on('error',reject);
 });
 return result;
}
async function waitFor(check,timeout=7000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('Timeout');await sleep(20);}}
test('PCM history is bounded to 250 ms and rejects malformed chunks',async()=>{
 const source=new PcmFixture(),engine=new AudioEngine(source,{sampleRate:48000,channels:2,bitDepth:16});
 await engine.start();
 try{
  for(let i=0;i<1000;i++)source.push(Buffer.alloc(16384));
  assert.ok(engine.snapshot().length<=48000);assert.equal(engine.bytes,16384000);
  assert.throws(()=>source.push(Buffer.alloc(3)),/Некорректный/);
 }finally{await engine.stop();}
});
test('live FLAC reconnects with its own header, preserves PCM and closes encoders',async()=>{
 const source=new PcmFixture(),engine=new AudioEngine(source,{sampleRate:48000,channels:2,bitDepth:16});
 const server=new LiveServer();let feed,first,second;
 const errors=[];server.on('client-error',e=>errors.push(e));
 await engine.start();
 try{
  const url=await server.start('127.0.0.1','127.0.0.1',engine);
  first=connect(url);
  // Constant PCM lets both a new stream and the warm-up snapshot be compared exactly.
  const pcm=Buffer.alloc(3840);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(321,i);
  feed=setInterval(()=>source.push(pcm),20);
  await first.ready;
  await waitFor(()=>Buffer.concat(first.chunks).length>8500);
  assert.equal(first.response.headers['content-type'],'audio/flac');
  assert.equal(first.response.headers['content-length'],undefined);
  assert.equal(first.response.headers['transfer-encoding'],undefined);
  assert.equal(Buffer.concat(first.chunks).subarray(0,4).toString(),'fLaC');
  first.request.destroy();await waitFor(()=>server.connections===0);
  second=connect(url);await second.ready;
  await waitFor(()=>Buffer.concat(second.chunks).length>8500);
  const flac=Buffer.concat(second.chunks);
  assert.equal(flac.subarray(0,4).toString(),'fLaC');
  const decoded=spawnSync(ffmpeg,['-v','error','-f','flac','-i','pipe:0','-f','s16le','pipe:1'],{input:flac,windowsHide:true,maxBuffer:4*1024*1024,timeout:7000});
  assert.ok(decoded.stdout.length>4096,decoded.stderr.toString());
  for(let i=0;i<4096;i+=2)assert.equal(decoded.stdout.readInt16LE(i),321);
  assert.equal(server.requests,2);assert.deepEqual(errors,[]);
 }finally{
  clearInterval(feed);first?.request.destroy();second?.request.destroy();await server.close();await engine.stop();
 }
 assert.equal(server.connections,0);
});
test('live DIDL advertises FLAC without invented finite size',()=>{
 const xml=didl('http://127.0.0.1/a.flac','Live',undefined,'audio/flac');
 assert.ok(xml.includes('audio/flac'));assert.ok(!xml.includes('size='));
});
const {ffmpegPath}=require('../src/main/audio/flac-encoder.ts');
test('FFmpeg resolver finds installed binary despite a stale invalid override',()=>{
 const previous=process.env.FFMPEG_BIN;
 process.env.FFMPEG_BIN='C:\\nonexistent-sonarelay-test\\ffmpeg.exe';
 try{
  const executable=ffmpegPath();
  assert.ok(require('node:fs').statSync(executable).isFile());
  const version=spawnSync(executable,['-version'],{windowsHide:true,timeout:5000,encoding:'utf8'});
  assert.equal(version.status,0,version.stderr||version.error?.message);
  assert.match(version.stdout,/ffmpeg version/);
 }finally{if(previous===undefined)delete process.env.FFMPEG_BIN;else process.env.FFMPEG_BIN=previous;}
});
