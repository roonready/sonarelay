import { message as runtimeMessage } from '../../shared/messages';
import { SlimController } from '../slimproto/controller';
import type { RendererDevice } from '../../shared/types';
import { Controller } from '../dlna/controller';
import { BluosController } from '../bluos/controller';
import { CastController } from '../cast/controller';
export interface ReceiverController {
 setUri(url:string,title:string,bytes?:number,mime?:string):Promise<any>;
 play():Promise<any>;
 pause():Promise<any>;
 stop():Promise<any>;
 transport():Promise<any>;
 position():Promise<any>;
 volume(value?:number):Promise<{CurrentVolume:any}>;
}
export function receiverController(device:RendererDevice,address:string):ReceiverController{
 if(device.protocol==='airplay2')throw new Error(runtimeMessage('runtime133'));
 return device.protocol==='slimproto'?new SlimController(device,address):device.protocol==='cast'?new CastController(device,address):device.protocol==='bluos'?new BluosController(device,address):new Controller(device,address);
}
