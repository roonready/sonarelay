import catalog from '../../shared/locales/ru.json';
import { message as runtimeMessage } from '../../shared/messages';
﻿import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import type { MusicMetadataSnapshot } from '../../shared/types';
import { readMusicMetadata } from './read-metadata';
export class MetadataManager extends EventEmitter {
 snapshot:MusicMetadataSnapshot={fields:[],artwork:null,updatedAt:0,error:''};
 private timer?:NodeJS.Timeout;
 private busy=false;
 private disposed=false;
 constructor(private readonly contents:WebContents){super();}
 start(){if(this.timer||this.disposed)return;this.timer=setInterval(()=>{void this.refresh();},1000);void this.refresh();}
 async refresh(){
  if(this.disposed||this.busy||this.contents.isDestroyed())return;
  const page=this.contents.getURL();
  let allowed=false;
  try{const url=new URL(page);allowed=url.protocol==='https:'&&(url.hostname==='music.yandex.ru'||url.hostname.endsWith('.music.yandex.ru'));}catch{/* Not a music page. */}
  if(!allowed){this.snapshot={fields:[],artwork:null,updatedAt:Date.now(),error:runtimeMessage('runtime130')};this.emit('state',this.snapshot);return;}
  this.busy=true;
  try{
   const result=await this.contents.executeJavaScript(`(${readMusicMetadata.toString()})(${JSON.stringify(catalog)})`);
   if(this.disposed||this.contents.isDestroyed()||this.contents.getURL()!==page)return;
   if(!result||!Array.isArray(result.fields))throw new Error(runtimeMessage('runtime131'));
   this.snapshot={fields:result.fields.slice(0,64),artwork:result.artwork??null,playback:result.playback,updatedAt:Date.now(),error:''};
   this.emit('state',this.snapshot);
  }catch(error){
   if(!this.disposed){this.snapshot={fields:[],artwork:null,updatedAt:Date.now(),error:runtimeMessage('runtime132', {p0: (error as Error).message})};this.emit('state',this.snapshot);}
  }finally{this.busy=false;}
 }
 dispose(){this.disposed=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;this.removeAllListeners();}
}
