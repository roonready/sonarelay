import { message as runtimeMessage } from '../../shared/messages';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LastfmPreferences } from '../../shared/types';
export interface StoredSession {key:string;name:string;apiKey:string}
export interface SessionCrypto {available():Promise<boolean>;encrypt(value:string):Promise<Buffer>;decrypt(value:Buffer):Promise<string>}
export class LastfmStorage {
 constructor(private directory:string,private crypto:SessionCrypto){}
 private file(name:string){return path.join(this.directory,name);}
 private async write(name:string,data:string|Buffer){await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(this.file(name+'.tmp'),data,{mode:0o600});await fs.rename(this.file(name+'.tmp'),this.file(name));}
 async loadSession():Promise<StoredSession|undefined>{
  let data:Buffer;try{data=await fs.readFile(this.file('lastfm-session.bin'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw new Error(runtimeMessage('runtime122'));}
  if(!await this.crypto.available())throw new Error(runtimeMessage('runtime123'));
  try{const session=JSON.parse(await this.crypto.decrypt(data));if(typeof session.key!=='string'||typeof session.name!=='string'||typeof session.apiKey!=='string')throw new Error();return session;}catch{throw new Error(runtimeMessage('runtime124'));}
 }
 async saveSession(session:StoredSession){if(!await this.crypto.available())throw new Error(runtimeMessage('runtime123'));try{await this.write('lastfm-session.bin',await this.crypto.encrypt(JSON.stringify(session)));}catch{throw new Error(runtimeMessage('runtime125'));}}
 async removeSession(){for(const name of ['lastfm-session.bin','lastfm-session.bin.tmp'])await fs.rm(this.file(name),{force:true});}
 async preferences():Promise<LastfmPreferences>{try{const value=JSON.parse(await fs.readFile(this.file('lastfm-settings.json'),'utf8'));return {scrobbling:value.scrobbling!==false,nowPlaying:value.nowPlaying!==false};}catch{return {scrobbling:true,nowPlaying:true};}}
 async savePreferences(value:LastfmPreferences){await this.write('lastfm-settings.json',JSON.stringify(value));}
}
export async function lastfmCredentials(directory:string):Promise<{apiKey:string;secret:string}|undefined>{
 let config:any={};
 if(process.env.LASTFM_API_KEY||process.env.LASTFM_SHARED_SECRET)config={apiKey:process.env.LASTFM_API_KEY,secret:process.env.LASTFM_SHARED_SECRET};
 else try{config=JSON.parse((await fs.readFile(path.join(directory,'lastfm-api.json'),'utf8')).replace(/^\uFEFF/,''));}catch{return;}
 if(typeof config.apiKey!=='string'||typeof config.secret!=='string'||!/^\w{32}$/.test(config.apiKey)||!/^\w{32}$/.test(config.secret))return;
 return {apiKey:config.apiKey,secret:config.secret};
}
