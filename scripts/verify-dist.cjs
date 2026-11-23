const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const asar=require('@electron/asar');
(async()=>{
const root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const installer=path.join(root,'dist','SonaRelay-Setup-'+version+'-x64.exe');
const archive=path.join(root,'dist/win-unpacked/resources/app.asar');
const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());
const main=asar.extractFile(archive,path.normalize(pkg.main)).toString();
if(pkg.version!==version)throw new Error('Packaged version does not match package.json');
const yaml=require('js-yaml');
const feed=yaml.load(fs.readFileSync(path.join(root,'dist/win-unpacked/resources/app-update.yml'),'utf8'));
const expected=require('./release-config.cjs').repository();
if(feed.provider!=='github'||feed.private!==false||feed.owner!==expected.owner||feed.repo!==expected.repo)throw new Error('Invalid public update feed');
if(Object.keys(feed).some(key=>/token|password|secret/i.test(key)))throw new Error('Credentials found in update feed');
const channel=require('./release-config.cjs').releaseVersion(version).channel;
const update=yaml.load(fs.readFileSync(path.join(root,'dist',channel+'.yml'),'utf8'));
if(update.version!==version||update.files?.[0]?.url!==path.basename(installer))throw new Error('Update metadata version or filename mismatch');
const installerSha512=crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
if(update.sha512!==installerSha512||update.files[0].sha512!==installerSha512)throw new Error('Update metadata checksum mismatch');
if(!fs.statSync(installer+'.blockmap').size)throw new Error('Missing installer blockmap');
const entries=asar.listPackage(archive).map(file=>file.replaceAll('\\','/'));
if(entries.some(file=>/^\/(?:project-history\.md|lastfm-api\.json|\.env(?:\..*)?)$/.test(file)))throw new Error('Local configuration leaked into application');
for(const file of ['LICENSE','NOTICE'])asar.statFile(archive,file);
for(const file of ['process-loopback.ps1','ProcessLoopback.cs','gsmtc.ps1','media-process.ps1','windows-volume.ps1','WindowsVolume.cs'])if(!fs.statSync(path.join(root,'dist/win-unpacked/resources/native-audio',file)).isFile())throw new Error('Missing native audio helper');
if(!main.includes('enableLocalEcho: false'))throw new Error('Local echo suppression absent');
if(!main.includes('disable-renderer-backgrounding'))throw new Error('Background audio policy missing');
if(!main.includes('prevent-app-suspension'))throw new Error('Playback power blocker missing');
for(const file of ['out/preload/index.js','out/renderer/index.html'])asar.statFile(archive,path.normalize(file));
if(!asar.listPackage(archive).some(file=>file.includes('pcm-worklet-')))throw new Error('Worklet missing');
const binary=path.join(root,'dist/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe');
const result=spawnSync(binary,['-version'],{windowsHide:true,encoding:'utf8',timeout:5000});
if(result.status!==0)throw new Error(result.stderr||'Packaged FFmpeg failed');
const check=spawnSync(await require('app-builder-lib/out/toolsets/7zip').getPath7za(),['t',installer],{windowsHide:true,encoding:'utf8',timeout:60000});
if(check.status!==0)throw new Error(check.stdout+'\n'+check.stderr);
const hash=crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(installer+'.sha256',`${hash}  ${path.basename(installer)}\n`);
console.log(JSON.stringify({installer,version:pkg.version,bytes:fs.statSync(installer).size,sha256:hash,archiveIntegrity:'OK',main:pkg.main,ffmpeg:result.stdout.split('\n')[0].trim(),localAudio:'disabled during capture'},null,2));


})().catch(error=>{console.error(error);process.exitCode=1;});


