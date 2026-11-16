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
