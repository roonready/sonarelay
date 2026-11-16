const airplay=require('@sonn-audio/node-airplay');
const ip=process.argv[2]||'192.168.1.18';
(async()=>{
 const rtsp=new airplay.RtspConnection(ip,7000,'SonaRelay-probe');
 try{
  await rtsp.connect(2000);const info=await airplay.AirPlayConnection.readInfo(rtsp);
  console.log(JSON.stringify({localAddress:rtsp.localAddress(),info},(_key,value)=>typeof value==='bigint'?value.toString():value,2));
 }finally{rtsp.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
