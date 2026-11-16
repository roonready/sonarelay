import { message as runtimeMessage } from '../../shared/messages';
﻿import http from 'node:http';
import { isIPv4 } from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false});
export async function bluosRequest(ip:string,port:number,address:string,endpoint:string,parameters:Record<string,string|number>={},timeout=5000):Promise<any>{
 if(!isIPv4(ip)||!Number.isInteger(port)||port<1||port>65535)throw new Error(runtimeMessage('runtime045'));
 if(!['SyncStatus','Status','Play','Pause','Stop','Volume'].includes(endpoint))throw new Error(runtimeMessage('runtime046'));
 const url=new URL(`http://${ip}:${port}/${endpoint}`);
 for(const [key,value] of Object.entries(parameters))url.searchParams.set(key,String(value));
 return new Promise((resolve,reject)=>{
  const request=http.get(url,{localAddress:address,timeout},response=>{
   if(response.statusCode!==200){response.resume();reject(new Error(`BluOS ${endpoint}: HTTP ${response.statusCode}`));return;}
   const chunks:Buffer[]=[];let bytes=0;
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024)request.destroy(new Error(runtimeMessage('runtime047')));else chunks.push(chunk);});
   response.on('error',reject);
   response.on('end',()=>{
    try{
     const xml=Buffer.concat(chunks).toString('utf8');
     if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error(runtimeMessage('runtime048'));
     const result=parser.parse(xml);
     if(result.error||result.Error)throw new Error(`BluOS ${endpoint}: ${JSON.stringify(result.error??result.Error)}`);
     resolve(result);
    }catch(error){reject(error);}
   });
  });
  const deadline=setTimeout(()=>request.destroy(new Error(runtimeMessage('runtime049', {p0: endpoint}))),timeout);
  request.on('close',()=>clearTimeout(deadline));
  request.on('timeout',()=>request.destroy(new Error(runtimeMessage('runtime049', {p0: endpoint}))));
  request.on('error',reject);
 });
}
export function xmlText(value:any):string{
 return typeof value==='object'&&value!==null?String(value['#text']??''):String(value??'');
}
