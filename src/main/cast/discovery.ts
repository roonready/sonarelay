import multicastDns from 'multicast-dns';
import type { RendererDevice } from '../../shared/types';
import { probeCast } from './probe';
export interface CastAdvertisement{ip:string;port:number;name:string;model:string;id:string}
export function castAdvertisements(records:any[],address:string,netmask:string):CastAdvertisement[]{
 const local=address.split('.').map(Number),mask=netmask.split('.').map(Number);
 const output:CastAdvertisement[]=[];
 for(const srv of records.filter(record=>record.type==='SRV'&&String(record.name).toLowerCase().endsWith('._googlecast._tcp.local'))){
  const a=records.find(record=>record.type==='A'&&record.name===srv.data?.target);
  if(!a||!/^\d+\.\d+\.\d+\.\d+$/.test(a.data))continue;
  if(!a.data.split('.').map(Number).every((value:number,i:number)=>(value&mask[i])===(local[i]&mask[i])))continue;
  const txt=records.find(record=>record.type==='TXT'&&record.name===srv.name);
  const values:Record<string,string>={};
  for(const raw of txt?.data??[]){const text=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw);const index=text.indexOf('=');if(index>0)values[text.slice(0,index)]=text.slice(index+1);}
  const port=Number(srv.data.port);if(!Number.isInteger(port)||port<1||port>65535)continue;
  output.push({ip:a.data,port,name:values.fn??'',model:values.md??'',id:values.id??''});
 }
 return output;
}
export function discoverCast(address:string,netmask:string,peers:string[],isCancelled:()=>boolean,onDevice:(device:RendererDevice)=>void,onDone:()=>void):()=>void{
 const mdns=multicastDns({interface:address,bind:'0.0.0.0',reuseAddr:true});
 let closed=false,active=0,accepting=true,completed=false;
 const closeMdns=()=>{try{mdns.destroy();}catch{/* Socket can already be closed after a bind/interface error. */}};
 const seen=new Set<string>(),queue:CastAdvertisement[]=[],records=new Map<string,any>();
 const checkDone=()=>{if(!closed&&!accepting&&!active&&!queue.length&&!completed){completed=true;onDone();}};
 const pump=()=>{
  if(closed||isCancelled())return;
  while(active<6&&queue.length){
   const target=queue.shift()!;active++;
   void probeCast(target.ip,address,target).then(device=>{if(!closed&&!isCancelled())onDevice(device);}).catch(()=>{}).finally(()=>{active--;pump();checkDone();});
  }
 };
 const add=(target:CastAdvertisement)=>{
  const key=target.ip+':'+target.port;if(seen.has(key)||seen.size>=64)return;seen.add(key);queue.push(target);pump();
 };
 mdns.on('response',(packet:any)=>{
  if(closed||!accepting||isCancelled())return;
  for(const record of [...(packet.answers??[]),...(packet.additionals??[])]){
   const key=record.type+':'+record.name;
   if(record.ttl===0)records.delete(key);else if(records.size<512||records.has(key))records.set(key,record);
  }
  for(const target of castAdvertisements([...records.values()],address,netmask))add(target);
 });
 mdns.on('error',()=>{});mdns.on('warning',()=>{});
 const query=()=>{if(!closed&&accepting&&!isCancelled())mdns.query('_googlecast._tcp.local','PTR');};
 mdns.on('ready',query);
 const retry=setTimeout(query,1500);
 const searchEnd=setTimeout(()=>{accepting=false;closeMdns();checkDone();},6000);
 // Explicit LAN neighbors also work when multicast is blocked by VPN/router.
 for(const ip of peers)add({ip,port:8009,name:'',model:'',id:''});
 return ()=>{if(closed)return;closed=true;clearTimeout(retry);clearTimeout(searchEnd);queue.length=0;if(accepting)closeMdns();accepting=false;};
}
