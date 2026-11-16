const ap=require('@sonn-audio/node-airplay');
const ip=process.argv[2]||'192.168.1.18';
(async()=>{
 const rtsp=new ap.RtspConnection(ip,7000,'capability-probe');let info;
 try{await rtsp.connect(2000);info=await ap.AirPlayConnection.readInfo(rtsp);}finally{rtsp.close();}
 const capabilities=ap.readCapabilities({features:'0x'+BigInt(info.features).toString(16),flags:String(info.statusFlags),model:String(info.model)});
 console.log('CAPABILITIES',JSON.stringify(capabilities,(_k,v)=>typeof v==='bigint'?v.toString():v));
 if(capabilities.requiresUserPairing)throw new Error('Требуется PIN pairing');
 const connection=await ap.AirPlayConnection.open({host:ip,name:'SonaRelay',timeoutMs:3000,onEvent:event=>console.log('EVENT',event)});
 try{console.log('PAIRED',connection.rtsp.isEncrypted(),(await connection.refreshInfo()).name,connection.rtsp.localAddress());}
 finally{connection.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
