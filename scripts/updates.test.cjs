require('./register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService, acceptsUpdate, versionChannel } = require('../src/main/updates/service.ts');
const { releaseVersion } = require('./release-config.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
class FakeUpdater extends EventEmitter {
  checks = 0; downloads = 0; installs = 0;
  async checkForUpdates() { this.checks++; }
  async downloadUpdate() { this.downloads++; }
  quitAndInstall(silent, forceRun) { this.installs++; this.installArguments = [silent, forceRun]; }
}
test('stable never accepts beta, unsupported prereleases, reused versions or downgrades', () => {
  assert.equal(versionChannel('1.1.0'), 'stable'); assert.equal(versionChannel('1.2.0-beta.1'), 'beta');
  for (const candidate of ['1.2.0-beta.1', '2.0.0-alpha.1', '2.0.0-rc.1', '1.1.0', '1.0.3', 'invalid', 'v1.2.0', '2.0.0+test']) assert.equal(acceptsUpdate('1.1.0', candidate), false, candidate);
  assert.equal(acceptsUpdate('1.1.0', '1.1.1'), true);
  assert.equal(acceptsUpdate('1.2.0-beta.1', '1.2.0-beta.2'), true);
  assert.equal(acceptsUpdate('1.2.0-beta.1', '1.2.0'), true);
  assert.equal(acceptsUpdate('1.2.0-beta.1', '1.1.9'), false);
  assert.equal(acceptsUpdate('1.2.0-beta.1', '2.0.0-rc.1'), false);
});
test('development mode does not configure, check or download updates', async () => {
  const updater = new FakeUpdater(), service = new UpdateService(updater, '1.1.0', false, async () => {});
  await service.check(); updater.emit('update-available', { version: '1.2.0' }); await tick();
  assert.equal(service.state.status, 'disabled'); assert.equal(updater.checks, 0); assert.equal(updater.downloads, 0);
  assert.equal(updater.listenerCount('update-available'), 0); service.dispose();
});
test('a stable client also blocks an unexpected prerelease from the provider before download', async () => {
  const updater = new FakeUpdater(), service = new UpdateService(updater, '1.1.0', true, async () => {});
  assert.equal(updater.channel, 'latest'); assert.equal(updater.allowPrerelease, false); assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  updater.emit('update-available', { version: '2.0.0-beta.1' }); await tick();
  assert.equal(updater.downloads, 0); assert.equal(service.state.status, 'idle'); service.dispose();
});
test('downloads in the background, reports bounded progress and waits for shutdown before explicit installation', async () => {
  const updater = new FakeUpdater(); let finishShutdown;
  const service = new UpdateService(updater, '1.1.0', true, () => new Promise(resolve => { finishShutdown = resolve; }));
  await service.check(); assert.equal(updater.checks, 1);
  updater.emit('update-available', { version: '1.1.1' }); await tick();
  assert.equal(service.state.status, 'downloading'); assert.equal(updater.downloads, 1);
  updater.emit('download-progress', { percent: 34.5 }); assert.equal(service.state.percent, 34.5);
  updater.emit('download-progress', { percent: 150 }); assert.equal(service.state.percent, 100);
  updater.emit('update-downloaded', { version: '1.1.1' }); assert.equal(service.state.status, 'downloaded');
  await service.check(); assert.equal(updater.checks, 1); assert.equal(updater.installs, 0);
  const pending = service.install(); service.install(); assert.equal(updater.installs, 0);
  finishShutdown(); await pending; assert.equal(updater.installs, 1); assert.deepEqual(updater.installArguments, [false, true]); service.dispose();
});
test('check, download and install errors are localized keys; retries and stale events do not corrupt ready state', async () => {
  const updater = new FakeUpdater(), service = new UpdateService(updater, '1.1.0', true, async () => {});
  updater.checkForUpdates = async () => { throw new Error('network'); };
  await service.check(); assert.equal(service.state.error, 'updates.checkError');
  updater.checkForUpdates = async () => { updater.emit('update-available', { version: '1.1.1' }); };
  updater.downloadUpdate = async () => { updater.emit('error', new Error('network')); throw new Error('network'); };
  await service.check(); await tick(); assert.equal(service.state.error, 'updates.downloadError');
  updater.emit('download-progress', { percent: 55 }); assert.equal(service.state.status, 'error');
  updater.downloadUpdate = async () => {};
  await service.check(); await tick(); updater.emit('update-downloaded', { version: '1.1.1' });
  assert.equal(service.state.status, 'downloaded'); updater.emit('error', new Error('late network error'));
  assert.equal(service.state.status, 'downloaded');
  updater.quitAndInstall = () => { throw new Error('installer'); };
  await service.install(); assert.equal(service.state.error, 'updates.installError');
  await service.check(); await tick(); updater.emit('update-downloaded', { version: '1.1.1' });
  let installed = false; updater.quitAndInstall = () => { installed = true; };
  await service.install(); assert.equal(installed, true); service.dispose();
});
test('concurrent checks are deduplicated and disposal stops status broadcasts', async () => {
  const updater = new FakeUpdater(); let finish;
  updater.checkForUpdates = () => { updater.checks++; return new Promise(resolve => { finish = resolve; }); };
  const service = new UpdateService(updater, '1.2.0-beta.1', true, async () => {});
  assert.equal(updater.channel, 'beta'); assert.equal(updater.allowPrerelease, true); assert.equal(updater.allowDowngrade, false);
  const first = service.check(), second = service.check(); assert.equal(first, second); assert.equal(updater.checks, 1);
  let broadcasts = 0; service.on('state', () => broadcasts++); service.dispose(); finish(); await first;
  updater.emit('update-not-available'); assert.equal(broadcasts, 0); assert.equal(updater.listenerCount('update-available'), 0);
});
test('release metadata, version and public feed configuration agree; no credentials or workflow are included', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const config = require('../electron-builder.config.cjs'), pkg = require('../package.json');
  assert.deepEqual(releaseVersion('1.2.0-beta.3'), { version: '1.2.0-beta.3', channel: 'beta', releaseType: 'prerelease' });
  assert.throws(() => releaseVersion('1.2.0-rc.1')); assert.throws(() => releaseVersion('v1.2.0'));
  assert.equal(config.publish[0].channel, releaseVersion(pkg.version).channel);
  assert.equal(config.publish[0].private, false); assert.equal(config.publish[0].provider, 'github');
  assert.equal(config.publish[0].owner, 'roonready'); assert.equal(config.publish[0].repo, 'sonarelay');
  assert.ok(!JSON.stringify(config.publish).includes('token'));
  assert.equal(config.nsis.differentialPackage, true); assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(require('../package-lock.json').version, pkg.version);
  assert.ok(!fs.existsSync(path.join(__dirname, '../.github/workflows')));
  const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
  const { DebugLogger } = require('builder-util');
  await validateConfiguration(config, new DebugLogger(false));
});
