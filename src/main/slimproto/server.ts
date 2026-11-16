import { message as runtimeMessage } from '../../shared/messages';
import net from 'node:net';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import type { SlimClient } from '@sonn-audio/node-slimproto';
import type { RendererDevice } from '../../shared/types';
import { isIPv4 } from 'node:net';
function sameSubnet(ip:string,address:string,mask:string){return isIPv4(ip)&&ip.split('.').map(Number).every((n,i)=>(n&Number(mask.split('.')[i]))===(Number(address.split('.')[i])&Number(mask.split('.')[i])));}
const registry=new Map<string,SlimClient>();
export function slimPlayer(id:string){const player=registry.get(id);if(!player?.connected)throw new Error(runtimeMessage('runtime140'));return player;}
export function slimDiscoveryReply(request:Buffer,address:string):Buffer|undefined{
 if(request.length>1450)return;
 if(request[0]===100){const reply=Buffer.alloc(18);reply.write('DSonaRelay','ascii');return reply;}
 if(request[0]!==101)return;
 const fields:Record<string,string>={NAME:'SonaRelay',IPAD:address,VERS:'7.999.999',UUID:'SonaRelay-slimproto'};
 const parts:Buffer[]=[Buffer.from('E')];
 for(let offset=1;offset<request.length;){
  if(offset+5>request.length)return;
  const key=request.toString('ascii',offset,offset+4),length=request[offset+4];offset+=5;
  if(offset+length>request.length)return;offset+=length;
  if(fields[key]){const value=Buffer.from(fields[key]);parts.push(Buffer.from(key),Buffer.from([value.length]),value);}
 }return Buffer.concat(parts);
}
export class SlimBridge extends EventEmitter {
 private tcp?:net.Server;private udp?:dgram.Socket;
 private sockets=new Set<net.Socket>();private clients=new Set<SlimClient>();
 private address='';private netmask='';private revision=0;private disposed=false;
 private operation:Promise<void>=Promise.resolve();
 constructor(private controlPort=3483){super();}
 get port(){const info=this.tcp?.address();return info&&typeof info!=='string'?info.port:this.controlPort;}
 get devices():RendererDevice[]{return [...this.clients].filter(p=>p.connected&&p.playerId).map(player=>({
  id:`slimproto:${player.playerId}`,protocol:'slimproto',slimPlayerId:player.playerId,
  name:player.name||'Squeezelite',manufacturer:'Squeezelite',model:player.deviceType,ip:player.deviceAddress!,
  location:`slimproto://${this.address}:${this.port}`,services:[],capabilities:['Play','Pause','Stop','GetTransportInfo','GetPositionInfo'],
  usn:'',st:'SlimProto',server:'SonaRelay',expiresAt:Date.now()+90000,status:'available',
 }));}
 start(address:string,netmask:string):Promise<void>{
  const revision=++this.revision;
  this.operation=this.operation.catch(()=>{}).then(async()=>{
   if(this.disposed||revision!==this.revision)return;
   if(this.tcp&&this.address===address&&this.netmask===netmask)return;
   await this.close();if(this.disposed||revision!==this.revision)return;
   this.address=address;this.netmask=netmask;
   const tcp=net.createServer(socket=>this.accept(socket));this.tcp=tcp;
   tcp.on('error',error=>this.emit('diagnostic',`SlimProto TCP: ${error.message}`));
   try{
    await new Promise<void>((resolve,reject)=>{tcp.once('error',reject);tcp.listen(this.controlPort,address,()=>{tcp.off('error',reject);resolve();});});
    if(this.disposed||revision!==this.revision){await this.close();return;}
    const udp=dgram.createSocket('udp4');this.udp=udp;
    udp.on('error',error=>this.emit('diagnostic',`SlimProto UDP: ${error.message}`));
    udp.on('message',(request,remote)=>{if(!sameSubnet(remote.address,address,netmask))return;const response=slimDiscoveryReply(request,address);if(response)udp.send(response,remote.port,remote.address,()=>{});});
    await new Promise<void>((resolve,reject)=>{udp.once('error',reject);udp.bind(this.port,'0.0.0.0',()=>{udp.off('error',reject);resolve();});});
    this.emit('changed');
   }catch(error){await this.close();throw new Error(runtimeMessage('runtime141', {p0: address, p1: (error as Error).message}));}
  });return this.operation;
 }
 private accept(socket:net.Socket){
  if(this.disposed||!sameSubnet(socket.remoteAddress??'',this.address,this.netmask)||this.sockets.size>=16){socket.destroy();return;}
  this.sockets.add(socket);socket.setNoDelay(true);socket.setTimeout(15000,()=>socket.destroy());
  const {SlimClient}=createRequire(__filename)('@sonn-audio/node-slimproto') as typeof import('@sonn-audio/node-slimproto');
  const client=new SlimClient(socket,(player,event)=>{
   if(event==='player_connected'){
    const existing=registry.get(player.playerId);if(existing&&existing!==player){existing.disconnect();}
    registry.set(player.playerId,player);socket.setTimeout(0);
   }
   if(event==='player_decoder_error')this.emit('diagnostic',runtimeMessage('runtime142', {p0: player.name}));
   this.emit('changed');
  });this.clients.add(client);
  // The dependency launches these asynchronous handlers from EventEmitter.
  // Contain failures per connection, including malformed/partial handshakes.
  const internal=client as any;
  for(const method of ['processHelo','processStat','processResp']){
   const original=internal[method].bind(client);internal[method]=(...args:any[])=>Promise.resolve().then(()=>original(...args)).then(()=>{if(socket.destroyed)client.disconnect();}).catch((error:Error)=>{this.emit('diagnostic',`Squeezelite: ${error.message}`);socket.destroy();});
  }
  const onData=internal.onData.bind(client);
  internal.onData=(data:Buffer)=>{try{if(internal.buffer.length+data.length>1024*1024)throw new Error(runtimeMessage('runtime143'));onData(data);}catch(error){this.emit('diagnostic',(error as Error).message);socket.destroy();}};
  // A live FLAC stream has no finite file to prebuffer. Keep receiver buffering
  // bounded even during compressed silence; no change to codec or PCM samples.
  const sendStrm=internal.sendStrm.bind(client);internal.sendStrm=(options:any)=>sendStrm(options.command==='s'?{...options,threshold:1,outputThreshold:5}:options);
  socket.on('close',()=>{this.sockets.delete(socket);this.clients.delete(client);if(registry.get(client.playerId)===client)registry.delete(client.playerId);this.emit('changed');});
 }
 private async close(){
  for(const client of this.clients){if(registry.get(client.playerId)===client)registry.delete(client.playerId);client.disconnect();}
  for(const socket of this.sockets)socket.destroy();this.sockets.clear();this.clients.clear();
  const udp=this.udp;this.udp=undefined;if(udp)try{udp.close();}catch{}
  const tcp=this.tcp;this.tcp=undefined;if(tcp)await new Promise<void>(resolve=>tcp.close(()=>resolve()));
 }
 async stop(){this.disposed=true;this.revision++;await this.operation.catch(()=>{});await this.close();}
}
