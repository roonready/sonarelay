import { EventEmitter } from 'node:events';
import type { AudioSource } from './audio-source';
export class YandexMusicSource implements AudioSource {
 private readonly events=new EventEmitter();
 private running=false;
 async start(){this.running=true;}
 async stop(){this.running=false;this.events.removeAllListeners();}
 onAudioData(callback:(pcm:Buffer)=>void){this.events.on('pcm',callback);}
 push(pcm: Buffer){if(this.running)this.events.emit('pcm',pcm);}
}
