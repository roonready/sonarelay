const fs = require('node:fs');
const path = require('node:path');
const { root, repository } = require('./release-config.cjs');
const value = process.argv[2] ?? '';
if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d._-]+$/i.test(value)) {
  console.error('Usage: npm run configure:github -- OWNER/SonaRelay'); process.exitCode = 1;
} else {
  const [owner, repo] = value.split('/');
  fs.writeFileSync(path.join(root, 'release.config.json'), JSON.stringify({ owner, repo }, null, 2) + '\n');
  repository();
  const pkgPath = path.join(root, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgPath));
  pkg.repository = { type: 'git', url: `https://github.com/${owner}/${repo}.git` };
  pkg.homepage = `https://github.com/${owner}/${repo}`;
  pkg.bugs = { url: `https://github.com/${owner}/${repo}/issues` };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Configured https://github.com/${owner}/${repo}`);
}
