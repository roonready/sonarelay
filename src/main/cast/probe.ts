import { message as runtimeMessage } from '../../shared/messages';
﻿import http from 'node:http';
import type { RendererDevice } from '../../shared/types';
import { CastLink, castLibrary } from './link';
export async function castInfo(ip:string,address:string):Promise<any>{
 return new Promise(resolve=>{
  const request=http.get({host:ip,port:8008,path:'/setup/eureka_info?params=name,device_info',localAddress:address,timeout:1000},response=>{
   if(response.statusCode!==200){response.resume();resolve({});return;}
   let body='';response.on('data',chunk=>{body+=chunk;if(body.length>65536)request.destroy();});
   response.on('end',()=>{try{resolve(JSON.parse(body));}catch{resolve({});}});response.on('error',()=>resolve({}));
  });request.on('timeout',()=>request.destroy());request.on('error',()=>resolve({}));
 });
}
export async function probeCast(ip:string,address:string,advertised:{port?:number;name?:string;model?:string;id?:string}={}):Promise<RendererDevice>{
 const link=new CastLink();
 try{
  await link.open(ip,advertised.port??8009,address,1800);
  const status=await link.call('GET_STATUS',cb=>link.client.getStatus(cb),1800);
  const availability=await link.call<any>('GET_APP_AVAILABILITY',cb=>link.client.getAppAvailability(castLibrary().DefaultMediaReceiver.APP_ID,cb),1800);
  if(!availability[castLibrary().DefaultMediaReceiver.APP_ID])throw new Error(runtimeMessage('runtime068'));
  const info=await castInfo(ip,address);
  const capabilities=['Play','Pause','Stop','GetTransportInfo','GetPositionInfo','GetVolume'];
  if(status.volume?.controlType!=='fixed')capabilities.push('SetVolume');
  return {id:`cast:${String(advertised.id||info.ssdp_udn||ip).replace(/-/g,'').toLowerCase()}:${advertised.port??8009}`,protocol:'cast',apiPort:advertised.port??8009,capabilities,
   name:advertised.name||info.name||`Google Cast (${ip})`,manufacturer:info.device_info?.manufacturer??'Google Cast',
   model:advertised.model||info.device_info?.model_name||info.name||'Cast receiver',ip,
   location:`cast://${ip}:${advertised.port??8009}`,services:[],usn:'',st:'_googlecast._tcp.local',server:'Cast V2',expiresAt:Date.now()+120000,status:'available'};
 }finally{link.close();}
}
