import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AudioSource } from '../audio/audio-source';
import { ffmpegPath } from '../audio/flac-encoder';
import { RadioHttpStream } from './http-stream';
import { IcyDemux } from './icy';

export const RADIO_FORMAT = { sampleRate: 48000, channels: 2, bitDepth: 16 } as const;
export class RadioSource extends EventEmitter implements AudioSource {
  private http: RadioHttpStream;
  private child?: ChildProcessWithoutNullStreams;
  private demux?: IcyDemux;
  private running = false;
  private ended = false;
  private remainder = Buffer.alloc(0);
  private rejectStart?: (error: Error) => void;
  private stopTask?: Promise<void>;
  constructor(readonly streamUrl: string, private timeout = 15000) { super(); this.http = new RadioHttpStream(timeout); }
  onAudioData(callback: (pcm: Buffer) => void) { this.on('pcm', callback); }
  pause() { this.child?.stdout.pause(); }
  resume() { this.child?.stdout.resume(); }
  async start() {
    if (this.running || this.ended) throw new Error('radio.cancelled');
    this.running = true;
    try {
      const response = await this.http.open(this.streamUrl);
      if (!this.running) throw new Error('radio.cancelled');
      const interval = Number(response.headers['icy-metaint'] ?? 0);
      const demux = this.demux = new IcyDemux(interval);
      this.emit('metadata', { station: String(response.headers['icy-name'] ?? '').slice(0, 2048) });
      demux.on('metadata', value => this.emit('metadata', value));
      const child = this.child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-re', '-analyzeduration', '1000000', '-probesize', '65536', '-i', 'pipe:0', '-vn', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
      const first = new Promise<void>((resolve, reject) => {
        this.rejectStart = reject;
        child.stdout.on('data', (chunk: Buffer) => {
          if (!this.running) return;
          const buffer = this.remainder.length ? Buffer.concat([this.remainder, chunk]) : chunk;
          const aligned = buffer.length - buffer.length % 4;
          this.remainder = Buffer.from(buffer.subarray(aligned));
          for (let position = 0; position < aligned; position += 65536) this.emit('pcm', buffer.subarray(position, Math.min(aligned, position + 65536)));
          if (aligned) { this.rejectStart = undefined; resolve(); }
        });
      });
      void first.catch(() => {});
      const fail = () => { if (this.running) { this.rejectStart?.(new Error('radio.connectionError')); this.emit('failure', 'radio.connectionError'); } };
      response.on('error', fail); response.on('aborted', fail); response.on('end', fail);
      child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail); child.stderr.resume(); demux.on('error', fail);
      response.pipe(demux).pipe(child.stdin);
      let timer: NodeJS.Timeout | undefined;
      try { await Promise.race([first, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('radio.timeout')), this.timeout); })]); }
      finally { clearTimeout(timer); }
    } catch (error) { await this.stop(); throw error; }
  }
  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask;
    this.running = false; this.ended = true;
    this.rejectStart?.(new Error('radio.cancelled')); this.rejectStart = undefined;
    this.http.stop(); this.demux?.destroy(); this.remainder = Buffer.alloc(0);
    const child = this.child; this.child = undefined;
    this.stopTask = new Promise<void>(resolve => {
      if (!child || child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { child.kill(); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.destroy(); child.kill();
    }).then(() => { this.removeAllListeners(); });
    return this.stopTask;
  }
}
