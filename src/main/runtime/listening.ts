import type { LastfmPreferences, MusicPlaybackSnapshot } from '../../shared/types';

interface Play {
  track: MusicPlaybackSnapshot;
  startedAt: number;
  listened: number;
  nowPlaying: boolean;
  submitted: boolean;
}

export class ListeningTracker {
  private current?: Play;
  private previous?: { position: number | undefined; at: number; playing: boolean; rate: number };

  reset() {
    this.current = undefined;
    this.previous = undefined;
  }

  preferencesChanged(before: LastfmPreferences, after: LastfmPreferences) {
    if (this.current && before.scrobbling !== after.scrobbling) {
      this.current.listened = 0;
      this.previous = undefined;
    }
    if (this.current && !before.nowPlaying && after.nowPlaying) this.current.nowPlaying = false;
  }

  observe(track: MusicPlaybackSnapshot | undefined, settings: LastfmPreferences, now: number, epoch: number) {
    if (!track || !track.title?.trim() || !track.artist?.trim()) {
      this.previous = undefined;
      return;
    }
    const position = typeof track.position === 'number' && Number.isFinite(track.position) && track.position >= 0
      ? track.position : undefined;
    const duration = typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0
      ? track.duration : undefined;
    const rate = Number.isFinite(track.rate) && track.rate > 0 ? track.rate : 1;
    const old = this.current?.track;
    const changed = !old || old.title !== track.title || old.artist !== track.artist || old.sourceId !== track.sourceId
      || (old.trackId && track.trackId && old.trackId !== track.trackId);
    const previousPosition = this.previous?.position;
    const replay = !changed && position !== undefined && previousPosition !== undefined && position < 2
      && previousPosition > 5 && position < previousPosition - 5;
    if (changed || replay) {
      this.current = { track: { ...track }, startedAt: track.playing ? Math.floor(epoch / 1000) : 0,
        listened: 0, nowPlaying: false, submitted: false };
      this.previous = undefined;
    }

    const play = this.current!;
    play.track = { ...track };
    let progressed = false;
    if (track.playing && !play.startedAt) play.startedAt = Math.floor(epoch / 1000);
    if (track.playing && this.previous && !this.previous.playing) play.nowPlaying = false;
    if (this.previous && track.playing && this.previous.playing) {
      const wall = (now - this.previous.at) / 1000;
      if (wall > 0 && wall <= 5) {
        if (position !== undefined && this.previous.position !== undefined) {
          const delta = position - this.previous.position;
          const speed = Math.max(rate, this.previous.rate);
          if (delta > 0 && delta <= wall * speed + 1.5) {
            if (settings.scrobbling) play.listened += Math.min(wall, delta / speed);
            progressed = true;
          }
        } else if (duration === undefined && position === undefined && this.previous.position === undefined) {
          if (settings.scrobbling) play.listened += wall;
        }
      }
    }
    this.previous = { position, at: now, playing: track.playing, rate };
    const nowPlaying = settings.nowPlaying && track.playing && (progressed || position === undefined) && !play.nowPlaying;
    if (nowPlaying) play.nowPlaying = true;
    const threshold = duration === undefined ? 120 : Math.min(duration / 2, 120);
    const scrobble = settings.scrobbling && (duration === undefined || duration > 30)
      && play.listened >= threshold && !play.submitted;
    if (scrobble) play.submitted = true;
    return { track, duration, startedAt: play.startedAt, nowPlaying, scrobble };
  }
}
