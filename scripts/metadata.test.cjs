require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readMusicMetadata}=require('../src/main/metadata/read-metadata.ts');
const {MetadataManager}=require('../src/main/metadata/metadata-manager.ts');
function read({metadata=null,playbackState='none',media=[],scope=null}={}){
 const document={title:'Music page',querySelectorAll(selector){
  if(selector==='audio,video')return media;
  if(selector==='[aria-label="Плеер"]'&&scope)return [scope];
  return [];
 }};
 return vm.runInNewContext(`(${readMusicMetadata.toString()})(${JSON.stringify(require('../src/shared/locales/ru.json'))})`,{document,navigator:{mediaSession:{metadata,playbackState}},location:{href:'https://music.yandex.ru/'},URL});
}
const get=(result,id)=>result.fields.find(field=>field.id===id);
test('Media Session values have exact provenance, artwork and unavailable source quality',()=>{
 const result=read({metadata:{title:'Track A',artist:'Artist A',album:'Album A',artwork:[{src:'https://example.com/cover.jpg',sizes:'600x600',type:'image/jpeg'}]},playbackState:'playing'});
 assert.equal(get(result,'title').value,'Track A');assert.equal(get(result,'title').source,'Media Session API');
 assert.equal(get(result,'title').detail,'navigator.mediaSession.metadata.title');
 assert.equal(result.artwork,'https://example.com/cover.jpg');assert.equal(get(result,'playback').value,'playing');
 assert.equal(get(result,'position').value,null);assert.equal(get(result,'original-depth').value,null);
});
test('HTMLMediaElement supplies timing and volume independently of Media Session',()=>{
 const result=read({media:[{tagName:'AUDIO',paused:false,ended:false,duration:180,currentTime:42,playbackRate:1,volume:.4,muted:false,readyState:4}]});
 assert.match(get(result,'duration').value,/03:00/);assert.match(get(result,'position').value,/00:42/);
 assert.equal(get(result,'position').source,'HTMLMediaElement · <audio>');assert.equal(get(result,'volume').value,'40 %');
 assert.equal(result.artwork,null);
 assert.match(get(result,'remaining').value,/02:18/);assert.equal(get(result,'playback').value,'playing');
});
test('DOM fallback reads only the player scope and labels derived track ID',()=>{
 const link={textContent:'DOM Song',href:'https://music.yandex.ru/album/456/track/123',getClientRects:()=>[{}]};
 const slider={getAttribute:name=>({'aria-valuenow':'15','aria-valuemax':'120'}[name]??null)};
 const scope={getClientRects:()=>[{}],querySelectorAll:selector=>selector==='a[href*="/track/"]'?[link]:[],querySelector:selector=>selector==='[aria-label*="таймкод"]'?slider:null};
 const result=read({scope});
 assert.equal(get(result,'title').value,'DOM Song');assert.equal(get(result,'title').source,'DOM Яндекс Музыки');
 assert.equal(get(result,'track-id').value,'123');assert.match(get(result,'position').value,/00:15/);
 assert.equal(get(result,'artist').value,null);
});
test('metadata manager ignores non-music pages and cannot publish after disposal',async()=>{
 let url='https://passport.yandex.ru/',calls=0,resolve;
 const page={isDestroyed:()=>false,getURL:()=>url,executeJavaScript:()=>{calls++;return new Promise(r=>{resolve=r;});}};
 const manager=new MetadataManager(page);const updates=[];manager.on('state',s=>updates.push(s));
 await manager.refresh();assert.equal(calls,0);url='https://music.yandex.ru/';
 const request=manager.refresh();assert.equal(calls,1);manager.dispose();const before=updates.length;
 resolve({fields:[],artwork:null});await request;assert.equal(updates.length,before);
});

test('metadata exposes numeric source playback for Last.fm without parsing formatted labels',()=>{
 const result=read({metadata:{title:'Track',artist:'Artist',album:'Album'},playbackState:'playing',media:[{tagName:'AUDIO',paused:false,ended:false,duration:180.5,currentTime:42.25,playbackRate:1,volume:.4,muted:false,readyState:4}]});
 assert.deepEqual(JSON.parse(JSON.stringify(result.playback)),{title:'Track',artist:'Artist',album:'Album',trackId:'',duration:180.5,position:42.25,playing:true,rate:1});
});
