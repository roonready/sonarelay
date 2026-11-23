import { app, ipcMain, type WebContents } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { MusicMetadataSnapshot, MusicPlaybackSnapshot } from '../../shared/types';
import type { AudioSource } from '../audio/audio-source';

export const loopbackSampleRate = 44100;
const powershell = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
function args(script: string, ...parameters: string[]) {
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'native-audio') : path.join(app.getAppPath(), 'assets/native');
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-MTA', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(directory, script), ...parameters];
}

function launch(script: string, ...parameters: string[]) {
  const child = spawn(powershell, args(script, ...parameters), { windowsHide: true, stdio: 'pipe' });
  child.stdin.on('error', () => {});
  return child;
}

function close(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise<void>(resolve => {
    const timeout = setTimeout(() => { child.kill(); }, 1500);
    child.once('close', () => { clearTimeout(timeout); resolve(); });
    child.stdin.end();
  });
}

class LoopbackSource implements AudioSource {
  private child?: ChildProcessWithoutNullStreams;
  private receive?: (pcm: Buffer) => void;
  constructor(private pid: number) {}
  onAudioData(receive: (pcm: Buffer) => void) { this.receive = receive; }
  start() {
    const child = this.child = launch('process-loopback.ps1', '-ProcessId', String(this.pid));
    return new Promise<void>((resolve, reject) => {
      let tail: Buffer = Buffer.alloc(0);
      let diagnostic = '';
      const timeout = setTimeout(() => reject(new Error('monitor.noPcm')), 8000);
      child.stderr.setEncoding('utf8').on('data', (message: string) => { diagnostic = (diagnostic + message).slice(-1000); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', () => {
        clearTimeout(timeout);
        if (this.child === child && diagnostic.trim()) console.error('Process Loopback:', diagnostic.trim());
        reject(new Error('monitor.captureFailed'));
      });
      child.stdout.on('data', (chunk: Buffer) => {
        const data = tail.length ? Buffer.concat([tail, chunk]) : chunk;
        const length = data.length - data.length % 4;
        tail = Buffer.from(data.subarray(length));
        for (let offset = 0; offset < length; offset += 65536) {
          this.receive?.(data.subarray(offset, Math.min(length, offset + 65536)));
        }
        if (length) { clearTimeout(timeout); resolve(); }
      });
    });
  }
  async stop() {
    const child = this.child;
    this.child = undefined;
    this.receive = undefined;
    if (child) await close(child);
  }
}

type CurrentMedia = Omit<MusicPlaybackSnapshot, 'trackId'> & { artwork: string | null };
function executable(sourceId: string) {
  const named: Record<string, string> = { chrome: 'chrome.exe', msedge: 'msedge.exe', microsoftedge: 'msedge.exe', firefox: 'firefox.exe', roon: 'Roon.exe' };
  return named[sourceId.toLowerCase()] ?? (/^[a-z\d_.-]+\.exe$/i.test(sourceId) ? sourceId : undefined);
}

export function registerWindowsMedia(ui: WebContents, onSnapshot: (snapshot: MusicMetadataSnapshot) => void) {
  let snapshot: MusicMetadataSnapshot = { artwork: null, updatedAt: 0, error: '' };
  let stopping = false;
  let sourceId: string | undefined;
  let lastUpdate = 0;
  let retry: NodeJS.Timeout | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  const publish = (next: MusicMetadataSnapshot) => {
    snapshot = next;
    if (!ui.isDestroyed()) ui.send('metadata:state', next);
    onSnapshot(next);
  };
  const empty = (error = '') => ({ artwork: null, updatedAt: Date.now(), error });
  const start = () => {
    const process = child = launch('gsmtc.ps1');
    const lines = createInterface({ input: process.stdout });
    process.stderr.resume();
    process.on('error', console.error);
    lines.on('line', line => {
      if (stopping) return;
      let media: CurrentMedia | null;
      try { media = JSON.parse(line) as CurrentMedia | null; }
      catch { return; }
      sourceId = media?.sourceId;
      lastUpdate = Date.now();
      if (!media) { if (snapshot.playback || snapshot.error) publish(empty()); return; }
      const { artwork, ...fields } = media;
      const playback: MusicPlaybackSnapshot = { ...fields,
        trackId: JSON.stringify([sourceId, fields.artist, fields.title, fields.album]) };
      publish({ playback, artwork, updatedAt: lastUpdate, error: '' });
    });
    process.once('close', () => {
      lines.close();
      if (stopping) return;
      sourceId = undefined;
      publish(empty('monitor.unavailable'));
      retry = setTimeout(start, 3000);
    });
  };
  ipcMain.handle('metadata:get', event => {
    if (event.sender !== ui) throw new Error('Forbidden');
    return snapshot;
  });
  if (process.platform === 'win32') start();
  return {
    async capture() {
      const current = sourceId;
      const image = process.platform === 'win32' && current && executable(current);
      if (!image || Date.now() - lastUpdate > 5000) {
        throw new Error('monitor.noSource');
      }
      let pid: number;
      try {
        const result = await promisify(execFile)(powershell, args('media-process.ps1', '-Executable', image),
          { windowsHide: true, timeout: 5000 });
        pid = Number(result.stdout.trim());
        if (!Number.isInteger(pid) || pid <= 0 || current !== sourceId) throw new Error();
      } catch {
        throw new Error('monitor.ambiguousProcess');
      }
      return { source: new LoopbackSource(pid), title: snapshot.playback?.title || 'SonaRelay Live' };
    },
    async dispose() {
      stopping = true;
      clearTimeout(retry);
      ipcMain.removeHandler('metadata:get');
      if (child) await close(child);
    },
  };
}
