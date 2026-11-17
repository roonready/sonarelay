import type { RendererDevice } from '../../shared/types';
import { receiverController } from './controller';

function supports(device:RendererDevice,action:string){return device.capabilities?.includes(action)||device.services.some(service=>service.actions.includes(action));}
export function readVolume(raw:unknown){
 if((typeof raw!=='number'&&typeof raw!=='string')||(typeof raw==='string'&&!raw.trim()))throw new Error('volume.unavailable');
 const value=Number(raw);
 if(!Number.isFinite(value)||value<0||value>100)throw new Error('volume.unavailable');
 return value;
}

/** Volume-only requests must never set a media URI, start playback or stop another source. */
export async function receiverVolume(device:RendererDevice,devices:RendererDevice[],address:string,value?:number,factory=receiverController):Promise<number>{
 if(value!==undefined&&(!Number.isFinite(value)||value<0||value>100))throw new Error('volume.invalid');
 const action=value===undefined?'GetVolume':'SetVolume';
 if(!supports(device,action)||!supports(device,'GetVolume'))throw new Error('volume.unsupported');
 // AirPlay volume commands need an active RTSP session. Before playback, use
 // the same physical receiver's DLNA/BluOS/Cast control API without creating one.
 const target=device.protocol==='airplay2'?devices.find(candidate=>candidate.ip===device.ip&&candidate.protocol!=='airplay2'&&candidate.protocol!=='slimproto'&&supports(candidate,action)&&supports(candidate,'GetVolume')):device;
 if(!target)throw new Error('volume.beforePlaybackUnavailable');
 const controller=factory(target,address);
 try{
  if(value!==undefined)await controller.volume(value);
  const response=await controller.volume();
  return readVolume(response.CurrentVolume);
 }finally{
  // A volume-only Cast connection owns no media session; this closes its socket
  // without issuing STOP. DLNA and BluOS requests have no persistent connection.
  if(target.protocol==='cast')await controller.stop();
 }
}
