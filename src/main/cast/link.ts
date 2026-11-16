import { message as runtimeMessage } from '../../shared/messages';
﻿import { createRequire } from 'node:module';
// Keep cast_channel.proto next to the external castv2 dependency at runtime.
export const castLibrary=()=>createRequire(__filename)('castv2-client') as {Client:new()=>any;DefaultMediaReceiver:any};
export class CastLink {
 readonly client:any;
 private closed=false;
 private connected=false;
 private waiters=new Set<(error:Error)=>void>();
 constructor(){
  const library=castLibrary();this.client=new library.Client();
  this.client.on('error',(error:Error)=>{for(const fail of [...this.waiters])fail(error);this.close();});
 }
 call<T=any>(label:string,invoke:(callback:(error:Error|null,value?:T)=>void)=>void,timeout=10000):Promise<T>{
  if(this.closed)return Promise.reject(new Error(runtimeMessage('runtime065')));
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error:Error|null,value?:T)=>{if(settled)return;settled=true;clearTimeout(timer);this.waiters.delete(fail);if(error)reject(error);else resolve(value as T);};
   const fail=(error:Error)=>finish(error);
   const timer=setTimeout(()=>{finish(new Error(runtimeMessage('runtime066', {p0: label})));this.close();},timeout);
   this.waiters.add(fail);
   try{invoke(finish);}catch(error){finish(error as Error);}
  });
 }
 async open(ip:string,port:number,address:string,timeout=3000){
  await this.call('connect',callback=>this.client.connect({host:ip,port,localAddress:address},()=>callback(null)),timeout);
  this.connected=true;
  this.client.client?.once('close',()=>{this.connected=false;for(const fail of [...this.waiters])fail(new Error(runtimeMessage('runtime067')));});
 }
 get isConnected(){return this.connected&&!this.closed;}
 close(){
  if(this.closed)return;this.closed=true;this.connected=false;
  for(const fail of [...this.waiters])fail(new Error(runtimeMessage('runtime065')));
  const socket=this.client.client?.socket;
  if(socket&&!socket.destroyed)socket.destroy();
 }
}
