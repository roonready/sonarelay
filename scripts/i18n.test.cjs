require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {parse,compileScript}=require('@vue/compiler-sfc');
const ts=require('typescript');
const {createSSRApp,nextTick,watchEffect}=require('vue');
const {createPinia}=require('pinia');
const {renderToString}=require('@vue/server-renderer');
const en=require('../src/shared/locales/en.json'),ru=require('../src/shared/locales/ru.json');
const {message}=require('../src/shared/messages.ts');
const {initialLanguage,detectLanguage,languageStorageKey}=require('../src/shared/language.ts');
const values=new Map();
global.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
global.document={documentElement:{lang:'en'}};
global.window={bridge:{getSystemLanguage:async()=>'ru-RU',onLiveState:()=>()=>{}}};
const {i18n,initializeLanguage,selectLanguage,localizeMessage,localizeError}=require('../src/renderer/src/i18n/index.ts');

test('first-launch detection handles regional tags, unsupported locales and saved preferences',()=>{
 assert.equal(detectLanguage('ru-RU'),'ru');assert.equal(detectLanguage('en_GB'),'en');
 assert.equal(detectLanguage('de-DE'),'en');assert.equal(detectLanguage(''),'en');
 assert.equal(initialLanguage('en','ru-RU'),'en');assert.equal(initialLanguage('ru','en-US'),'ru');
 assert.equal(initialLanguage('corrupt','ru-RU'),'ru');
});
test('first launch persists detected language; manual choice survives restart and OS changes',async()=>{
 await initializeLanguage();assert.equal(i18n.global.locale.value,'ru');
 assert.equal(document.documentElement.lang,'ru');assert.equal(values.get(languageStorageKey),'ru');
 selectLanguage('en');assert.equal(document.documentElement.lang,'en');assert.equal(values.get(languageStorageKey),'en');
 let called=false;window.bridge.getSystemLanguage=async()=>{called=true;return 'ru-RU';};
 await initializeLanguage();assert.equal(called,false);assert.equal(i18n.global.locale.value,'en');
 selectLanguage('invalid');assert.equal(i18n.global.locale.value,'en');
});
test('locale catalogs have matching parameters and every message compiles in both languages',()=>{
 assert.deepEqual(Object.keys(en).sort(),Object.keys(ru).sort());
 for(const locale of ['en','ru']){
  i18n.global.locale.value=locale;
  for(const [key,value]of Object.entries(locale==='en'?en:ru)){
   assert.ok(value.trim(),key);assert.ok(!/\?{3}/.test(value),key);
   const placeholders=value.match(/\{\w+\}/g)??[];
   assert.deepEqual([...placeholders].sort(),[...(en[key].match(/\{\w+\}/g)??[])].sort(),key);
   const params=Object.fromEntries(placeholders.map(p=>[p.slice(1,-1),'123']));
   assert.notEqual(i18n.global.t(key,params),key,key);
  }
 }
});
test('active backend errors and status messages react to locale changes, including nested IPC errors',async()=>{
 selectLanguage('ru'); let rendered=''; const stop=watchEffect(()=>{rendered=localizeMessage('monitor.noPcm');});
 assert.equal(rendered,ru['monitor.noPcm']); selectLanguage('en'); await nextTick(); assert.equal(rendered,en['monitor.noPcm']); stop();
 assert.equal(localizeError(new Error("Error invoking remote method 'lastfm:confirm': Error: "+message('runtime114'))),en.runtime114);
 assert.equal(localizeMessage('PLAYING'),'Playing');assert.equal(localizeError('connect ECONNREFUSED 192.168.1.20'),en['errors.network']);
 assert.equal(localizeError('NotAllowedError: Permission denied'),en['errors.permission']);
 assert.equal(localizeError('unrecognized library error'),en['errors.unknown']);
});
// Compile the real components, including their templates, for a renderer smoke test.
require.extensions['.vue']=(module,filename)=>{
 const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
 const script=compileScript(descriptor,{id:'i18n-test',inlineTemplate:true});
 module._compile(ts.transpileModule(script.content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
};
test('real interface renders both languages, preserves protocol names and exposes language selection',async()=>{
 const MainView=require('../src/renderer/src/views/MainView.vue').default;
 for(const locale of ['en','ru']){
  selectLanguage(locale);
  const app=createSSRApp(MainView).use(createPinia()).use(i18n);
  const html=await renderToString(app);
  assert.ok(html.includes(locale==='en'?'Settings':'Настройки'));
  assert.ok(html.includes(locale==='en'?'This computer (Windows)':'Этот компьютер (Windows)'));
  assert.ok(html.includes('id="language"'));assert.ok(html.includes('value="en"'));assert.ok(html.includes('value="ru"'));
  for(const name of ['SonaRelay','DLNA','BluOS','Google Cast','AirPlay 2','Squeezelite','Last.fm'])assert.ok(html.includes(name),name);
  assert.ok(!html.includes('devices.local'));assert.ok(!html.includes('playback.onLocal'));
 }
});
test('relay keeps receiver volume controls visible and respects unsupported outputs',async()=>{
 const DeviceControls=require('../src/renderer/src/components/DeviceControls.vue').default;
 const {useDevices}=require('../src/renderer/src/stores/devices.ts');
 const originalLive=window.bridge.onLiveState,originalVolume=window.bridge.receiverVolume,originalWindows=window.bridge.windowsVolume;
 try{
  selectLanguage('en');
  for(const output of ['receiver','unsupported','local']){
   const pinia=createPinia(),devices=useDevices(pinia);
   devices.selectedId=output==='local'?require('../src/renderer/src/services/output.ts').LOCAL_OUTPUT_ID:'speaker';
   devices.state.devices=[{id:'speaker',name:'Test speaker',services:[],capabilities:output==='receiver'?['SetVolume']:[]}];
   window.bridge.onLiveState=callback=>{callback({deviceId:'speaker',sessionId:'relay-test',active:true,playbackReady:true,volume:42});return ()=>{};};
   window.bridge.receiverVolume=async(deviceId,value)=>({deviceId,volume:value??42});
   window.bridge.windowsVolume=async value=>({volume:value??55,muted:true});
   const html=await renderToString(createSSRApp(DeviceControls).use(pinia).use(i18n));
   assert.equal(html.includes('type="range"'),output!=='unsupported',output);
   if(output==='receiver')assert.ok(html.includes(en['volume.loading']),html);
   if(output==='local')assert.ok(html.includes(en['volume.windowsScope']),html);

   await new Promise(resolve=>setImmediate(resolve));
   if(output==='receiver')assert.equal(require('../src/renderer/src/stores/receiver-volume.ts').useReceiverVolume(pinia).value,10);
   if(output==='local'){const volume=require('../src/renderer/src/stores/receiver-volume.ts').useReceiverVolume(pinia);assert.equal(volume.value,10);assert.equal(volume.muted,true);}
  }
 }finally{window.bridge.onLiveState=originalLive;window.bridge.receiverVolume=originalVolume;window.bridge.windowsVolume=originalWindows;}
});

test('Vue templates and scripts contain no hardcoded user-facing copy',()=>{
 const dirs=['components','views'];
 for(const dir of dirs)for(const name of fs.readdirSync(path.join(__dirname,'../src/renderer/src',dir))){
  if(!name.endsWith('.vue'))continue;
  const source=fs.readFileSync(path.join(__dirname,'../src/renderer/src',dir,name),'utf8');
  assert.ok(!/[А-Яа-яЁё]/.test(source),name);
  const {descriptor}=parse(source);
  function visit(node){if(node.type===2)assert.ok(!/[a-zA-ZА-Яа-я]/.test(node.content),name+': '+node.content);for(const child of node.children??[])visit(child);}
  visit(descriptor.template.ast);
 }
});
