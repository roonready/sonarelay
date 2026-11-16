import { message as runtimeMessage } from '../../shared/messages';
import { receiverController, type ReceiverController } from '../receivers/controller';
import { MediaServer } from '../media-server/http-server';
import { testWav } from '../audio/wav';
import type { RendererDevice, PlaybackState, PlaybackCommand } from '../../shared/types';
export class Player {
 readonly server=new MediaServer();
 private controller?: ReceiverController;
 private busy=false;
 state: PlaybackState={deviceId:'',status:runtimeMessage('runtime083'),error:'',busy:false,volume:null,httpRequests:0};
 async command(device: RendererDevice,address: string,command: PlaybackCommand,value?: number, recording?: Buffer): Promise<PlaybackState> {
  if(this.busy)throw new Error(runtimeMessage('runtime040'));
  this.busy=true;this.state.busy=true;this.state.error='';
  try {
   if(command==='test' || command==='recording') {
    if(this.controller)await this.controller.stop().catch(()=>{});
    await this.server.close();
    this.controller=receiverController(device,address);
    this.state.deviceId=device.id;
    const wav=command==='test' ? testWav() : recording;
    if(!wav)throw new Error(runtimeMessage('runtime084'));
    const url=await this.server.start(address,device.ip,wav);
    await this.controller.setUri(url,command==='test' ? runtimeMessage('runtime085') : runtimeMessage('runtime086'),wav.length);
    await this.controller.play();this.state.status=runtimeMessage('runtime087');
   } else {
    if(!this.controller || this.state.deviceId!==device.id)throw new Error(runtimeMessage('runtime088'));
    if(command==='play')await this.controller.play();
    if(command==='pause')await this.controller.pause();
    if(command==='stop'){await this.controller.stop();await this.server.close();}
    if(command==='volume') {
     if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>100)throw new Error(runtimeMessage('runtime012'));
     await this.controller.volume(value);this.state.volume=value;
    }
    const info=await this.controller.transport();this.state.status=String(info.CurrentTransportState ?? runtimeMessage('runtime043'));
   }
   if(device.capabilities?.includes('GetVolume')||device.services.some(s=>s.type.includes(':RenderingControl:')&&s.actions.includes('GetVolume'))) {
    const result=await this.controller!.volume().catch(()=>null);
    this.state.volume=result ? Number(result.CurrentVolume) : null;
   }
  } catch(error) { this.state.error=(error as Error).message; }
  finally {this.busy=false;this.state.busy=false;this.state.httpRequests=this.server.requests;}
  return {...this.state};
 }
 async dispose() {if(this.controller)await this.controller.stop().catch(()=>{});await this.server.close();}
}
