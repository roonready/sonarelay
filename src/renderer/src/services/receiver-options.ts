import type { RendererDevice } from '../../../shared/types';
import { compareReceivers, protocolLabel } from '../../../shared/receiver-order';
export interface ReceiverOption {id:string;label:string}
export function reconcileReceiverOptions(previous:ReceiverOption[],devices:RendererDevice[]):ReceiverOption[]{
 const next=[...devices].sort(compareReceivers).map(device=>({id:device.id,label:`${device.name} (${protocolLabel(device)})`}));
 return next.length===previous.length&&next.every((option,i)=>option.id===previous[i].id&&option.label===previous[i].label)?previous:next;
}
