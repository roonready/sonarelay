const { spawnSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');
const { root } = require('./release-config.cjs');
(async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.CI || process.env.GITHUB_ACTIONS) throw new Error('Build installers locally on a Windows x64 developer computer.');
  const unpacked = process.argv.includes('--unpacked');
  const config = require('../electron-builder.config.cjs');
  for (const script of unpacked ? ['build'] : ['check', 'test', 'build']) {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { cwd: root, windowsHide: true, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`${script} failed.`);
  }
  await build({ targets: Platform.WINDOWS.createTarget(unpacked ? ['dir'] : ['nsis'], Arch.x64), publish: 'never', config });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
