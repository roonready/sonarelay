import fs from 'node:fs/promises';
import path from 'node:path';
import { MUSIC_CONSENT_VERSION, type MusicConsentState } from '../../shared/music-consent';

export class MusicConsentStore {
  private file: string;
  constructor(private directory: string, private sessionDirectory = directory) { this.file = path.join(directory, 'music-consent.json'); }
  async state(): Promise<MusicConsentState> {
    let accepted = false;
    try {
      const record = JSON.parse(await fs.readFile(this.file, 'utf8'));
      accepted = record.version === MUSIC_CONSENT_VERSION && typeof record.acceptedAt === 'string' && Number.isFinite(Date.parse(record.acceptedAt));
    } catch { /* Missing, unreadable, old or invalid consent is never acceptance. */ }
    return { version: MUSIC_CONSENT_VERSION, accepted, sessionPath: path.join(this.sessionDirectory, 'Partitions', 'yandex-music') };
  }
  async accept(version: unknown) {
    if (version !== MUSIC_CONSENT_VERSION) throw new Error('musicConsent.changed');
    try {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(this.file + '.tmp', JSON.stringify({ version, acceptedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
      await fs.rename(this.file + '.tmp', this.file);
    } catch { throw new Error('musicConsent.saveError'); }
  }
  async requireAccepted() { if (!(await this.state()).accepted) throw new Error('musicConsent.required'); }
}
