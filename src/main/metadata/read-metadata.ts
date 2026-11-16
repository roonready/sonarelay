import type { MusicMetadataSnapshot } from '../../shared/types';
/** Runs read-only in the music page's main world. Keep all runtime helpers local. */
export function readMusicMetadata(catalog: Record<string,string> = {}):Omit<MusicMetadataSnapshot,'updatedAt'|'error'>{
 const message=(key:string,params:Record<string,unknown>={})=>(catalog[key]??key).replace(/\{(\w+)\}/g,(_,name:string)=>String(params[name]??''));
 const fields:MusicMetadataSnapshot['fields']=[];
 const clean=(value:unknown):string=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,2000):'';
 const url=(value:unknown)=>{
  const raw=clean(value);if(!raw)return '';
  try{const parsed=new URL(raw,location.href);return parsed.protocol==='https:'?parsed.href:'';}catch{return '';}
 };
 const visible=(element:Element)=>element.getClientRects().length>0;
 const scopeSelectors=['[aria-label="Плеер"]','[data-test-id="PLAYERBAR"]','[class*="PlayerBar_root"]','[class*="PlayerBarDesktop"]','[class*="FullscreenPlayerDesktop"]'];
 let scope:Element|null=null,scopeSource='';
 for(const selector of scopeSelectors){scope=[...document.querySelectorAll(selector)].find(visible)??null;if(scope){scopeSource=selector;break;}}
 const text=(selectors:string[])=>{
  if(!scope)return {value:'',selector:''};
  for(const selector of selectors){const element=[...scope.querySelectorAll(selector)].find(visible);const value=clean(element?.textContent);if(value)return {value,selector};}
  return {value:'',selector:''};
 };
 const field=(id:string,label:string,value:unknown,source:string,detail:string)=>{
  const normalized=clean(value);fields.push({id,label,value:normalized||null,source:normalized?source:null,detail});
 };
 const session=navigator.mediaSession;
 const metadata=session?.metadata;
 const domTitle=text(['[class*="Track_title"]','[class*="TrackTitle"]','[class*="PlayerBarDesktop_title"]','[class*="FullscreenPlayerDesktop_title"]','a[href*="/track/"]']);
 const domArtist=text(['a[href*="/artist/"]']);
 if(scope){
  const names=[...scope.querySelectorAll('a[href*="/artist/"]')].filter(visible).map(element=>clean(element.textContent)).filter(Boolean);
  if(names.length)domArtist.value=[...new Set(names)].join(', ');
 }
 const domAlbum=text(['a[href*="/album/"]:not([href*="/track/"])']);
 function primary(id:string,label:string,apiValue:unknown,dom:{value:string;selector:string},property:string){
  if(clean(apiValue))field(id,label,apiValue,'Media Session API',`navigator.mediaSession.metadata.${property}`);
  else field(id,label,dom.value,message('metadataText001'),dom.value?`${scopeSource} → ${dom.selector}`:message('metadataText002'));
 }
 primary('title',message('metadataText003'),metadata?.title,domTitle,'title');
 primary('artist',message('metadataText004'),metadata?.artist,domArtist,'artist');
 primary('album',message('metadataText005'),metadata?.album,domAlbum,'album');
 for(const [id,label,dom] of [['dom-title',message('metadataText006'),domTitle],['dom-artist',message('metadataText007'),domArtist],['dom-album',message('metadataText008'),domAlbum]] as const){
  if(dom.value)field(id,label,dom.value,message('metadataText001'),`${scopeSource} → ${dom.selector}`);
 }
 const chapters=(metadata as (MediaMetadata&{chapterInfo?:{title?:string;startTime?:number}[]})|null|undefined)?.chapterInfo;
 if(Array.isArray(chapters)&&chapters.length)field('chapters',message('metadataText009'),chapters.slice(0,50).map(chapter=>`${clean(chapter.title)} (${time(chapter.startTime??null)})`).join('; '),'Media Session API','navigator.mediaSession.metadata.chapterInfo');
 const artwork=(metadata?.artwork??[]).map(image=>({src:url(image.src),sizes:clean(image.sizes),type:clean(image.type)})).filter(image=>image.src);
 let cover=artwork[0]?.src??'';
 if(cover)field('artwork',message('metadataText010'),cover,'Media Session API','navigator.mediaSession.metadata.artwork[0].src');
 else {
  const image=scope?.querySelector('img');cover=url(image?.getAttribute('src')??'');
  field('artwork',message('metadataText010'),cover,message('metadataText001'),cover?`${scopeSource} → img.src`:message('metadataText011'));
 }
 for(let i=0;i<artwork.length;i++)field(`artwork-${i}`,message('metadataText012')+(i+1),[artwork[i].src,artwork[i].sizes,artwork[i].type].filter(Boolean).join(' · '),'Media Session API',`navigator.mediaSession.metadata.artwork[${i}]`);
 const allMedia=[...document.querySelectorAll<HTMLMediaElement>('audio,video')].filter(element=>element.readyState>0||element.currentSrc);
 const media=allMedia.find(element=>element.tagName==='AUDIO'&&!element.paused&&!element.ended)??allMedia.find(element=>!element.paused&&!element.ended)??allMedia.find(element=>element.tagName==='AUDIO')??allMedia[0];
 const mediaSource=media?`HTMLMediaElement · <${media.tagName.toLowerCase()}>`:'';
 let playback=clean(session?.playbackState);
 if(playback && playback!=='none')field('playback',message('metadataText013'),playback,'Media Session API','navigator.mediaSession.playbackState');
 else if(media)field('playback',message('metadataText013'),media.ended?'ended':media.paused?'paused':'playing',mediaSource,'paused / ended');
 else {
  const pause=scope?.querySelector('[aria-label="Пауза"]');
  const play=scope?.querySelector('[aria-label="Воспроизведение"]');
  playback=pause?'playing':play?'paused':'';
  field('playback',message('metadataText013'),playback,message('metadataText001'),playback?message('metadataText016', {p0: scopeSource, p1: pause?message('metadataText014'):message('metadataText015')}):message('metadataText017'));
 }
 const slider=scope?.querySelector('[aria-label*="таймкод"]');
 const numeric=(value:unknown)=>{if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=0?number:null;};
 const sliderPosition=numeric(slider?.getAttribute('aria-valuenow')??(slider as HTMLInputElement|null)?.value);
 const sliderDuration=numeric(slider?.getAttribute('aria-valuemax')??(slider as HTMLInputElement|null)?.max);
 const duration=media&&Number.isFinite(media.duration)&&media.duration>0?media.duration:sliderDuration!==null&&sliderDuration>1?sliderDuration:null;
 const position=media&&Number.isFinite(media.currentTime)?media.currentTime:sliderDuration!==null&&sliderDuration>1?sliderPosition:null;
 function time(value:number|null){
  if(value===null)return '';
  const seconds=Math.max(0,Math.floor(value)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
  return `${hours?hours+':':''}${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 };
 const durationSource=media&&Number.isFinite(media.duration)&&media.duration>0?mediaSource:message('metadataText001');
 const positionSource=media&&Number.isFinite(media.currentTime)?mediaSource:message('metadataText001');
 field('duration',message('metadataText018'),time(duration),durationSource,durationSource===mediaSource?'duration':message('metadataText021', {p0: scopeSource||message('metadataText020')}));
 field('position',message('metadataText019'),time(position),positionSource,positionSource===mediaSource?'currentTime':message('metadataText022', {p0: scopeSource||message('metadataText020')}));
 field('remaining',message('metadataText023'),duration!==null&&position!==null?time(Math.max(0,duration-position)):'',message('metadataText024'),message('metadataText025', {p0: durationSource, p1: positionSource}));
 field('rate',message('metadataText026'),media?`${media.playbackRate}×`:'',mediaSource,'playbackRate');
 field('volume',message('metadataText027'),media?`${Math.round(media.volume*100)} %`:'',mediaSource,message('metadataText028'));
 field('muted',message('metadataText029'),media?(media.muted?message('metadataText030'):message('metadataText031')):'',mediaSource,message('metadataText032'));
 field('ready',message('metadataText033'),media?[message('metadataText034'),message('metadataText035'),message('metadataText036'),message('metadataText037'),message('metadataText038')][media.readyState]:'',mediaSource,'readyState');
 const findLink=(kind:string)=>{
  const links=[...(scope?.querySelectorAll<HTMLAnchorElement>(`a[href*="/${kind}/"]`)??[])];
  if(kind==='track'){
   const inScope=links.find(link=>clean(link.textContent)===clean(metadata?.title))??links[0];
   if(inScope)return {value:url(inScope.href),selector:`${scopeSource} → a[href*="/track/"]`};
   const title=clean(metadata?.title);
   const match=title?[...document.querySelectorAll<HTMLAnchorElement>('a[href*="/track/"]')].find(link=>visible(link)&&clean(link.textContent)===title):undefined;
   if(match)return {value:url(match.href),selector:message('metadataText039')};
  }
  return {value:links.map(link=>url(link.href)).filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join('\n'),selector:message('metadataText058', {p0: scopeSource||message('metadataText020'), p1: kind})};
 };
 const track=findLink('track'),album=findLink('album'),artists=findLink('artist');
 field('track-url',message('metadataText040'),track.value,message('metadataText001'),track.selector);
 field('album-url',message('metadataText041'),album.value.split('\n').filter(value=>!value.includes('/track/')).join('\n'),message('metadataText001'),album.selector);
 field('artist-url',message('metadataText042'),artists.value,message('metadataText001'),artists.selector);
 field('track-id',message('metadataText043'),track.value.match(/\/track\/(\d+)/)?.[1]??'',message('metadataText044'),message('metadataText045'));
 field('year',message('metadataText046'),'','',message('metadataText048'));
 field('genre',message('metadataText047'),'','',message('metadataText048'));
 field('original-codec',message('metadataText049'),'','',message('metadataText051'));
 field('original-bitrate',message('metadataText050'),'','',message('metadataText051'));
 field('original-depth',message('metadataText052'),'','',message('metadataText053'));
 field('page-url',message('metadataText054'),location.href,message('metadataText055'),message('metadataText056'));
 field('page-title',message('metadataText057'),document.title,message('metadataText001'),'document.title');
 const value=(id:string)=>fields.find(item=>item.id===id)?.value??'';
 return {fields,artwork:cover||null,playback:{
  title:value('title'),artist:value('artist'),album:value('album'),trackId:value('track-id'),duration,position,
  playing:value('playback')==='playing'&&(!media||media.readyState>=3),rate:media?.playbackRate??1,
 }};
}

