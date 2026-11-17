import { catalogId, type CatalogTrack } from '../../shared/music-catalog';

const normalized=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const titleKey=(text:string)=>normalized(text.replace(/[([][^)\]]*(?:remaster|version|edit|mix|stereo|mono)[^)\]]*[)\]]/gi,''));
function text(value:unknown){return typeof value==='string'?value.trim().slice(0,512):'';}
export function catalogImage(value:unknown,size:'300x300'|'1000x1000'):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 const uri=value.replaceAll('%%',size);
 try{
  const url=new URL(uri.startsWith('//')?'https:'+uri:uri.includes('://')?uri:'https://'+uri);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['avatars.yandex.net','avatars.mds.yandex.net'].includes(url.hostname)?url.href:null;
 }catch{return null;}
}
function artists(row:any):any[]{return Array.isArray(row?.artists)?row.artists.filter((artist:any)=>text(artist?.name)):[];}
function fullTitle(row:any){return text(row?.title)+(text(row?.version)?` (${text(row.version)})`:'');}
export function matchCatalogTrack(data:unknown,artist:string,title:string):CatalogTrack|null{
 if(!Array.isArray(data))return null;
 const artistKey=normalized(artist),trackKey=titleKey(title);
 const matches=data.filter(row=>row&&catalogId(row.id)&&titleKey(fullTitle(row))===trackKey&&
  (normalized(artists(row).map(item=>text(item.name)).join(' '))===artistKey||artists(row).some(item=>normalized(text(item.name))===artistKey)));
 const row=matches.find(row=>normalized(fullTitle(row))===normalized(title))??matches[0];
 if(!row)return null;
 const album=Array.isArray(row.albums)?row.albums.find((item:any)=>text(item?.title)):null,performers=artists(row);
 const portrait=performers.find(item=>item.cover?.type==='from-artist-photos')?.cover?.uri;
 return {id:catalogId(row.id)!,albumId:catalogId(album?.id),title:text(row.title),artist:performers.map(item=>text(item.name)).join(', '),album:text(album?.title),
  cover:catalogImage(row.coverUri??album?.coverUri,'1000x1000'),artistPicture:catalogImage(portrait,'300x300')};
}

/** Only public catalog metadata; no audio, Yandex credentials or browser session. */
export class MusicCatalog {
 private cache=new Map<string,{expires:number;track:CatalogTrack|null}>();
 private controller?:AbortController;
 private disposed=false;
 constructor(private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
 async search(artist:unknown,title:unknown):Promise<CatalogTrack|null>{
  if(typeof artist!=='string'||typeof title!=='string'||artist.length>512||title.length>512)throw new Error('catalog.unavailable');
  this.controller?.abort();
  if(this.disposed)throw new Error('catalog.unavailable');
  artist=artist.trim();title=title.trim();
  if(!artist||!title)return null;
  const key=JSON.stringify([artist,title]),cached=this.cache.get(key);
  if(cached&&cached.expires>this.now())return cached.track;
  const controller=this.controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const url=new URL('https://api.music.yandex.net/search');url.searchParams.set('text',`${artist} ${title}`);url.searchParams.set('type','track');url.searchParams.set('nocorrect','true');url.searchParams.set('page','0');
   const response=await this.fetcher(url,{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error('catalog.unavailable');
   const responseData=await response.json();
   if(responseData?.error||!responseData?.result||typeof responseData.result!=='object')throw new Error('catalog.unavailable');
   const rows=responseData.result.tracks?.results??[];
   if(!Array.isArray(rows)||controller.signal.aborted||this.disposed)throw new Error('catalog.unavailable');
   const track=matchCatalogTrack(rows,artist as string,title as string);
   this.cache.delete(key);this.cache.set(key,{track,expires:this.now()+(track?6*60*60*1000:60000)});
   while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);
   return track;
  }catch{throw new Error('catalog.unavailable');}
  finally{clearTimeout(timer);if(this.controller===controller)this.controller=undefined;}
 }
 dispose(){this.disposed=true;this.controller?.abort();this.cache.clear();}
}
