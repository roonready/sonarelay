const { repository } = require('./release-config.cjs');
const { request, publicRepository } = require('./github.cjs');
(async () => {
  if (!process.env.GH_TOKEN) throw new Error('Set GH_TOKEN in your local shell. Never put it in source files.');
  const { owner, repo } = repository();
  try { const existing = await publicRepository(); console.log(`Public repository exists: ${existing.html_url}`); return; }
  catch (error) { if (error.status !== 404) throw error; }
  const user = await request('/user');
  const route = user.login.toLowerCase() === owner.toLowerCase() ? '/user/repos' : `/orgs/${owner}/repos`;
  const created = await request(route, { method: 'POST', body: JSON.stringify({ name: repo, description: 'Stream Yandex Music to network audio receivers on Windows.', private: false, auto_init: false }), headers: { 'Content-Type': 'application/json' } });
  console.log(`Created public repository: ${created.html_url}`);
  console.log('Push the local source with Git before publishing a release. See RELEASE.md.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
