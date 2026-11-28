import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { performance } from 'node:perf_hooks';
import type { MusicMetadataSnapshot, ScrobblerSettings, ScrobblerState } from '../../shared/types';
import { ListeningTracker } from '../runtime/listening';
import { ArtworkConfirmation, artworkBytes, inspectArtwork } from './image';
import type { NowPlayingReporter } from './now-playing';

const defaultUrl = 'http://127.0.0.1:3000';
type DeliveryError = ScrobblerState['error'];
interface Scrobble {
  eventId: string;
  startedAt: string;
  durationSeconds?: number;
  Title: string;
  Artist: string;
  AlbumTitle?: string;
  AlbumArtist?: string;
  TrackNumber?: number;
  AlbumTrackCount?: number;
}
type Observation = Pick<Awaited<ReturnType<typeof inspectArtwork>>, 'pHash' | 'pHashVersion' | 'width' | 'height'>;
type PendingCover = { bytes: Buffer; observation?: Observation; scrobbleId?: string; retryAt: number; delay: number };
type Delivery = { status: number; sent?: boolean; coverSkipped?: boolean; scrobbleId?: string };
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
interface Saved {
  url: string;
  enabled: boolean;
  encryptedToken?: string;
  queue: Scrobble[];
  lastSent: number | null;
  rejected: number;
  blocked?: 'auth' | 'endpoint';
}
interface TokenStorage {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

function endpoint(input: string) {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('scrobbler.invalidUrl'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const [first, second] = url.hostname.split('.').map(Number);
  const lan = isIPv4(url.hostname) &&
    (first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168));
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || lan))) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('scrobbler.invalidUrl');
  }
  return url.origin;
}

function metadata(value?: string, limit = 512) {
  return value?.trim() ? Array.from(value.replace(/\0/g, '')).slice(0, limit).join('') : undefined;
}

function positive(value?: number) {
  return value !== undefined && Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : undefined;
}

export class ScrobblerService {
  private saved: Saved = { url: defaultUrl, enabled: false, queue: [], lastSent: null, rejected: 0 };
  private token = '';
  private error: DeliveryError = '';
  private readonly tracker = new ListeningTracker();
  private readonly artwork = new ArtworkConfirmation();
  private staged: Scrobble[] = [];
  // Keep at most four GSMTC images in memory. The persistent queue contains track metadata only.
  private covers = new Map<string, PendingCover>();
  private operations: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private delivery?: Promise<void>;
  private controller?: AbortController;
  private retry = 0;
  private revision = 0;
  private stopped = false;
  private loaded = false;
  readonly ready: Promise<void>;

  constructor(private file: string, private crypto: TokenStorage,
    private publish: (state: ScrobblerState) => void, private send = fetch,
    private nowPlaying?: NowPlayingReporter) {
    this.ready = this.load();
  }

  snapshot(): ScrobblerState {
    return {
      url: this.saved.url, enabled: this.saved.enabled, hasToken: Boolean(this.token),
      pending: this.saved.queue.length + this.staged.length + this.pendingUploads().length,
      lastSent: this.saved.lastSent, rejected: this.saved.rejected,
      error: this.error || this.saved.blocked || (this.pendingUploads().some(([, cover]) => cover.delay) ? 'retry' : ''),
    };
  }

  private async load() {
    try {
      try {
        const saved = JSON.parse(await readFile(this.file, 'utf8')) as Saved;
        if (!Array.isArray(saved.queue) || endpoint(saved.url) !== saved.url) throw new Error();
        // Older profiles may contain Thumbnail, which the current API rejects.
        for (const event of saved.queue as Array<Scrobble & { Thumbnail?: string }>) delete event.Thumbnail;
        this.saved = saved;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      this.loaded = true;
      if (this.saved.encryptedToken) this.token = await this.crypto.decrypt(this.saved.encryptedToken);
    } catch { this.error = 'storage'; }
    this.configureNowPlaying();
    this.notify();
    this.schedule();
  }

  private configureNowPlaying() {
    this.nowPlaying?.configure(this.saved.enabled && this.token
      ? { url: this.saved.url, token: this.token } : undefined);
  }

  private run<T>(operation: () => Promise<T>) {
    const result = this.operations.then(operation);
    this.operations = result.catch(() => {});
    return result;
  }

  private async persist(next: Saved) {
    await writeFile(this.file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    await rename(this.file + '.tmp', this.file);
    this.saved = next;
  }

  private notify() { this.publish(this.snapshot()); }

  async configure(input: ScrobblerSettings) {
    await this.ready;
    return this.run(async () => {
      if (!this.loaded || this.stopped) throw new Error('Settings unavailable');
      const url = endpoint(input.url);
      const differentOrigin = url !== this.saved.url;
      const token = input.token?.trim();
      if (token && !/^[\w-]{43}$/.test(token)) throw new Error('scrobbler.invalidToken');
      if (input.enabled && !token && (!this.token || differentOrigin)) throw new Error('scrobbler.tokenRequired');
      const previousUploads = differentOrigin ? this.pendingUploads() : [];
      if (differentOrigin && input.transferQueue !== true &&
          (this.saved.queue.length || this.staged.length || previousUploads.length)) {
        throw new Error('scrobbler.pendingOrigin');
      }
      const encryptedToken = token ? await this.crypto.encrypt(token)
        : differentOrigin ? undefined : this.saved.encryptedToken;
      const resetTracker = input.enabled !== this.saved.enabled;
      const blocked = !differentOrigin && !token && this.saved.blocked === 'auth' ? 'auth' : undefined;
      await this.persist({ ...this.saved, enabled: input.enabled, url, encryptedToken, blocked });
      this.revision++;
      this.controller?.abort();
      if (resetTracker) this.tracker.reset();
      for (const [eventId] of previousUploads) this.covers.delete(eventId);
      this.token = token || (encryptedToken ? this.token : '');
      this.configureNowPlaying();
      this.retry = 0;
      for (const cover of this.covers.values()) { cover.retryAt = 0; cover.delay = 0; }
      this.error = '';
      this.notify();
      this.schedule();
      return this.snapshot();
    });
  }

  consume(snapshot: MusicMetadataSnapshot, now = performance.now()) {
    const artwork = this.artwork.observe(snapshot.playback, snapshot.artwork);
    this.nowPlaying?.observe(snapshot.playback, artwork);
    if (!this.saved.enabled || !this.loaded || this.stopped) return;
    const result = this.tracker.observe(snapshot.playback, { scrobbling: true, nowPlaying: false },
      now, snapshot.updatedAt);
    if (!result?.scrobble) return;
    const track = result.track;
    const Title = metadata(track.title), Artist = metadata(track.artist);
    if (!Title?.trim() || !Artist?.trim()) return;
    const eventId = randomUUID();
    const bytes = this.covers.size < 4 ? artworkBytes(artwork) : undefined;
    if (bytes) this.covers.set(eventId, { bytes, retryAt: 0, delay: 0 });
    this.staged.push({
      eventId, startedAt: new Date(result.startedAt * 1000).toISOString(), Title, Artist,
      durationSeconds: result.duration,
      AlbumTitle: metadata(track.album), AlbumArtist: metadata(track.albumArtist),
      TrackNumber: positive(track.trackNumber), AlbumTrackCount: positive(track.albumTrackCount),
    });
    void this.run(() => this.flush()).catch(() => {
      this.error = 'storage';
      this.notify();
      this.schedule(2000);
    });
  }

  private async flush() {
    const staged = this.staged.slice();
    if (!staged.length) return;
    await this.persist({ ...this.saved, queue: [...this.saved.queue, ...staged] });
    this.staged.splice(0, staged.length);
    if (this.error === 'storage') this.error = '';
    this.notify();
    this.schedule(this.retry);
  }

  private pendingUploads() {
    return [...this.covers].filter(([eventId, cover]) =>
      cover.scrobbleId && !this.saved.queue.some(event => event.eventId === eventId));
  }

  private schedule(delay = 0) {
    clearTimeout(this.timer);
    if (this.stopped || this.delivery) return;
    const uploads = this.pendingUploads();
    if (!this.staged.length) {
      if (!this.saved.enabled || !this.token || this.saved.blocked || (!this.saved.queue.length && !uploads.length)) return;
      if (!this.saved.queue.length) delay = Math.max(0, Math.min(...uploads.map(([, cover]) => cover.retryAt)) - Date.now());
    }
    this.timer = setTimeout(() => {
      this.delivery = this.deliver().catch(() => {
        this.error = 'storage';
        this.retry = Math.max(this.retry, 2000);
        this.notify();
      }).finally(() => {
        this.delivery = undefined;
        this.schedule(this.retry);
      });
    }, delay);
  }

  private async postEvent(url: string, event: Scrobble, token: string, signal: AbortSignal): Promise<Delivery> {
    let cover = this.covers.get(event.eventId);
    if (cover?.scrobbleId) return { status: 200, sent: true };
    if (cover && !cover.observation) {
      try {
        const { pHash, pHashVersion, width, height } = await inspectArtwork(cover.bytes);
        cover.observation = { pHash, pHashVersion, width, height };
      } catch {
        this.covers.delete(event.eventId);
        cover = undefined;
      }
    }
    const response = await this.send(url + '/api/scrobbles', {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, artwork: cover?.observation }),
    });
    if (response.status !== 201 && response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status };
    }
    const result = await response.json() as { scrobbleId?: string; duplicate?: boolean; artwork?: { action?: string } };
    const action = result.artwork?.action;
    if (!result.scrobbleId || !uuid.test(result.scrobbleId) || !action || !['none', 'reuse', 'upload'].includes(action)
      || (response.status === 200 && result.duplicate !== true)) return { status: 0 };
    return { status: response.status, sent: true, coverSkipped: action === 'upload' && !cover,
      scrobbleId: action === 'upload' && cover ? result.scrobbleId : undefined };
  }

  private async deliverCover(url: string, token: string, signal: AbortSignal, revision: number) {
    const pending = this.pendingUploads().find(([, cover]) => cover.retryAt <= Date.now());
    if (!pending) return;
    const [eventId, cover] = pending;
    let status = 0;
    let accepted = false;
    try {
      const response = await this.send(url + '/api/scrobbles/' + cover.scrobbleId + '/artwork', {
        method: 'PUT', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(cover.bytes),
      });
      status = response.status;
      if (status === 200) accepted = (await response.json() as { action?: string }).action === 'reuse';
      else await response.body?.cancel();
    } catch { /* The next PUT uses the same accepted scrobble ID. */ }

    await this.run(async () => {
      if (revision !== this.revision || this.stopped) return;
      if (accepted || [400, 404, 409, 413, 415, 422].includes(status)) {
        this.covers.delete(eventId);
        this.error = accepted ? '' : 'artwork';
      } else if (status === 401 || status === 403) {
        await this.persist({ ...this.saved, blocked: 'auth' });
        this.error = '';
      } else {
        cover.delay = Math.min(60000, Math.max(1000, cover.delay * 2));
        cover.retryAt = Date.now() + cover.delay;
      }
      this.notify();
    });
  }

  private async deliver() {
    await this.run(() => this.flush());
    if (this.stopped || !this.saved.enabled || !this.token || this.saved.blocked) return;
    const { url, queue: [event] } = this.saved;
    const revision = this.revision;
    const controller = this.controller = new AbortController();
    if (!event) {
      try { await this.deliverCover(url, this.token, controller.signal, revision); }
      finally { this.controller = undefined; }
      return;
    }
    let result: Delivery = { status: 0 };
    try { result = await this.postEvent(url, event, this.token, controller.signal); }
    catch { /* Retry metadata until a valid response is received. */ }
    finally { this.controller = undefined; }

    await this.run(async () => {
      if (revision !== this.revision || this.stopped) return;
      const { status, sent, coverSkipped, scrobbleId } = result;
      const invalid = [400, 413, 415, 422].includes(status);
      if (sent || invalid) {
        await this.persist({ ...this.saved, queue: this.saved.queue.slice(1),
          lastSent: sent ? Date.now() : this.saved.lastSent,
          rejected: sent ? this.saved.rejected : this.saved.rejected + 1 });
        const cover = this.covers.get(event.eventId);
        if (scrobbleId && cover) cover.scrobbleId = scrobbleId;
        else this.covers.delete(event.eventId);
        this.error = coverSkipped ? 'artwork' : '';
        this.retry = 0;
      } else if (status && status < 500 && ![408, 425, 429].includes(status)) {
        await this.persist({ ...this.saved, blocked: status === 401 || status === 403 ? 'auth' : 'endpoint' });
        this.error = '';
      } else {
        this.error = 'retry';
        this.retry = Math.min(60000, Math.max(1000, this.retry * 2));
      }
      this.notify();
    });
  }

  async dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    const playbackShutdown = this.nowPlaying?.dispose();
    await this.ready;
    await Promise.all([this.delivery, playbackShutdown]);
    try { await this.run(() => this.flush()); }
    finally { this.covers.clear(); }
  }
}
