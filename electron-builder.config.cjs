const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { root, repository, releaseVersion } = require('./scripts/release-config.cjs');
const pkg = require('./package.json');
const release = releaseVersion(pkg.version);
module.exports = {
  ...yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')),
  publish: [{
    provider: 'github',
    ...repository(),
    private: false,
    protocol: 'https',
    tagNamePrefix: 'v',
    channel: release.channel,
    releaseType: release.releaseType,
    publishAutoUpdate: true,
  }],
};
