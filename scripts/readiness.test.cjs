require('./register-ts.cjs');const {test}=require('node:test'),assert=require('node:assert/strict');
const {LiveSession}=require('../src/main/audio/live-session.ts');
function session(){const live=new LiveSession(()=> '127.0.0.1');live.connected=true;live.awaitingPlayback=true;live.state={...live.state,active:true,connected:true,sessionId:'test',playbackReady:false};return live;}
test('readiness needs receiver PLAYING and an active HTTP stream, not a Play acknowledgement',async()=>{
 const live=session();live.controller={transport:async()=>({CurrentTransportState:'PLAYING'})};live.server={connections:0};
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);
 live.server.connections=1;live.controller.transport=async()=>({CurrentTransportState:'TRANSITIONING'});
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);
 live.controller.transport=async()=>({CurrentTransportState:'PLAYING'});await live.checkPlayback();assert.equal(live.state.playbackReady,true);assert.equal(live.awaitingPlayback,false);
});
test('a late readiness reply cannot confirm playback after pause or session replacement',async()=>{
 const live=session();let resolve;live.server={connections:1};live.controller={transport:()=>new Promise(r=>resolve=r)};
 const pending=live.checkPlayback();live.playbackRevision++;live.awaitingPlayback=false;live.state.status='PAUSED_PLAYBACK';resolve({CurrentTransportState:'PLAYING'});await pending;
 assert.equal(live.state.playbackReady,false);assert.equal(live.state.status,'PAUSED_PLAYBACK');
});
test('status failure keeps waiting; paused output does not poll',async()=>{
 const live=session();let calls=0;live.controller={transport:async()=>{calls++;throw new Error('timeout');}};
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);live.awaitingPlayback=false;await live.checkPlayback();assert.equal(calls,1);
});
test('AirPlay readiness estimate includes timing exchanges and two-second presentation lead',async()=>{
 const live=session();live.airplay={isPlaying:true,packets:300,timingExchanges:2};live.playbackStartedAt=Date.now();
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);live.playbackStartedAt=Date.now()-2100;live.airplay.timingExchanges=0;
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);live.airplay.timingExchanges=2;await live.checkPlayback();assert.equal(live.state.playbackReady,true);
});

test('accepting Play arms readiness polling but does not stop the waiting indicator',async()=>{
 const live=session();live.connected=false;live.awaitingPlayback=false;live.engine={bytes:4};live.server={connections:1};
 live.controller={setUri:async()=>{},play:async()=>{},volume:async()=>({CurrentVolume:30}),transport:async()=>({CurrentTransportState:'PLAYING'})};
 await live.connect('test');assert.equal(live.awaitingPlayback,true);assert.equal(live.state.playbackReady,false);
 await live.checkPlayback();assert.equal(live.state.playbackReady,true);
});

test('Cast PLAYING is insufficient until its media clock confirms progress',async()=>{
 const live=session();live.server={connections:1};live.controller={transport:async()=>({CurrentTransportState:'PLAYING',PlaybackReady:false})};
 await live.checkPlayback();assert.equal(live.state.playbackReady,false);
 live.controller.transport=async()=>({CurrentTransportState:'PLAYING',PlaybackReady:true});await live.checkPlayback();assert.equal(live.state.playbackReady,true);
});

test('starting a stream reads but never resets the volume chosen before playback',async()=>{
 for(const airplay of [false,true]){
  const live=session(),calls=[];live.connected=false;live.volumeSupported=true;live.engine={bytes:4};
  const output={volume:async value=>{assert.equal(value,undefined);calls.push('get-volume');return {CurrentVolume:4};},play:async()=>{calls.push('play');},setUri:async()=>{calls.push('uri');}};
  if(airplay)live.airplay=output;else live.controller=output;
  await live.connect('test');
  assert.deepEqual(calls,airplay?['get-volume','play']:['get-volume','uri','play']);
  assert.equal(live.state.volume,4);
  await live.connect('test');assert.equal(calls.filter(c=>c==='get-volume').length,1);
 }
});

test('an unreadable volume cannot start receiver playback',async()=>{
 for(const mode of ['read-error','unknown']){
  const live=session(),calls=[];live.connected=false;live.volumeSupported=true;live.engine={bytes:4,stop:async()=>{}};
  live.controller={
   async volume(){if(mode==='read-error')throw Error('Receiver unavailable');return {CurrentVolume:''};},
   async setUri(){calls.push('uri');},async play(){calls.push('play');},async stop(){calls.push('stop');}
  };
  await assert.rejects(live.connect('test'),/volume.unavailable/);
  assert.equal(calls.includes('uri'),false);assert.equal(calls.includes('play'),false);assert.equal(live.state.active,false);
 }
});

test('receivers without volume control keep their external volume handling',async()=>{
 const live=session();live.connected=false;live.engine={bytes:4};let played=false;
 live.controller={setUri:async()=>{},play:async()=>{played=true;},volume:async()=>{throw Error('Must not query unsupported volume');}};
 await live.connect('test');assert.equal(played,true);assert.equal(live.state.volume,null);
});
