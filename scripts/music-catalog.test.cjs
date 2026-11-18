require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MusicCatalog,matchCatalogTrack,catalogImage}=require('../src/main/metadata/music-catalog.ts');
const {musicTrackUrl}=require('../src/shared/music-catalog.ts');
const row=(title='Bohemian Rhapsody',artist='Queen',id=1)=>({id,title,artists:[{id:79215,name:artist,cover:{type:'from-artist-photos',uri:'avatars.yandex.net/get-music-content/20013662/c45457c6.p.19981689/%%'}}],albums:[{id:11,title:'The Platinum Collection',coverUri:'avatars.yandex.net/get-music-content/album/%%'}]});
const response=data=>({ok:true,json:async()=>({result:{tracks:{results:data}}})});
const deezerResponse=data=>({ok:true,json:async()=>({data})});

test('catalog matches artist and title and reads version separately to avoid live recordings and cover artists',()=>{
 const result=matchCatalogTrack([{...row(),version:'Live Aid'},row('Bohemian Rhapsody','Other'),row()], 'Queen','Bohemian Rhapsody');
 assert.equal(result.id,'1');assert.equal(result.albumId,'11');assert.equal(result.album,'The Platinum Collection');assert.equal(result.artist,'Queen');
 assert.equal(matchCatalogTrack([{...row(),version:'Live Aid'}],'Queen','Bohemian Rhapsody'),null);
 assert.ok(matchCatalogTrack([{...row(),version:'Remastered 2011'}],'Queen','Bohemian Rhapsody (2011 Remaster)'));
});
test('Yandex image templates become HTTPS cover and artist-photo URLs with explicit sizes',()=>{
 const result=matchCatalogTrack([row()],'Queen','Bohemian Rhapsody');
 assert.equal(result.artistPicture,'https://avatars.yandex.net/get-music-content/20013662/c45457c6.p.19981689/300x300');
 assert.equal(result.cover,'https://avatars.yandex.net/get-music-content/album/1000x1000');
 assert.equal(catalogImage('https://untrusted.example/image/%%','300x300'),null);assert.equal(catalogImage('javascript:bad','300x300'),null);
 const albumPhoto=row();albumPhoto.artists[0].cover.type='from-album-cover';assert.equal(matchCatalogTrack([albumPhoto],'Queen','Bohemian Rhapsody').artistPicture,null);
});
test('catalog links use validated Yandex album and track IDs, never arbitrary URLs',()=>{
 assert.equal(musicTrackUrl('1710808','227551'),'https://music.yandex.ru/album/227551/track/1710808');
 assert.equal(musicTrackUrl(1710808),'https://music.yandex.ru/track/1710808');
 assert.equal(musicTrackUrl('42','11','deezer'),'https://www.deezer.com/track/42');
 assert.throws(()=>musicTrackUrl('42',null,'https://other.example'),/openFailed/);
 for(const id of [0,-1,NaN,null,'https://other.example','1/../../bad'])assert.throws(()=>musicTrackUrl(id),/openFailed/);
 assert.throws(()=>musicTrackUrl('1','bad'),/openFailed/);
});
test('lookup uses the documented public Yandex search API without OAuth or browser credentials and caches results',async()=>{
 let calls=0,now=0;
 const service=new MusicCatalog(async(url,options)=>{calls++;assert.equal(url.origin,'https://api.music.yandex.net');assert.equal(url.pathname,'/search');assert.equal(url.searchParams.get('text'),'Queen Bohemian Rhapsody');assert.equal(url.searchParams.get('type'),'track');assert.equal(url.searchParams.get('nocorrect'),'true');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);return response([row()]);},()=>now);
 try{
  assert.equal((await service.search('Queen','Bohemian Rhapsody')).id,'1');await service.search('Queen','Bohemian Rhapsody');assert.equal(calls,1);
  now=7*60*60*1000;await service.search('Queen','Bohemian Rhapsody');assert.equal(calls,2);
  await assert.rejects(service.search('Queen','x'.repeat(513)),/unavailable/);
 }finally{service.dispose();}
});
test('missing results and API errors never invent an album or images',async()=>{
 const missing=new MusicCatalog(async url=>url.hostname==='api.deezer.com'?deezerResponse([]):response([row('Other')]));assert.equal(await missing.search('Queen','Bohemian Rhapsody'),null);missing.dispose();
 const empty=new MusicCatalog(async url=>url.hostname==='api.deezer.com'?deezerResponse([]):({ok:true,json:async()=>({result:{}})}));assert.equal(await empty.search('Queen','Unknown'),null);empty.dispose();
 for(const result of [{ok:false},{ok:true,json:async()=>({error:{name:'unauthorized'}})},{ok:true,json:async()=>({result:{tracks:{results:'bad'}}})}]){
  const calls=[];const service=new MusicCatalog(async url=>{calls.push(url.hostname);return result;});
  await assert.rejects(service.search('Queen','Bohemian Rhapsody'),/unavailable/);assert.deepEqual(calls,['api.music.yandex.net']);service.dispose();
 }
});
test('a Yandex miss falls back to a matching Deezer track and caches artwork and provider',async()=>{
 const calls=[],cover='https://cdn-images.dzcdn.net/images/cover/example.jpg';
 const track={id:42,title:'Bohemian Rhapsody',artist:{name:'Queen',picture_big:'https://other.example/image.jpg'},album:{id:11,title:'A Night at the Opera',cover_xl:cover}};
 const service=new MusicCatalog(async url=>{
  calls.push(url.hostname);
  if(url.hostname==='api.music.yandex.net')return response([row('Other')]);
  assert.equal(url.href,'https://api.deezer.com/search?q=Queen+Bohemian+Rhapsody&limit=25');
  return deezerResponse([{...track,id:40,title:'Bohemian Rhapsody (Live Aid)'},{...track,id:41,artist:{name:'Other'}},track]);
 });
 try{
  const result=await service.search('Queen','Bohemian Rhapsody');
  assert.deepEqual(result,{provider:'deezer',id:'42',albumId:'11',title:'Bohemian Rhapsody',artist:'Queen',album:'A Night at the Opera',cover,artistPicture:null});
  assert.equal(await service.search('Queen','Bohemian Rhapsody'),result);
  assert.deepEqual(calls,['api.music.yandex.net','api.deezer.com']);
 }finally{service.dispose();}
});
test('track changes and shutdown abort obsolete catalog requests',async()=>{
 let signal;
 const service=new MusicCatalog(async(_url,options)=>{signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));});
 const first=service.search('Queen','One'),rejected=assert.rejects(first,/unavailable/),oldSignal=signal;
 const next=service.search('Queen','Two'),nextRejected=assert.rejects(next,/unavailable/);assert.equal(oldSignal.aborted,true);
 service.dispose();await rejected;await nextRejected;assert.equal(signal.aborted,true);
});
test('the now-playing card rejects stale responses and clears artwork on track changes and stop',async()=>{
 const {createPinia}=require('pinia');let resolve;
 global.window={bridge:{catalogSearch:()=>new Promise(r=>{resolve=r;})}};
 const {useNowPlaying}=require('../src/renderer/src/stores/now-playing.ts'),store=useNowPlaying(createPinia());
 const old=store.load('Queen','Old'),finishOld=resolve;
 const next=store.load('Queen','New'),finishNew=resolve;
 finishNew({id:'2',albumId:'11',title:'New',artist:'Queen',album:'New album',cover:'https://avatars.yandex.net/new.jpg'});await next;
 finishOld({id:'1',title:'Old'});await old;assert.equal(store.track.title,'New');
 const pending=store.load('Queen','Third');assert.equal(store.track,null);store.clear();resolve({title:'Third'});await pending;assert.equal(store.track,null);assert.equal(store.status,'idle');
});
