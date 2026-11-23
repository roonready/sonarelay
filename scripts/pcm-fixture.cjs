const { EventEmitter } = require('node:events');
class PcmFixture {
 events=new EventEmitter();
 running=false;
 async start(){this.running=true;}
 async stop(){this.running=false;this.events.removeAllListeners();}
 onAudioData(callback){this.events.on('pcm',callback);}
 push(pcm){if(this.running)this.events.emit('pcm',pcm);}
}

module.exports = { PcmFixture };
