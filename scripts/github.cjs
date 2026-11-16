const { repository } = require('./release-config.cjs');
async function request(route, options = {}) {
  const response = await fetch(`https://api.github.com${route}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SonaRelay-release', ...options.headers },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) { const error = new Error(`GitHub API returned HTTP ${response.status}`); error.status = response.status; throw error; }
  return response.status === 204 ? null : response.json();
}
async function publicRepository() {
  const { owner, repo } = repository();
  const result = await request(`/repos/${owner}/${repo}`);
  if (result.private) throw new Error('The release repository must be public.');
  return result;
}
module.exports = { request, publicRepository };
