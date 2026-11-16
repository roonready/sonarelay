const {spawn}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const args=[path.join(__dirname,'profile-electron-smoke.cjs'),'--user-data-dir='+path.resolve(__dirname,'../.verification/profile-lock-smoke')];
let output='',errors='',started=false,secondaryTask;
function launch(onData){return new Promise((resolve,reject)=>{
 const process=spawn(require('electron'),args,{env,windowsHide:true});
 process.stdout.on('data',data=>{output+=data.toString();onData?.(data.toString());});
 process.stderr.on('data',data=>{errors+=data.toString();});
 process.on('error',reject);process.on('exit',resolve);
});}
(async()=>{
 const quitFile=path.resolve(__dirname,'../.verification/profile-lock-smoke/quit');
 fs.rmSync(quitFile,{force:true});
 const primary=await launch(text=>{if(text.includes('primary-ready')&&!started){started=true;secondaryTask=launch().then(code=>{fs.writeFileSync(quitFile,'quit');return code;});}});
 assert.equal(primary,0,output+'\n'+errors);assert.equal(await secondaryTask,0,output+'\n'+errors);
 assert.ok(output.includes('secondary-window-skipped'));assert.ok(output.includes('primary-received-second-instance'));
 assert.ok(!/Unable to (?:move|create).*cache|Gpu Cache Creation failed/i.test(errors),errors);
 console.log(JSON.stringify({singleWindow:true,secondLaunchFocusedPrimary:true,cacheErrors:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
