import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { AudioEngine } from '../audio/audio-engine';

/** Native Windows playback. The PCM comes from the same AudioEngine as network outputs. */
export class NativeOutput extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private detach?: () => void;
  private stopping = false;
  private stopTask?: Promise<void>;
  constructor(private directory: string) { super(); }
  async start(engine: AudioEngine, flow: { pause(): void; resume(): void }) {
    if (this.child || this.stopping) throw new Error('radio.cancelled');
    const executable = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const child = this.child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.directory, 'wave-out.ps1')], { windowsHide: true });
    let line = '';
    const ready = new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (data: Buffer) => {
        line += data.toString('utf8');
        const lines = line.split(/\r?\n/); line = lines.pop() ?? '';
        for (const message of lines) {
          if (message === 'ready') resolve();
          if (message === 'playing' && !this.stopping) this.emit('playing');
          if (message.startsWith('played:')) this.emit('played', Number(message.slice(7)));
        }
      });
      const fail = () => { reject(new Error('radio.outputError')); if (!this.stopping) this.emit('failure', 'radio.outputError'); };
      child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail); child.stderr.resume();
    });
    const consume = (pcm: Buffer) => {
      if (this.stopping || !child.stdin.writable) return;
      if (child.stdin.writableLength > engine.format.sampleRate * 4 * 2) { this.emit('failure', 'radio.outputError'); return; }
      if (!child.stdin.write(pcm)) flow.pause();
    };
    child.stdin.on('drain', () => { if (!this.stopping) flow.resume(); });
    engine.on('pcm', consume); this.detach = () => engine.off('pcm', consume);
    let timer: NodeJS.Timeout | undefined;
    try { await Promise.race([ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('radio.outputError')), 12000); })]); }
    catch (error) { await this.stop(); throw error; }
    finally { clearTimeout(timer); }
  }
  stop(): Promise<void> {
    if (this.stopTask) return this.stopTask;
    this.stopping = true; this.detach?.();
    const child = this.child; this.child = undefined;
    this.stopTask = new Promise(resolve => {
      if (!child || child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { child.kill(); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end();
    });
    return this.stopTask;
  }
}
