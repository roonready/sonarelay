require('./register-ts.cjs');
const {configureBackgroundAudio}=require('../src/main/runtime/background-audio.ts');
const {app,BrowserWindow,WebContentsView}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
configureBackgroundAudio(app.commandLine);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const deadline=setTimeout(()=>{console.error('BACKGROUND AUDIO TIMEOUT');app.exit(1);},30000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({width:800,height:600,show:true,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
 const target=new WebContentsView({webPreferences:{partition:'background-audio-test',sandbox:true,contextIsolation:true,backgroundThrottling:false}});
 window.contentView.addChildView(target);target.setBounds({x:200,y:0,width:600,height:500});
 let cover;
 const file=path.join(__dirname,'capture-fixture.html');
 window.webContents.session.setDisplayMediaRequestHandler((request,callback)=>callback({video:target.webContents.mainFrame,audio:target.webContents.mainFrame,enableLocalEcho:false}));
 window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===window.webContents&&permission==='display-capture'));
 try{
  await window.loadFile(file);await target.webContents.loadFile(file);
  await target.webContents.executeJavaScript(`window.audio=new AudioContext({sampleRate:48000});window.osc=audio.createOscillator();window.gain=audio.createGain();gain.gain.value=0.02;osc.connect(gain).connect(audio.destination);osc.start();audio.resume();`,true);
  const worklet=pathToFileURL(path.resolve(__dirname,'../src/renderer/src/services/pcm-worklet.js')).href;
  await window.webContents.executeJavaScript(`(async()=>{
   const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   if(!stream.getAudioTracks()[0])throw new Error('No audio track');
   const context=new AudioContext({sampleRate:stream.getAudioTracks()[0].getSettings().sampleRate||48000,latencyHint:'playback'});
   await context.audioWorklet.addModule(${JSON.stringify(worklet)});
   const worklet=new AudioWorkletNode(context,'pcm-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
   window.metrics={phase:'foreground',data:{},rate:context.sampleRate,last:performance.now()};
   worklet.port.onmessage=e=>{
    const m=window.metrics,key=m.phase;const stat=m.data[key]||(m.data[key]={frames:0,maxGapMs:0,peak:0});
    const now=performance.now();stat.maxGapMs=Math.max(stat.maxGapMs,now-m.last);m.last=now;
    const pcm=new Int16Array(e.data);stat.frames+=pcm.length/2;for(const value of pcm)stat.peak=Math.max(stat.peak,Math.abs(value));
   };
   context.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]])).connect(worklet);
   const gain=context.createGain();gain.gain.value=0;worklet.connect(gain).connect(context.destination);await context.resume();
   window.cleanup=async()=>{worklet.port.onmessage=null;stream.getTracks().forEach(t=>t.stop());await context.close();};
  })()`,true);
  await new Promise(r=>setTimeout(r,4000));
  await window.webContents.executeJavaScript(`metrics.phase='covered';metrics.last=performance.now();`);
  cover=new BrowserWindow({width:1000,height:800,show:true});await cover.loadFile(file);cover.focus();
  await new Promise(r=>setTimeout(r,4000));
  await window.webContents.executeJavaScript(`metrics.phase='minimized';metrics.last=performance.now();`);window.minimize();
  await new Promise(r=>setTimeout(r,4000));
  const result=await window.webContents.executeJavaScript(`(async()=>{await cleanup();return metrics;})()`);
  console.log(JSON.stringify(result,null,2));
  for(const phase of ['foreground','covered','minimized']){
   const stat=result.data[phase];if(!stat||stat.frames<result.rate*3.2||stat.maxGapMs>600||stat.peak<100)throw new Error('PCM interrupted in '+phase);
  }
  fs.mkdirSync(path.join(__dirname,'../.verification'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../.verification/background-audio.json'),JSON.stringify(result,null,2));
  clearTimeout(deadline);cover.destroy();window.destroy();app.quit();
 }catch(error){console.error(String(error),error?.message);clearTimeout(deadline);app.exit(1);}
});
