const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const root = path.join(__dirname, '..');
function releaseVersion(version) {
  const parsed = semver.parse(version);
  if (!parsed || parsed.version !== version || parsed.build.length) throw new Error('Use a canonical Semantic Version without build metadata.');
  if (!parsed.prerelease.length) return { version, channel: 'latest', releaseType: 'release' };
  if (parsed.prerelease.length === 2 && parsed.prerelease[0] === 'beta' && typeof parsed.prerelease[1] === 'number') return { version, channel: 'beta', releaseType: 'prerelease' };
  throw new Error('Only x.y.z and x.y.z-beta.N versions are supported.');
}
function repository() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(config.owner) || !/^[a-z\d._-]+$/i.test(config.repo)) {
    throw new Error('Configure GitHub first: npm run configure:github -- OWNER/SonaRelay');
  }
  return { owner: config.owner, repo: config.repo };
}
module.exports = { root, repository, releaseVersion };
