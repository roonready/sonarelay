const {spawn}=require('node:child_process');
const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL;
const child=spawn(require('electron'),[path.join(__dirname,'shutdown-smoke.cjs')],{env,windowsHide:true,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error);process.exitCode=1;});
