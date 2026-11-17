export interface CatalogTrack {
 id:string;albumId:string|null;title:string;artist:string;album:string;cover:string|null;artistPicture:string|null;
}
export function catalogId(value:unknown):string|null{
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<=0))return null;
 if(typeof value!=='number'&&typeof value!=='string')return null;
 const id=String(value);return /^[1-9]\d{0,19}$/.test(id)?id:null;
}
export function musicTrackUrl(id:unknown,albumId?:unknown){
 const track=catalogId(id),album=albumId===null||albumId===undefined?null:catalogId(albumId);
 if(!track||(albumId!==null&&albumId!==undefined&&!album))throw new Error('catalog.openFailed');
 return album?`https://music.yandex.ru/album/${album}/track/${track}`:`https://music.yandex.ru/track/${track}`;
}
