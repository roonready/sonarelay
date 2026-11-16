const {app,BrowserWindow,webContents}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const directory=path.join(root,'.verification/radio-ui-profile');
app.commandLine.appendSwitch('user-data-dir',directory);app.setPath('userData',directory);
app.getAppPath=()=>root;
delete process.env.ELECTRON_RENDERER_URL;
let window;
const timeout=setTimeout(()=>{console.error('Radio UI smoke timed out');app.exit(1);},60000);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.on('browser-window-created',(_event,created)=>{
 window=created;created.show=()=>{};created.maximize=()=>{};
 created.webContents.once('did-finish-load',async()=>{
  try{
   await delay(500);
   const browserCount=()=>webContents.getAllWebContents().filter(contents=>contents!==window.webContents&&!contents.isDestroyed()).length;
   assert.equal(browserCount(),0);
   if(process.argv.includes('--close-loading')){
    await window.webContents.executeJavaScript('window.bridge.acceptMusicConsent(1)');
    app.on('web-contents-created',(_event,contents)=>{
     if(contents!==window.webContents)contents.loadURL=()=>new Promise((_,reject)=>contents.once('destroyed',()=>reject(new Error('Cancelled test navigation'))));
    });
    await window.webContents.executeJavaScript('void window.bridge.openMusic().catch(()=>{})');
    await delay(200);assert.equal(browserCount(),1);
    clearTimeout(timeout);console.log(JSON.stringify({closeDuringMusicLoad:true}));window.close();return;
   }
   await window.webContents.executeJavaScript('void window.bridge.onRadioState(state=>window.__radioSmokeState=state);');
   async function click(name){await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(name)}).click()`);}
   async function wait(status,station){for(let i=0;i<300;i++){const state=await window.webContents.executeJavaScript('window.__radioSmokeState');if(state?.status==='error')throw new Error(state.error);if(state?.status===status&&(!station||state.stationId===station))return state;await delay(50);}throw new Error('Radio state timeout: '+status);}
   await click('Наше Радио');await wait('playing','nashe-radio');assert.equal(browserCount(),0);
   fs.rmSync(path.join(directory,'music-consent.json'),{force:true});
   await window.webContents.executeJavaScript("document.querySelector('.radio-player button:last-child').click()");await delay(150);
   assert.equal(await window.webContents.executeJavaScript("document.querySelector('dialog').open"),true);assert.equal(browserCount(),0);
   await window.webContents.executeJavaScript("document.querySelector('.consent-cancel').click()");await delay(100);
   await wait('playing','nashe-radio');assert.equal(browserCount(),0);
   await window.webContents.executeJavaScript('window.bridge.acceptMusicConsent(1)');
   await click('Наше Радио');await wait('stopped');
   await click('Radio Calico');await wait('playing','radio-calico');assert.equal(browserCount(),0);
   await click('Radio Calico');await wait('stopped');
   await window.webContents.executeJavaScript('void window.bridge.openMusic().then(()=>window.__musicSmokeReady=true)');
   for(let i=0;i<400;i++){if(await window.webContents.executeJavaScript('window.__musicSmokeReady===true'))break;await delay(50);}
   assert.equal(browserCount(),1);assert.ok(webContents.getAllWebContents().some(contents=>contents.getURL().startsWith('https://music.yandex.ru/')));
   await click('Наше Радио');await wait('playing','nashe-radio');
   assert.equal(browserCount(),0);
   console.log(JSON.stringify({buttons:true,nashe:true,calico:true,consentCancelKeepsRadioPlaying:true,stopAndRestart:true,musicOnDemand:true,radioClosesMusic:true,embeddedBrowserCount:browserCount(),shutdownWhilePlaying:true}));
   clearTimeout(timeout);window.close();
   setTimeout(()=>{if(!window.isDestroyed())app.exit(1);},4000).unref();
  }catch(error){console.error(error.message);clearTimeout(timeout);app.exit(1);}
 });
});
require('../out/main/index.js');
