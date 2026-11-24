import { EventEmitter } from 'node:events';
import semver from 'semver';
import type { AppUpdateState, UpdateChannel } from '../../shared/types';

export interface UpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  channel: string | null;
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent?: boolean, forceRunAfter?: boolean): void;
}

export function versionChannel(version: string): UpdateChannel {
  const parsed = semver.parse(version);
  if (!parsed || parsed.version !== version || parsed.build.length) throw new Error('Invalid release version');
  if (!parsed.prerelease.length) return 'stable';
  if (parsed.prerelease.length === 2 && parsed.prerelease[0] === 'beta' && typeof parsed.prerelease[1] === 'number') return 'beta';
  throw new Error('Only stable or beta.N versions are supported');
}

export function acceptsUpdate(current: string, candidate: string): boolean {
  try {
    const channel = versionChannel(current), next = versionChannel(candidate);
    return (channel === 'beta' || next === 'stable') && semver.gt(candidate, current);
  } catch { return false; }
}

export class UpdateService extends EventEmitter {
  state: AppUpdateState;
  private subscriptions: Array<[string, (...args: any[]) => void]> = [];
  private disposed = false;
  private checkTask?: Promise<AppUpdateState>;
  private installTask?: Promise<void>;
  private downloadTask?: Promise<void>;

  constructor(private updater: UpdaterAdapter, version: string, enabled: boolean, private beforeInstall: () => Promise<void>,
    private prepareNetwork?: () => Promise<void>) {
    super();
    const channel = versionChannel(version);
    this.state = { status: enabled ? 'idle' : 'disabled', channel, currentVersion: version, version: '', percent: 0, error: '' };
    if (!enabled) return;
    updater.autoDownload = false; // Validate the candidate before starting a background download.
    updater.autoInstallOnAppQuit = false; // Installation always requires the restart button.
    updater.channel = channel === 'stable' ? 'latest' : 'beta';
    updater.allowPrerelease = channel === 'beta';
    updater.allowDowngrade = false; // Setting channel above enables downgrades in electron-updater.
    this.listen('checking-for-update', () => this.update({ status: 'checking', error: '' }));
    this.listen('update-not-available', () => this.update({ status: 'idle', version: '', percent: 0 }));
    this.listen('update-available', info => {
      if (!acceptsUpdate(version, info.version)) { this.update({ status: 'idle', version: '', percent: 0 }); return; }
      this.update({ status: 'available', version: info.version, percent: 0, error: '' });
      this.downloadTask = this.download();
    });
    this.listen('download-progress', progress => {
      if (!this.state.version || !['available', 'downloading'].includes(this.state.status)) return;
      const percent = Number(progress.percent);
      this.update({ status: 'downloading', percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0 });
    });
    this.listen('update-downloaded', info => {
      if (info.version !== this.state.version || !acceptsUpdate(version, info.version)) return;
      this.update({ status: 'downloaded', percent: 100, error: '' });
    });
    this.listen('error', () => this.fail());
  }
  private listen(event: string, listener: (...args: any[]) => void) {
    const guarded = (...args: any[]) => { if (!this.disposed) listener(...args); };
    this.subscriptions.push([event, guarded]); this.updater.on(event, guarded);
  }
  private update(patch: Partial<AppUpdateState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.emit('state', { ...this.state });
  }
  private fail() {
    // A late check error must not discard an already verified download.
    if (this.state.status === 'downloaded' || this.state.status === 'error') return;
    const error = this.state.status === 'installing' ? 'updates.installError' :
      ['available', 'downloading'].includes(this.state.status) ? 'updates.downloadError' : 'updates.checkError';
    this.update({ status: 'error', error });
  }
  private async download() {
    try { this.update({ status: 'downloading' }); await this.updater.downloadUpdate(); }
    catch { this.fail(); }
  }
  check(): Promise<AppUpdateState> {
    if (this.disposed || ['disabled', 'available', 'downloading', 'downloaded', 'installing'].includes(this.state.status)) return Promise.resolve({ ...this.state });
    if (this.checkTask) return this.checkTask;
    this.update({ status: 'checking', error: '' });
    this.checkTask = (async () => {
      try {
        if (this.prepareNetwork) await this.prepareNetwork();
        if (!this.disposed) await this.updater.checkForUpdates();
      } catch { this.fail(); }
      finally { this.checkTask = undefined; }
      return { ...this.state };
    })();
    return this.checkTask;
  }
  install(): Promise<void> {
    if (this.installTask) return this.installTask;
    if (this.disposed || this.state.status !== 'downloaded') return Promise.resolve();
    this.update({ status: 'installing', error: '' });
    this.installTask = (async () => {
      try { await this.beforeInstall(); if (!this.disposed) this.updater.quitAndInstall(false, true); }
      catch { this.fail(); }
      finally { if (this.state.status === 'error') this.installTask = undefined; }
    })();
    return this.installTask;
  }
  dispose() {
    this.disposed = true;
    for (const [event, listener] of this.subscriptions) this.updater.removeListener(event, listener);
    this.removeAllListeners();
  }
}
