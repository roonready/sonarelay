import { message as runtimeMessage } from '../../shared/messages';
import multicastDns from 'multicast-dns';
﻿import { randomBytes } from 'node:crypto';
import type { RendererDevice } from '../../shared/types';
import { airplayLibrary } from './library';
export function airplayAdvertisements(records:any[],address:string,netmask:string):{ip:string;port:number}[]{
 const local=address.split('.').map(Number),mask=netmask.split('.').map(Number);
 return records.filter(r=>r.type==='SRV'&&String(r.name).toLowerCase().endsWith('._airplay._tcp.local')).flatMap(srv=>{
  const record=records.find(r=>r.type==='A'&&String(r.name).toLowerCase()===String(srv.data?.target).toLowerCase());
  const ip=String(record?.data??''),octets=ip.split('.').map(Number),port=Number(srv.data?.port);
  if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255)||!octets.every((n,i)=>(n&mask[i])===(local[i]&mask[i]))||ip===address||!Number.isInteger(port)||port<1||port>65535)return [];
  return [{ip,port}];
 });
}
export async function probeAirplay2(ip:string,address:string,port=7000):Promise<RendererDevice>{
 const ap=airplayLibrary(),rtsp=new ap.RtspConnection(ip,port,randomBytes(4).toString('hex'));
 try{
  await rtsp.connect(1500);
  if(rtsp.localAddress()!==address)throw new Error(runtimeMessage('runtime001'));
  const info=await ap.AirPlayConnection.readInfo(rtsp);
  if(!info.features||!info.deviceID||!info.model)throw new Error(runtimeMessage('runtime002'));
  const capabilities=ap.readCapabilities({features:'0x'+BigInt(info.features as number|bigint).toString(16),flags:String(info.statusFlags??0),model:String(info.model)});
  if(!capabilities.supportsAirPlay2)throw new Error(runtimeMessage('runtime003'));
  return {id:`airplay2:${String(info.deviceID).replace(/[:-]/g,'').toLowerCase()}`,protocol:'airplay2',apiPort:port,
   name:String(info.name??info.model),manufacturer:String(info.manufacturer??'AirPlay'),model:String(info.model),ip,
   location:`airplay://${ip}:${port}`,services:[],capabilities:['Play','Pause','Stop','GetTransportInfo','GetVolume','SetVolume'],
   airplayPairingRequired:capabilities.requiresUserPairing,airplayTiming:capabilities.supportsPtp?'ptp':'ntp',
   usn:'',st:'_airplay._tcp.local',server:String(info.sourceVersion??'AirPlay 2'),expiresAt:Date.now()+120000,status:'available'};
 }finally{rtsp.close();}
}
export async function discoverAirplay2(peers:string[],address:string,isCancelled:()=>boolean,netmask?:string):Promise<RendererDevice[]>{
 const devices:RendererDevice[]=[];let index=0;
 const mdnsScan=netmask?new Promise<void>(resolve=>{
  const mdns=multicastDns({interface:address,bind:'0.0.0.0',reuseAddr:true});
  const records=new Map<string,any>(),seen=new Set<string>(),pending:Promise<void>[]=[];
  let closed=false;
  mdns.on('error',()=>{});mdns.on('warning',()=>{});
  const query=()=>{if(!closed&&!isCancelled())mdns.query('_airplay._tcp.local','PTR');};
  mdns.on('ready',query);
  mdns.on('response',(packet:any)=>{
   if(closed||isCancelled())return;
   for(const record of [...(packet.answers??[]),...(packet.additionals??[])]){
    const key=record.type+':'+record.name;if(record.ttl===0)records.delete(key);else if(records.size<512||records.has(key))records.set(key,record);
   }
   for(const target of airplayAdvertisements([...records.values()],address,netmask)){
    const key=target.ip+':'+target.port;if(seen.has(key)||seen.size>=32)continue;seen.add(key);
    pending.push(probeAirplay2(target.ip,address,target.port).then(device=>{if(!isCancelled())devices.push(device);}).catch(()=>{}));
   }
  });
  const retry=setTimeout(query,1500);
  setTimeout(()=>{closed=true;clearTimeout(retry);try{mdns.destroy();}catch{}void Promise.all(pending).then(()=>resolve());},6000);
 }):Promise.resolve();
 await Promise.all(Array.from({length:Math.min(6,peers.length)},async()=>{
  while(index<peers.length&&!isCancelled()){
   const ip=peers[index++];
   try{const device=await probeAirplay2(ip,address);if(!isCancelled())devices.push(device);}catch{/* Only confirmed native AirPlay 2 devices are listed. */}
  }
 }));await mdnsScan;return [...new Map(devices.map(device=>[device.id,device])).values()];
}
