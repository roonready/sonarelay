require('./register-ts.cjs');
const {probeAirplay2}=require('../src/main/airplay2/discovery.ts');
const {LiveSession}=require('../src/main/audio/live-session.ts');
const {interfaces}=require('../src/main/network/interfaces.ts');
module.exports=(async()=>{
 const ip=process.argv[2]||'192.168.1.18',address=interfaces().find(i=>i.address.startsWith('192.168.1.')).address;
 const device=await probeAirplay2(ip,address);console.log('DEVICE',JSON.stringify(device));
 const live=new LiveSession(()=>address);let timer,frame=0;
 live.on('state',s=>{if(s.error)console.error('ERROR',s.error);});
 try{
  const session=await live.begin(device,address,48000);
  const feed=()=>{if(!live.state.active)return;const pcm=Buffer.alloc(1920*4);for(let i=0;i<1920;i++,frame++){const t=frame/48000,f=t<6?440:880,v=t>=4&&t<6?0:Math.round(Math.sin(frame*2*Math.PI*f/48000)*500);pcm.writeInt16LE(v,i*4);pcm.writeInt16LE(v,i*4+2);}live.push(session.sessionId,pcm);};
  const started=process.hrtime.bigint();timer=setInterval(()=>{const due=Math.floor(Number(process.hrtime.bigint()-started)/1e9*48000);while(frame+1920<=due)feed();},5);await new Promise(r=>setTimeout(r,60));console.log('START',JSON.stringify(await live.connect(session.sessionId)));
  for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,4000));console.log('STATUS',JSON.stringify(await live.command('status')));}
  if(live.state.error||!live.state.packets||!live.state.timingExchanges)throw new Error('Не подтверждены RTP и обмены часов');
  await live.command('pause');await new Promise(r=>setTimeout(r,1000));await live.command('play');await new Promise(r=>setTimeout(r,2000));console.log('RESUMED',JSON.stringify(live.state));
 }finally{clearInterval(timer);await live.stop();await live.stop();console.log('STOPPED');}
})().catch(e=>{console.error(e);process.exitCode=1;});
