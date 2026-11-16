import type { RendererDevice } from './types';
const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
export function protocolLabel(device:RendererDevice){
 return ({dlna:'DLNA',bluos:'BluOS',cast:'Google Cast',airplay2:'AirPlay 2',slimproto:'Squeezelite'} as const)[device.protocol??'dlna'];
}
export function compareReceivers(a:RendererDevice,b:RendererDevice):number{
 return collator.compare(a.name,b.name)
  ||collator.compare(protocolLabel(a),protocolLabel(b))
  ||collator.compare(a.ip,b.ip)
  ||(a.id<b.id?-1:a.id>b.id?1:0);
}
