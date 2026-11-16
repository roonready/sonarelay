const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, Platform, Arch } = require('electron-builder');
const { root, repository, releaseVersion } = require('./release-config.cjs');
const { request, publicRepository } = require('./github.cjs');
(async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.CI || process.env.GITHUB_ACTIONS) throw new Error('Releases must be built locally on a Windows x64 developer computer.');
  if (!process.env.GH_TOKEN) throw new Error('Set GH_TOKEN in your local shell before releasing.');
  const { owner, repo } = repository();
  const pkg = require('../package.json'), release = releaseVersion(pkg.version);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\].*$/gm)];
  const section = sections.findIndex(match => match[1] === pkg.version);
  if (section < 0) throw new Error(`Add a CHANGELOG.md entry for ${pkg.version} before releasing.`);
  const start = sections[section].index + sections[section][0].length;
  const notes = changelog.slice(start, sections[section + 1]?.index ?? changelog.length).trim();
  if (!notes) throw new Error('Release notes must not be empty.');
  const repoInfo = await publicRepository();
  // Tie the GitHub tag to a real, already pushed source commit.
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('Git is required and the source must be committed and pushed before release.');
    return result.stdout.trim();
  };
  if (git(['status', '--porcelain'])) throw new Error('Commit all source changes before releasing.');
  const sha = git(['rev-parse', 'HEAD']);
  await request(`/repos/${owner}/${repo}/commits/${sha}`);
  try {
    let tag = await request(`/repos/${owner}/${repo}/git/ref/tags/v${pkg.version}`);
    while (tag.object.type === 'tag') tag = await request(`/repos/${owner}/${repo}/git/tags/${tag.object.sha}`);
    if (tag.object.sha !== sha) throw new Error('The existing version tag points to another commit. Choose a new version.');
  } catch (error) { if (error.status !== 404) throw error; }
  try { const existing = await request(`/repos/${owner}/${repo}/releases/tags/v${pkg.version}`); if (!existing.draft) throw new Error('This version already has a release. Increment the version instead of replacing it.'); }
  catch (error) { if (error.status !== 404) throw error; }
  for (const script of ['check', 'test', 'build']) {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { cwd: root, windowsHide: true, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`${script} failed; nothing was published.`);
  }
  const config = require('../electron-builder.config.cjs');
  // Only GH_TOKEN may authenticate this publishing process; ambient settings
  // must not override the draft-first workflow or select a different token.
  delete process.env.GITHUB_RELEASE_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.EP_PRE_RELEASE;
  delete process.env.EP_PRELEASE;
  process.env.EP_DRAFT = 'true';
  // Publish into a draft first so no client can see a partially uploaded release.
  await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'always', config: {
    ...config,
    publish: config.publish.map(provider => ({ ...provider, releaseType: 'draft' })),
    releaseInfo: { releaseNotes: notes },
  } });
  const verification = spawnSync(process.execPath, [path.join(root, 'scripts/verify-dist.cjs')], { cwd: root, windowsHide: true, stdio: 'inherit' });
  if (verification.error || verification.status !== 0) throw new Error('Installer verification failed. The release remains a draft.');
  const releases = await request(`/repos/${owner}/${repo}/releases?per_page=100`);
  const created = releases.find(item => item.tag_name === `v${pkg.version}`);
  if (!created?.draft) throw new Error('Expected a draft release; verify it on GitHub before retrying.');
  const required = [`SonaRelay-Setup-${pkg.version}-x64.exe`, `${release.channel}.yml`, `SonaRelay-Setup-${pkg.version}-x64.exe.blockmap`];
  for (const name of required) if (!created.assets.some(asset => asset.name === name && asset.size > 0)) throw new Error(`Draft is missing ${name}. It was not published.`);
  // electron-builder GitHub Publisher uploaded the installer, metadata and blockmap.
  // Only expose the release after every required artifact is present.
  const result = await request(`/repos/${owner}/${repo}/releases/${created.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, prerelease: release.releaseType === 'prerelease', target_commitish: sha, name: `SonaRelay ${pkg.version}`, body: notes, make_latest: release.channel === 'latest' ? 'true' : 'false' }) });
  console.log(`Published ${result.html_url} from ${sha} (${repoInfo.full_name}).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
