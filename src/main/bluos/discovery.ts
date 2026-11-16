import { message as runtimeMessage } from '../../shared/messages';
﻿import type { RendererDevice } from '../../shared/types';
import { bluosRequest } from './client';
export async function probeBluos(ip:string,address:string,port=11000,timeout=1500):Promise<RendererDevice>{
 const result=await bluosRequest(ip,port,address,'SyncStatus',{},timeout);
 const sync=result.SyncStatus;
 if(!sync||!sync['@_name']||!sync['@_modelName']||!sync['@_mac'])throw new Error(runtimeMessage('runtime056'));
 if(sync['@_initialized']==='false')throw new Error(runtimeMessage('runtime057'));
 const capabilities=['Play','Pause','Stop','GetTransportInfo','GetPositionInfo','GetVolume'];
 if(Number(sync['@_volume'])>=0)capabilities.push('SetVolume');
 return {id:`bluos:${String(sync['@_mac']).toLowerCase()}:${port}`,protocol:'bluos',apiPort:port,
  name:String(sync['@_name']),manufacturer:String(sync['@_brand']??'BluOS'),model:String(sync['@_modelName']),ip,
  location:`http://${ip}:${port}/SyncStatus`,services:[],capabilities,usn:'',st:'',server:'BluOS HTTP API',expiresAt:Date.now()+90000,status:'available'};
}
export async function discoverBluos(peers:string[],address:string,isCancelled:()=>boolean):Promise<RendererDevice[]>{
 const devices:RendererDevice[]=[];let index=0;
 await Promise.all(Array.from({length:Math.min(8,peers.length)},async()=>{
  while(index<peers.length&&!isCancelled()){
   const ip=peers[index++];
   try{const device=await probeBluos(ip,address);if(!isCancelled())devices.push(device);}catch{/* Only confirmed BluOS responses are devices. */}
  }
 }));
 return devices;
}
