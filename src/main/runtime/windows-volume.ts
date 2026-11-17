import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { WindowsVolumeState } from '../../shared/types';

/** Persistent native helper; no audio stream and no npm/native binary dependency. */
export class WindowsVolume {
 private child?:ChildProcessWithoutNullStreams;
 private requests=new Map<number,{resolve:(value:WindowsVolumeState)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
 private serial=0;
 private disposed=false;
 constructor(private directory:string,private launch:typeof spawn=spawn){}
 private fail(child:ChildProcessWithoutNullStreams){
  if(this.child!==child)return;
  this.child=undefined;
  for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(new Error('volume.windowsUnavailable'));}
  this.requests.clear();child.kill();
 }
 private start(){
  if(this.child)return this.child;
  const executable=path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const child=this.child=this.launch(executable,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.directory,'windows-volume.ps1')],{windowsHide:true,stdio:'pipe'}) as ChildProcessWithoutNullStreams;
  let buffer='';
  child.stdout.on('data',(data:Buffer)=>{
   if(this.child!==child)return;
   buffer+=data.toString('utf8');
   if(buffer.length>16384){this.fail(child);return;}
   const lines=buffer.split(/\r?\n/);buffer=lines.pop()??'';
   for(const line of lines){
    try{
     const result=JSON.parse(line),request=this.requests.get(result.id);
     if(!request)continue;
     clearTimeout(request.timer);this.requests.delete(result.id);
     if(result.error||typeof result.volume!=='number'||!Number.isFinite(result.volume)||result.volume<0||result.volume>100||typeof result.muted!=='boolean')request.reject(new Error('volume.windowsUnavailable'));
     else request.resolve({volume:Math.round(result.volume),muted:result.muted});
    }catch{this.fail(child);return;}
   }
  });
  child.stderr.resume();
  child.on('error',()=>this.fail(child));child.on('exit',()=>this.fail(child));child.stdin.on('error',()=>this.fail(child));
  return child;
 }
 request(value?:number):Promise<WindowsVolumeState>{
  if(this.disposed||process.platform!=='win32')return Promise.reject(new Error('volume.windowsUnavailable'));
  if(value!==undefined&&(!Number.isFinite(value)||value<0||value>100))return Promise.reject(new Error('volume.invalid'));
  let child:ChildProcessWithoutNullStreams;
  try{child=this.start();}catch{return Promise.reject(new Error('volume.windowsUnavailable'));}
  const id=++this.serial;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail(child),10000);
   this.requests.set(id,{resolve,reject,timer});
   try{child.stdin.write(JSON.stringify({id,...(value===undefined?{}:{value})})+'\n');}
   catch{this.fail(child);}
  });
 }
 async dispose(){
  this.disposed=true;
  const child=this.child;
  if(!child)return;
  this.fail(child);
  if(child.exitCode!==null)return;
  await new Promise<void>(resolve=>{const timer=setTimeout(resolve,1500);child.once('exit',()=>{clearTimeout(timer);resolve();});});
 }
}
