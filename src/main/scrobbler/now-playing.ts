import { createHash, randomUUID } from 'node:crypto';
import type { MusicPlaybackSnapshot } from '../../shared/types';
import { artworkBytes, inspectArtwork } from './image';

type Destination = { url: string; token: string };
type Metadata = { Title: string; Artist: string; AlbumTitle?: string; AlbumArtist?: string;
  TrackNumber?: number; AlbumTrackCount?: number };
type Track = { key: string; metadata: Metadata; position: number | null };
type Artwork = Pick<Awaited<ReturnType<typeof inspectArtwork>>, 'pHash' | 'pHashVersion' | 'width' | 'height'>;
type Playback = {
  destination: Destination; track: Track; id: string; nextPut: number;
  bytes?: Buffer; artwork?: Artwork; artworkSha256?: string; uploading?: AbortController;
};
type Stop = { playback: Playback; nextTry: number; expires: number };

const sameDestination = (a?: Destination, b?: Destination) => a?.url === b?.url && a?.token === b?.token;
const number = (value?: number) => value !== undefined && Number.isInteger(value) && value > 0 && value <= 2147483647
  ? value : undefined;
const text = (value: string) => Array.from(value.replace(/\0/g, '').trim()).slice(0, 512).join('');

export class NowPlayingReporter {
  private destination?: Destination;
  private track?: Track;
  private active?: Playback;
  private stops = new Map<string, Stop>();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  private lastSnapshot = 0;
  private latestArtwork: string | null = null;

  constructor(private send = fetch, private heartbeatMs = 60000, private retryMs = 3000) {}

  configure(destination?: Destination) {
    if (this.stopped || sameDestination(this.destination, destination)) return;
    this.destination = destination;
    this.replace();
  }

  observe(snapshot?: MusicPlaybackSnapshot, image: string | null = null) {
    if (this.stopped) return;
    this.lastSnapshot = Date.now();
    const Title = snapshot?.playing ? text(snapshot.title) : '';
    const Artist = snapshot?.playing ? text(snapshot.artist) : '';
    if (!snapshot || !Title || !Artist) {
      if (this.track) {
        this.track = undefined;
        this.latestArtwork = null;
        this.replace();
      }
      return;
    }
    const metadata = { Title, Artist, AlbumTitle: text(snapshot.album ?? '') || undefined,
      AlbumArtist: text(snapshot.albumArtist ?? '') || undefined, TrackNumber: number(snapshot.trackNumber),
      AlbumTrackCount: number(snapshot.albumTrackCount) };
    const key = JSON.stringify([snapshot.sourceId, snapshot.trackId, metadata]);
    const position = snapshot.position !== null && Number.isFinite(snapshot.position) ? snapshot.position : null;
    const previous = this.track;
    const replay = position !== null && position >= 0 && position < 2
      && previous?.position != null && previous.position > 5 && previous.position - position > 5;
    this.track = { key, metadata, position };
    if (key !== previous?.key || replay) {
      this.latestArtwork = image;
      this.replace();
    } else if (image && image !== this.latestArtwork) {
      this.latestArtwork = image;
      const playback = this.active;
      const bytes = artworkBytes(image);
      if (!playback || !bytes) return;
      playback.uploading?.abort();
      playback.uploading = undefined;
      playback.bytes = bytes;
      playback.artwork = undefined;
      playback.artworkSha256 = undefined;
      playback.nextPut = 0;
      this.schedule();
    }
  }

  private replace() {
    this.active?.uploading?.abort();
    this.active = this.destination && this.track ? {
      destination: this.destination, track: this.track, id: randomUUID(), nextPut: 0,
      bytes: artworkBytes(this.latestArtwork),
    } : undefined;
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.stopped || this.running) return;
    const now = Date.now();
    let next = this.active ? Math.min(this.active.nextPut, this.lastSnapshot + 15000) : Infinity;
    for (const [id, stop] of this.stops) {
      if (stop.expires <= now) this.stops.delete(id);
      else if (id !== this.active?.id) next = Math.min(next, stop.nextTry);
    }
    if (Number.isFinite(next)) this.timer = setTimeout(() => {
      this.running = this.deliver().finally(() => { this.running = undefined; this.schedule(); });
    }, Math.max(0, next - now));
  }

  private async request(playback: Playback, method: 'PUT' | 'DELETE') {
    const { url, token } = playback.destination;
    const path = '/api/now-playing' + (method === 'DELETE' ? '/' + playback.id : '');
    try {
      const response = await this.send(url + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(4000),
        headers: method === 'PUT' ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
          : { Authorization: 'Bearer ' + token },
        body: method === 'PUT' ? JSON.stringify({
          playbackId: playback.id, ...playback.track.metadata, artwork: playback.artwork,
          artworkSha256: playback.artworkSha256,
        }) : undefined,
      });
      if (method === 'PUT' && response.status === 200) {
        const { artwork } = await response.json() as { artwork?: { action?: string } };
        return { status: response.status, action: artwork?.action };
      }
      await response.body?.cancel();
      return { status: response.status };
    } catch { return { status: 0 }; }
  }

  private uploadArtwork(playback: Playback) {
    if (!playback.bytes || playback.uploading || this.active !== playback || this.stopped) return;
    const { url, token } = playback.destination;
    const controller = playback.uploading = new AbortController();
    const bytes = new Uint8Array(playback.bytes);
    const sendArtwork = async () => {
      let status = 0;
      try {
        const response = await this.send(url + '/api/now-playing/' + playback.id + '/artwork', {
          method: 'PUT', redirect: 'error', body: bytes,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
        });
        status = response.status;
        await response.body?.cancel();
      } catch { /* Retry through the next playback announcement. */ }
      finally { if (playback.uploading === controller) playback.uploading = undefined; }
      if (controller.signal.aborted || this.active !== playback || this.stopped) return;
      if (status === 200 || [400, 413, 415, 422].includes(status)) playback.bytes = undefined;
      else playback.nextPut = Math.min(playback.nextPut, Date.now() + this.retryMs);
      this.schedule();
    };
    void sendArtwork();
  }

  private async deliver() {
    const now = Date.now();
    if (this.active && now - this.lastSnapshot >= 15000) {
      this.track = undefined;
      this.latestArtwork = null;
      this.replace();
    }
    const playback = this.active;
    if (playback && playback.nextPut <= now) {
      if (playback.bytes && !playback.artwork) {
        const bytes = playback.bytes;
        try {
          const { pHash, pHashVersion, width, height } = await inspectArtwork(bytes);
          if (bytes !== playback.bytes) return;
          playback.artwork = { pHash, pHashVersion, width, height };
          playback.artworkSha256 = createHash('sha256').update(bytes).digest('hex');
        } catch {
          if (bytes !== playback.bytes) return;
          playback.bytes = undefined;
        }
      }
      if (this.active !== playback || this.stopped) return;
      // Even a timed-out PUT could have reached the server. Retain its ID for conditional cleanup.
      this.stops.set(playback.id, { playback, nextTry: 0, expires: now + 310000 });
      const submittedBytes = playback.bytes;
      const { status, action } = await this.request(playback, 'PUT');
      if (submittedBytes !== playback.bytes || this.active !== playback || this.stopped) return;
      const success = status === 204 || status === 200;
      if (success) {
        for (const [id, stop] of this.stops) {
          if (id !== playback.id && sameDestination(playback.destination, stop.playback.destination)) this.stops.delete(id);
        }
      }
      playback.nextPut = Date.now() + (success || status === 401 || status === 403 || status === 404
        ? this.heartbeatMs : this.retryMs);
      if (action === 'reuse') playback.bytes = undefined;
      else if (action === 'upload') this.uploadArtwork(playback);
      return;
    }
    const stop = [...this.stops.values()].find(item => item.playback.id !== playback?.id && item.nextTry <= now);
    if (!stop) return;
    const { status } = await this.request(stop.playback, 'DELETE');
    if (status === 204 || status === 401 || status === 403 || status === 404) this.stops.delete(stop.playback.id);
    else stop.nextTry = Date.now() + this.retryMs;
  }

  async dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.active?.uploading?.abort();
    await this.running;
    await Promise.all([...this.stops.values()].map(({ playback }) => this.request(playback, 'DELETE')));
    this.stops.clear();
    this.active = undefined;
    this.track = undefined;
    this.destination = undefined;
    this.latestArtwork = null;
  }
}
