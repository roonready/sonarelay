import type { LastfmPreferences, MusicPlaybackSnapshot } from '../../shared/types';
import { ListeningTracker } from '../runtime/listening';

export interface LastfmSubmission {
  method: 'track.updateNowPlaying' | 'track.scrobble';
  parameters: Record<string, string>;
}

export class LastfmTracker {
  private listening = new ListeningTracker();

  reset() { this.listening.reset(); }

  preferencesChanged(before: LastfmPreferences, after: LastfmPreferences) {
    this.listening.preferencesChanged(before, after);
  }

  observe(track: MusicPlaybackSnapshot | undefined, settings: LastfmPreferences, now: number, epoch: number): LastfmSubmission[] {
    const observed = this.listening.observe(track, settings, now, epoch);
    if (!observed || (!observed.nowPlaying && !observed.scrobble)) return [];
    const source = observed.track;
    const parameters: Record<string, string> = {
      artist: source.artist.trim().slice(0, 1000), track: source.title.trim().slice(0, 1000),
    };
    if (source.album?.trim()) parameters.album = source.album.trim().slice(0, 1000);
    if (source.albumArtist?.trim()) parameters.albumArtist = source.albumArtist.trim().slice(0, 1000);
    if (source.trackNumber !== undefined && Number.isSafeInteger(source.trackNumber) && source.trackNumber > 0) {
      parameters.trackNumber = String(source.trackNumber);
    }
    if (observed.duration) parameters.duration = String(Math.floor(observed.duration));
    const submissions: LastfmSubmission[] = [];
    if (observed.nowPlaying) submissions.push({ method: 'track.updateNowPlaying', parameters: { ...parameters } });
    if (observed.scrobble) submissions.push({
      method: 'track.scrobble', parameters: { ...parameters, timestamp: String(observed.startedAt) },
    });
    return submissions;
  }
}
