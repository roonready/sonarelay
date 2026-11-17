import { EventEmitter } from 'node:events';
import { emptyRadioState, radioStations, type RadioMetadata, type RadioState } from '../../shared/radio';
import type { RendererDevice, MusicPlaybackSnapshot } from '../../shared/types';
import { AudioEngine } from '../audio/audio-engine';
import type { LiveSession } from '../audio/live-session';
import { RadioSource, RADIO_FORMAT } from './source';
import { NativeOutput } from './native-output';

export class RadioService extends EventEmitter {
  state: RadioState = emptyRadioState();
  private desired?: { stationId: string; outputId: string };
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private source?: RadioSource;
  private engine?: AudioEngine;
  private output?: NativeOutput;
  private ownsLive = false;
  private readiness?: NodeJS.Timeout;
  private disposed = false;
  private playbackTimer?:NodeJS.Timeout;
  private pcmBytes=0;
  private lastPcmAt=0;
  private observedPcm=0;
  private observedAt=0;
  private position=0;
  private trackKey='';
  private trackSerial=0;
  private liveListener = () => {
    if (!this.ownsLive || !this.desired) return;
    if (this.live.state.error) { void this.fail(this.live.state.error); return; }
    if (this.live.state.playbackReady) this.playing();
  };
  constructor(private live: LiveSession, private resolveOutput: (id: string) => RendererDevice | undefined,
    private address: () => string, private prepare: () => Promise<void>,
    private nativeFactory: () => NativeOutput, private sourceFactory = (url: string) => new RadioSource(url),
    private clock={now:()=>performance.now()}) {
    super(); live.on('state', this.liveListener);
  }
  private publish(patch: Partial<RadioState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.emit('state', { ...this.state, metadata: { ...this.state.metadata } }); this.publishPlayback(); } }
  private publishPlayback() {
    if(this.state.mode!=='radio')return;
    const now=this.clock.now(),{artist,title}=this.state.metadata;
    const key=artist.trim()&&title.trim()?JSON.stringify([this.state.stationId,artist.trim(),title.trim()]):'';
    if(!key){this.trackKey='';this.position=0;this.observedPcm=this.pcmBytes;this.observedAt=now;this.emit('playback',undefined);return;}
    if(key!==this.trackKey){this.trackKey=key;this.trackSerial++;this.position=0;this.observedPcm=this.pcmBytes;this.observedAt=now;}
    const receiverStopped=this.ownsLive&&(!this.live.state.playbackReady||/^(PAUSED_PLAYBACK|PAUSED|STOPPED|NO_MEDIA_PRESENT)$/.test(this.live.state.status)||this.live.state.encoding!=='alac'&&this.live.state.connections===0);
    const playing=this.state.status==='playing'&&!!this.desired&&!receiverStopped&&now-this.lastPcmAt<=2500;
    const wall=(now-this.observedAt)/1000,pcm=(this.pcmBytes-this.observedPcm)/(RADIO_FORMAT.sampleRate*4);
    if(playing&&wall>0&&wall<=5&&pcm>0)this.position+=Math.min(wall,pcm);
    this.observedAt=now;this.observedPcm=this.pcmBytes;
    const playback:MusicPlaybackSnapshot={source:'radio',sourceId:this.state.stationId,title,artist,album:'',trackId:`${this.state.stationId}:${this.trackSerial}`,duration:null,position:this.position,playing,rate:1};
    this.emit('playback',playback);
  }
  private playing() { clearTimeout(this.readiness); if (this.desired) this.publish({ status: 'playing' }); }
  toggle(stationId: string, outputId: string) {
    if (this.desired?.stationId === stationId) return this.stop();
    if (!radioStations.some(station => station.id === stationId)) return Promise.reject(new Error('radio.invalidStation'));
    return this.schedule({ stationId, outputId });
  }
  route(outputId: string) { return this.desired ? this.schedule({ ...this.desired, outputId }) : Promise.resolve(this.state); }
  stop() { return this.schedule(undefined); }
  async music() { await this.stop(); this.publish({ mode: 'music' }); return this.state; }
  private fail(error: string) { return this.schedule(undefined, error.startsWith('radio.')||error.startsWith('volume.') ? error : 'radio.connectionError'); }
  private schedule(desired?: { stationId: string; outputId: string }, error = ''): Promise<RadioState> {
    if (this.disposed) return Promise.resolve(this.state);
    const revision = ++this.revision; this.desired = desired;
    // Interrupt in-flight network/decoder startup before waiting for its queued operation.
    void this.source?.stop(); void this.output?.stop(); clearTimeout(this.readiness);
    this.publish({ mode: 'radio', status: desired ? 'connecting' : error ? 'error' : 'stopped', error, ...(desired ? { stationId: desired.stationId, outputId: desired.outputId, metadata: emptyRadioState().metadata,stream:null } : {}) });
    const task = this.queue.catch(() => {}).then(async () => {
      await this.cleanup();
      if (revision !== this.revision || !desired || this.disposed) return this.state;
      const station = radioStations.find(station => station.id === desired.stationId)!;
      try {
        await this.prepare(); if (revision !== this.revision) return this.state;
        const source = this.source = this.sourceFactory(station.streamUrl);
        source.on('stream-info',stream=>{if(revision===this.revision)this.publish({stream});});
        this.pcmBytes=0;this.observedPcm=0;this.observedAt=this.clock.now();
        source.onAudioData(pcm=>{this.pcmBytes+=pcm.length;this.lastPcmAt=this.clock.now();});
        this.playbackTimer=setInterval(()=>this.publishPlayback(),1000);
        source.on('metadata', (metadata: Partial<RadioMetadata>) => { if (revision === this.revision) this.publish({ metadata: { ...this.state.metadata, ...metadata } }); });
        source.on('failure', error => { if (revision === this.revision) void this.fail(error); });
        if (desired.outputId) {
          const device = this.resolveOutput(desired.outputId); if (!device) throw new Error('radio.outputError');
          this.ownsLive = true;
          await this.live.begin(device, this.address(), RADIO_FORMAT.sampleRate, { source, title: station.name });
          if (revision !== this.revision) return this.state;
          await this.live.connect(this.live.state.sessionId);
        } else {
          const engine = this.engine = new AudioEngine(source, RADIO_FORMAT);
          const output = this.output = this.nativeFactory();
          output.on('failure', error => { if (revision === this.revision) void this.fail(error); });
          output.on('playing', () => { if (revision === this.revision) this.playing(); });
          await output.start(engine, source);
          if (revision !== this.revision) return this.state;
          await engine.start();
        }
        if (revision === this.revision && this.state.status !== 'playing') this.readiness = setTimeout(() => { if (revision === this.revision) void this.fail('radio.timeout'); }, 30000);
      } catch (error) {
        if (revision === this.revision) {
          this.desired = undefined; await this.cleanup();
          const key = error instanceof Error && (error.message.startsWith('radio.')||error.message.startsWith('volume.')) ? error.message : 'radio.connectionError';
          this.publish({ status: 'error', error: key });
        }
      }
      return this.state;
    });
    this.queue = task; return task;
  }
  private async cleanup() {
    clearTimeout(this.readiness);
    clearInterval(this.playbackTimer);this.playbackTimer=undefined;
    const source = this.source, engine = this.engine, output = this.output, ownsLive = this.ownsLive;
    this.source = undefined; this.engine = undefined; this.output = undefined; this.ownsLive = false;
    await Promise.allSettled([source?.stop(), output?.stop(), engine?.stop(), ownsLive ? this.live.stop() : undefined]);
  }
  async dispose() {
    await this.stop(); this.disposed = true; this.live.off('state', this.liveListener); this.removeAllListeners();
  }
}
