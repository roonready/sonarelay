require('./register-ts.cjs');
const path=require('node:path');
const {RadioSource,RADIO_FORMAT}=require('../src/main/radio/source.ts');
const {NativeOutput}=require('../src/main/radio/native-output.ts');
const {AudioEngine}=require('../src/main/audio/audio-engine.ts');
const {radioStations}=require('../src/shared/radio.ts');
const station=radioStations.find(item=>item.id===(process.argv[2]||'nashe-radio'));
if(!station)throw new Error('Unknown station');
(async()=>{
 const source=new RadioSource(station.streamUrl),engine=new AudioEngine(source,RADIO_FORMAT),output=new NativeOutput(path.resolve(__dirname,'../assets/native'));
 let metadata=false,peak=0,played=0;
 source.on('metadata',value=>{if(value.streamTitle)metadata=true;});
 engine.on('pcm',buffer=>{for(let i=0;i<buffer.length;i+=4)peak=Math.max(peak,Math.abs(buffer.readInt16LE(i)));});
 output.on('played',bytes=>{played=bytes;});
 const failure=new Promise((_,reject)=>{source.on('failure',code=>reject(new Error(code)));output.on('failure',code=>reject(new Error(code)));});void failure.catch(()=>{});
 let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Radio playback timed out')),25000);});
 try{
  const started=new Promise(resolve=>output.once('playing',resolve));
  await Promise.race([(async()=>{await output.start(engine,source);await engine.start();await started;await new Promise(resolve=>setTimeout(resolve,2000));})(),failure,timeout]);
 }finally{clearTimeout(timer);await source.stop();await output.stop();await engine.stop();}
 if(!peak||!played)throw new Error('No non-silent PCM or completed Windows playback buffers');
 console.log(JSON.stringify({station:station.id,pcmBytes:engine.bytes,peak,completedPlaybackBytes:played,icyMetadata:metadata,browserUsed:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
