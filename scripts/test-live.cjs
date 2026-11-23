const {PcmFixture}=require('./pcm-fixture.cjs');
﻿require('./register-ts.cjs');
const {Discovery}=require('../src/main/discovery/ssdp.ts');
const {LiveSession}=require('../src/main/audio/live-session.ts');
const target=process.argv[2];if(!target)throw new Error('Укажите IP приёмника');
const discovery=new Discovery();let live,timer;
const deadline=setTimeout(async()=>{clearInterval(timer);discovery.dispose();await live?.stop();process.exitCode=1;},60000);
discovery.on('state',async state=>{
 if(state.scanning)return;discovery.dispose();
 try{
  const device=state.devices.find(d=>d.ip===target);if(!device)throw new Error('Приёмник не обнаружен');
  live=new LiveSession(()=>state.selectedAddress);
  live.on('state',s=>{if(s.error)console.error('LIVE ERROR',s.error);});
  const source=new PcmFixture();await live.begin(device,state.selectedAddress,48000,{source,title:'SonaRelay test tone'});
  let frame=0;
  const feed=()=>{
   const pcm=Buffer.alloc(1920*4);
   for(let i=0;i<1920;i++,frame++){
    const seconds=frame/48000;
    const frequency=seconds<6?440:880;
    const sample=seconds>=4&&seconds<6?0:Math.round(Math.sin(frame*2*Math.PI*frequency/48000)*500);
    pcm.writeInt16LE(sample,i*4);pcm.writeInt16LE(sample,i*4+2);
   }
   source.push(pcm);
  };
  feed();timer=setInterval(feed,40);
  console.log('START',JSON.stringify(await live.connect(session.sessionId)));
  for(let i=0;i<3;i++){
   await new Promise(resolve=>setTimeout(resolve,4000));
   console.log('STATUS',JSON.stringify(await live.command('status')));
  }
  console.log('RESULT',JSON.stringify(live.state));
  if(live.state.error||!live.state.httpRequests||!live.state.encodedBytes||live.state.status!=='PLAYING')throw new Error('Приёмник не подтвердил воспроизведение потока');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{clearInterval(timer);clearTimeout(deadline);await live?.stop();}
});
void discovery.scan(discovery.state.selectedAddress);
