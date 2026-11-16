import { message as runtimeMessage } from '../../shared/messages';
import type { RendererDevice } from '../../shared/types';
import { soap } from './soap-client';
import { didl } from './didl';
export class Controller {
 constructor(readonly device: RendererDevice, readonly address: string) {}
 private av(action: string, values: Record<string,string|number> = {}) {
  const service = this.device.services.find(s=>s.type.includes(':AVTransport:'));
  if(!service) throw new Error(runtimeMessage('runtime081'));
  return soap(service,action,{InstanceID:0,...values},this.address);
 }
 setUri(url: string, title: string, bytes?: number, mime='audio/wav') { return this.av('SetAVTransportURI',{CurrentURI:url,CurrentURIMetaData:didl(url,title,bytes,mime)}); }
 play() { return this.av('Play',{Speed:'1'}); }
 pause() { return this.av('Pause'); }
 stop() { return this.av('Stop'); }
 transport() { return this.av('GetTransportInfo'); }
 position() { return this.av('GetPositionInfo'); }
 volume(value?: number) {
  const service = this.device.services.find(s=>s.type.includes(':RenderingControl:'));
  if(!service) throw new Error(runtimeMessage('runtime082'));
  return soap(service,value === undefined ? 'GetVolume' : 'SetVolume',{InstanceID:0,Channel:'Master',...(value === undefined ? {} : {DesiredVolume:Math.round(Math.max(0,Math.min(100,value)))})},this.address);
 }
}
