import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CatalogTrack } from '../../../shared/music-catalog';
import { ipc } from '../services/ipc';
export const useNowPlaying=defineStore('now-playing',()=>{
 const track=ref<CatalogTrack|null>(null),status=ref<'idle'|'loading'|'found'|'missing'|'error'>('idle');
 let revision=0;
 function clear(){revision++;track.value=null;status.value='idle';}
 async function load(artist:string,title:string){
  const current=++revision;track.value=null;
  if(!artist.trim()||!title.trim()){status.value='idle';return;}
  status.value='loading';
  try{const result=await ipc.catalogSearch(artist,title);if(current===revision){track.value=result;status.value=result?'found':'missing';}}
  catch{if(current===revision)status.value='error';}
 }
 return {track,status,clear,load};
});
