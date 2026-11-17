import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ipc } from '../services/ipc';
import { LOCAL_OUTPUT_ID } from '../services/output';
import { INITIAL_OUTPUT_VOLUME } from '../../../shared/volume';

export const useReceiverVolume=defineStore('receiver-volume',()=>{
 const deviceId=ref(''),value=ref<number|null>(null),busy=ref(false),error=ref(''),muted=ref(false);
 let revision=0;
 let selectionRevision=0,selection:Promise<void>=Promise.resolve();
 const initialized=ref(false),controlled=ref(false);
 const canStart=computed(()=>initialized.value&&!busy.value&&(!controlled.value||value.value!==null));
 function reset(id=''){revision++;selectionRevision++;deviceId.value=id;value.value=null;busy.value=false;error.value='';muted.value=false;initialized.value=false;controlled.value=false;}
 async function request(id:string,volume?:number){
  const current=++revision;
  if(deviceId.value!==id){deviceId.value=id;value.value=null;}
  busy.value=true;error.value='';
  try{
   const state=id===LOCAL_OUTPUT_ID?await ipc.windowsVolume(volume):{...await ipc.receiverVolume(id,volume),muted:false};
   if(current===revision){value.value=state.volume;muted.value=state.muted;return {...state,deviceId:id};}
  }catch(reason){if(current===revision){value.value=null;muted.value=false;error.value=String(reason);}}
  finally{if(current===revision)busy.value=false;}
 }
 function observe(id:string,volume:number|null|undefined){
  if(!busy.value&&id===deviceId.value&&typeof volume==='number'&&Number.isFinite(volume)&&volume>=0&&volume<=100)value.value=volume;
 }
 function select(id:string,canControl:boolean){
  reset(id);controlled.value=canControl;initialized.value=!canControl;
  const current=selectionRevision;
  selection=canControl?request(id,INITIAL_OUTPUT_VOLUME).then(state=>{
   if(current!==selectionRevision)return;
   if(!state||state.volume>INITIAL_OUTPUT_VOLUME){value.value=null;error.value=error.value||'volume.selectionFailed';throw new Error('volume.selectionFailed');}
   initialized.value=true;
  }):Promise.resolve();
  void selection.catch(()=>{});
  return selection;
 }
 async function ready(id:string){
  if(id!==deviceId.value)throw new Error('volume.selectionFailed');
  await selection;
  if(id!==deviceId.value||!canStart.value)throw new Error('volume.selectionFailed');
 }
 return {deviceId,value,busy,error,muted,initialized,canStart,reset,request,observe,select,ready};
});
