const {app,BrowserWindow,WebContentsView}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const timeout=setTimeout(()=>{console.error('CAPTURE TEST TIMEOUT');app.exit(1);},25000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:true,webPreferences:{contextIsolation:true,sandbox:true}});
 const target=new WebContentsView({webPreferences:{partition:'capture-smoke',contextIsolation:true,sandbox:true}});
 window.contentView.addChildView(target);target.setBounds({x:200,y:0,width:600,height:500});
 const file=path.join(__dirname,'capture-fixture.html');
 window.webContents.session.setDisplayMediaRequestHandler((request,callback)=>{
  console.log('CAPTURE REQUEST',request.audioRequested,request.videoRequested);
  callback({video:target.webContents.mainFrame,audio:target.webContents.mainFrame,enableLocalEcho:false});
 });
 window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===window.webContents&&permission==='display-capture'));
 try {
  await window.loadFile(file);await target.webContents.loadFile(file);
  await target.webContents.executeJavaScript(`window.audio=new AudioContext({sampleRate:44100});window.osc=audio.createOscillator();window.gain=audio.createGain();gain.gain.value=0.02;osc.frequency.value=440;osc.connect(gain).connect(audio.destination);osc.start();audio.resume();`,true);
  const result=await window.webContents.executeJavaScript(`(async()=>{
   const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   try {
    const track=stream.getAudioTracks()[0];if(!track)throw new Error('No tab audio track');
    const context=new AudioContext({sampleRate:track.getSettings().sampleRate||44100});
    const source=context.createMediaStreamSource(new MediaStream([track]));
    const processor=context.createScriptProcessor(4096,2,2);let peak=0,samples=0;
    processor.onaudioprocess=e=>{const data=e.inputBuffer.getChannelData(0);samples+=data.length;for(const v of data)peak=Math.max(peak,Math.abs(v));};
    const gain=context.createGain();gain.gain.value=0;source.connect(processor);processor.connect(gain).connect(context.destination);await context.resume();
    await new Promise(resolve=>setTimeout(resolve,3000));processor.disconnect();await context.close();return {sampleRate:context.sampleRate,peak,samples,settings:track.getSettings()};
   }finally{stream.getTracks().forEach(track=>track.stop());}
  })()`,true);
  console.log('RESULT',JSON.stringify(result));
  if(result.peak<0.001||result.samples<10000)throw new Error('Tab audio PCM absent');
  fs.mkdirSync(path.join(__dirname,'../.verification'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../.verification/capture-smoke.json'),JSON.stringify(result,null,2));
  clearTimeout(timeout);window.destroy();app.quit();
 }catch(error){console.error(error?.name,error?.message,error?.stack,String(error));clearTimeout(timeout);app.exit(1);}
});


