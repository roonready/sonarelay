import { ipcMain, type WebContents } from 'electron';
import { MetadataManager } from './metadata-manager';
import type { MusicMetadataSnapshot } from '../../shared/types';
export function registerMetadata(ui:WebContents,music:WebContents,onSnapshot?:(snapshot:MusicMetadataSnapshot)=>void){
 const manager=new MetadataManager(music);
 let disposed=false;
 const send=()=>{if(!disposed&&!ui.isDestroyed())ui.send('metadata:state',manager.snapshot);if(!disposed)onSnapshot?.(manager.snapshot);};
 manager.on('state',send);
 ipcMain.handle('metadata:get',event=>{
  if(disposed||event.sender!==ui)throw new Error('Forbidden');
  return manager.snapshot;
 });
 manager.start();
 return ()=>{disposed=true;manager.dispose();ipcMain.removeHandler('metadata:get');};
}
