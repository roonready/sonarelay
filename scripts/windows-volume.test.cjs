require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events'),{PassThrough}=require('stream');
const {WindowsVolume}=require('../src/main/runtime/windows-volume.ts');
function fixture(){
 const children=[],commands=[];
 const launch=(executable,args,options)=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
  child.stdin.on('data',chunk=>commands.push(JSON.parse(chunk.toString())));
  child.kill=()=>{child.killed=true;child.exitCode=0;child.emit('exit',0);};
  children.push(child);child.launch={executable,args,options};return child;
 };
 return {helper:new WindowsVolume('native-audio',launch),children,commands};
}

test('Windows volume reuses one hidden helper and correlates fragmented out-of-order responses',async()=>{
 const f=fixture();try{
  const read=f.helper.request(),write=f.helper.request(10),child=f.children[0];
  assert.equal(f.children.length,1);assert.equal(child.launch.options.windowsHide,true);
  assert.ok(child.launch.args.includes('-NonInteractive'));assert.ok(child.launch.args.at(-1).endsWith('windows-volume.ps1'));
  assert.deepEqual(f.commands,[{id:1},{id:2,value:10}]);
  child.stdout.write('{"id":2,"volume":10,');child.stdout.write('"muted":true}\n{"id":1,"volume":22.1,"muted":false}\n');
  assert.deepEqual(await read,{volume:22,muted:false});assert.deepEqual(await write,{volume:10,muted:true});
 }finally{await f.helper.dispose();}
 assert.equal(f.children[0].killed,true);
 await assert.rejects(f.helper.request(),/windowsUnavailable/);
});

test('Windows volume rejects invalid commands without spawning and never treats malformed data as zero',async()=>{
 const f=fixture();try{
  for(const value of [-1,101,NaN,Infinity,'10',null])await assert.rejects(f.helper.request(value),/invalid/);
  assert.equal(f.children.length,0);
  for(const volume of [null,'',-1,101]){
   const pending=f.helper.request(),id=f.commands.at(-1).id;
   f.children.at(-1).stdout.write(JSON.stringify({id,volume,muted:false})+'\n');await assert.rejects(pending,/windowsUnavailable/);
  }
  const pending=f.helper.request();f.children[0].stdout.write('invalid\n');await assert.rejects(pending,/windowsUnavailable/);
  const retry=f.helper.request(),child=f.children[1],id=f.commands.at(-1).id;
  assert.equal(f.children.length,2);child.stdout.write(JSON.stringify({id,volume:0,muted:false})+'\n');assert.equal((await retry).volume,0);
 }finally{await f.helper.dispose();}
});

test('closing the app cancels pending native requests and terminates the helper',async()=>{
 const f=fixture(),pending=f.helper.request();const failure=assert.rejects(pending,/windowsUnavailable/);
 await f.helper.dispose();await failure;assert.equal(f.children[0].killed,true);assert.equal(f.helper.requests.size,0);
});
