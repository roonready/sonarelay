require('./register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { ScrobblerService } = require('../src/main/scrobbler/service.ts');
const { NowPlayingReporter } = require('../src/main/scrobbler/now-playing.ts');
const { LastfmTracker } = require('../src/main/lastfm/tracker.ts');

const origin = 'http://127.0.0.1:3000';
const token = 'a'.repeat(43);
const replacement = 'b'.repeat(43);
const epoch = 1700000000000;
const acceptedId = '97c83da6-9758-415a-8b2f-0981e56d34ca';
const accepted = (status = 201, action = 'none') => Response.json({
  scrobbleId: acceptedId, duplicate: status === 200, artwork: { action },
}, { status });
const crypto = {
  encrypt: async value => Buffer.from(value).toString('base64'),
  decrypt: async value => Buffer.from(value, 'base64').toString(),
};
function play(client, start, lastfm, artwork = null) {
  const submissions = [];
  for (let position = 0; position <= 20; position++) {
    const now = start + position * 1000;
    const playback = { title: 'Song', artist: 'A feat. B', album: 'Album',
      trackNumber: 1, albumTrackCount: 12, duration: 39.5, position, trackId: 'song',
      playing: true, rate: 1 };
    client.consume({ playback, artwork, updatedAt: epoch + now, error: '' }, now);
    if (lastfm) submissions.push(...lastfm.observe(playback, { scrobbling: true, nowPlaying: true }, now, epoch + now));
  }
  return submissions;
}

async function eventually(predicate) {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return;
    await wait(10);
  }
  assert.fail('Expected delivery state did not appear');
}

test('shares Last.fm qualification and retries the same persisted event after restart', async t => {
  const lanOrigin = 'http://192.168.1.14:5173';
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-scrobbler-'));
  const file = join(dir, 'scrobbles.json');
  let client;
  t.after(async () => { await client?.dispose(); await rm(dir, { recursive: true, force: true }); });
  const events = [];
  const send = async (url, request) => {
    assert.equal(url, lanOrigin + '/api/scrobbles');
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    assert.equal(request.redirect, 'error');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    const event = JSON.parse(request.body);
    assert.equal(saved.queue[0].eventId, event.eventId);
    events.push(event);
    if (events.length === 1) return new Response(null, { status: 503 });
    if (events.length === 2) return accepted(200);
    return accepted();
  };
  client = new ScrobblerService(file, crypto, () => {}, send);
  await client.configure({ url: lanOrigin, enabled: true, token });
  const lastfm = play(client, 0, new LastfmTracker()).filter(x => x.method === 'track.scrobble');
  assert.equal(lastfm.length, 1);
  await eventually(() => client.snapshot().error === 'retry');
  assert.equal(client.snapshot().pending, 1);
  assert.equal(client.snapshot().token, undefined);
  assert.ok(!(await readFile(file, 'utf8')).includes(token));
  await client.dispose();
  client = new ScrobblerService(file, crypto, () => {}, send);
  await client.ready;
  await eventually(() => client.snapshot().pending === 0);
  assert.deepEqual(events[0], events[1]);
  assert.deepEqual({ ...events[0], eventId: undefined }, {
    eventId: undefined, startedAt: new Date(epoch).toISOString(), Title: 'Song', Artist: 'A feat. B',
    AlbumTitle: 'Album', TrackNumber: 1, AlbumTrackCount: 12, durationSeconds: 39.5,
  });
  play(client, 30000);
  await eventually(() => events.length === 3 && client.snapshot().pending === 0);
  assert.notEqual(events[2].eventId, events[0].eventId);
  play(client, 52000);
  await eventually(() => events.length === 4 && client.snapshot().pending === 0);
  assert.notEqual(events[3].eventId, events[2].eventId);
});

test('retains a blocked queue until token replacement and records a rejected event', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-scrobbler-'));
  let attempts = 0;
  const client = new ScrobblerService(join(dir, 'queue.json'), crypto, () => {}, async (_url, request) => {
    attempts++;
    const status = request.headers.Authorization === 'Bearer ' + replacement ? 400 : 401;
    return new Response(null, { status });
  });
  t.after(async () => { await client.dispose(); await rm(dir, { recursive: true, force: true }); });
  await assert.rejects(client.configure({ url: 'http://remote.example', enabled: true, token }), /invalidUrl/);
  await assert.rejects(client.configure({ url: 'http://93.184.215.14', enabled: true, token }), /invalidUrl/);
  await client.configure({ url: origin, enabled: true, token });
  play(client, 0);
  await eventually(() => client.snapshot().error === 'auth');
  assert.equal(client.snapshot().pending, 1);
  await assert.rejects(client.configure({ url: 'https://another.example', enabled: true, token: replacement }), /pendingOrigin/);
  await client.configure({ url: origin, enabled: true });
  assert.equal(client.snapshot().error, 'auth');
  assert.equal(attempts, 1);
  await client.configure({ url: origin, enabled: true, token: replacement });
  await eventually(() => client.snapshot().rejected === 1);
  assert.equal(client.snapshot().pending, 0);
  assert.equal(attempts, 2);
});

test('sends pHash then retries only PUT, while new listens can reuse the cover without uploading', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-artwork-'));
  const path = join(dir, 'queue.json');
  const bytes = await sharp({
    create: { width: 24, height: 17, channels: 3, background: '#7b9dbd' },
  }).png().toBuffer();
  const dataUrl = 'data:image/png;base64,' + bytes.toString('base64');
  const methods = [];
  let uploads = 0;
  let posts = 0;
  const client = new ScrobblerService(path, crypto, () => {}, async (url, request) => {
    methods.push(request.method);
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    const saved = await readFile(path, 'utf8');
    assert.equal(saved.includes(bytes.toString('base64')), false);
    if (request.method === 'PUT') {
      assert.equal(url, origin + '/api/scrobbles/' + acceptedId + '/artwork');
      assert.deepEqual(Buffer.from(request.body), bytes);
      assert.equal(JSON.parse(saved).queue.length, 0);
      if (++uploads === 1) return new Response(null, { status: 503 });
      return Response.json({ action: 'reuse' });
    }
    assert.equal(url, origin + '/api/scrobbles');
    const event = JSON.parse(request.body);
    assert.deepEqual(event.artwork, { pHash: '0000000000000000', pHashVersion: 1, width: 24, height: 17 });
    assert.equal(Object.hasOwn(JSON.parse(saved).queue[0], 'artwork'), false);
    assert.equal(Object.hasOwn(event, 'Thumbnail'), false);
    return accepted(201, ++posts === 1 ? 'upload' : 'reuse');
  });
  t.after(async () => { await client.dispose(); await rm(dir, { recursive: true, force: true }); });
  await client.configure({ url: origin, enabled: true, token });
  play(client, 0, undefined, dataUrl);
  await eventually(() => uploads === 1 && client.snapshot().error === 'retry');
  assert.ok(client.snapshot().lastSent);
  play(client, 30000, undefined, dataUrl);
  await eventually(() => client.snapshot().pending === 0);
  assert.deepEqual(methods, ['POST', 'PUT', 'POST', 'PUT']);
});

test('a malformed GSMTC cover leaves the scrobble deliverable without an image', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-no-artwork-'));
  let posted;
  const client = new ScrobblerService(join(dir, 'queue.json'), crypto, () => {}, async (_url, request) => {
    assert.equal(request.method, 'POST');
    posted = JSON.parse(request.body);
    return accepted();
  });
  t.after(async () => { await client.dispose(); await rm(dir, { recursive: true, force: true }); });
  await client.configure({ url: origin, enabled: true, token });
  play(client, 0, undefined, 'data:image/png;base64,AA==');
  await eventually(() => client.snapshot().pending === 0 && posted);
  assert.equal(posted.artwork, undefined);
});

function playingTrack(title, position = 0, playing = true) {
  return { title, artist: 'Artist', trackId: title, album: 'Album', duration: 100, position, playing, rate: 1 };
}

test('reports playback before a scrobble and clears only the current playback on pause or shutdown', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-now-playing-'));
  const signals = [];
  let savedScrobbles = 0;
  const reporter = new NowPlayingReporter(async (url, request) => {
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    signals.push({ url, method: request.method, body: request.body && JSON.parse(request.body) });
    return new Response(null, { status: 204 });
  });
  const service = new ScrobblerService(join(dir, 'queue.json'), crypto, () => {}, async () => {
    savedScrobbles++;
    return accepted();
  }, reporter);
  t.after(async () => { await service.dispose(); await rm(dir, { recursive: true, force: true }); });
  await service.configure({ url: origin, enabled: true, token });
  function observe(title, position, playing = true) {
    service.consume({ playback: playingTrack(title, position, playing), artwork: null,
      updatedAt: epoch + position * 1000, error: '' }, position * 1000);
  }
  observe('North', 0);
  await eventually(() => signals.length === 1);
  const first = signals[0].body;
  assert.deepEqual(signals[0], { method: 'PUT', url: origin + '/api/now-playing',
    body: { playbackId: first.playbackId, Title: 'North', Artist: 'Artist', AlbumTitle: 'Album' } });
  assert.equal(savedScrobbles, 0);
  observe('North', 4);
  observe('South', 0);
  await eventually(() => signals.length === 2);
  const current = signals[1].body;
  assert.notEqual(current.playbackId, first.playbackId);
  assert.equal(current.Title, 'South');
  observe('South', 2, false);
  await eventually(() => signals.length === 3);
  assert.equal(signals[2].method, 'DELETE');
  assert.equal(signals[2].url, origin + '/api/now-playing/' + current.playbackId);
  observe('South', 2);
  await eventually(() => signals.length === 4);
  assert.notEqual(signals[3].body.playbackId, current.playbackId);
  await service.dispose();
  assert.equal(signals[4].url, origin + '/api/now-playing/' + signals[3].body.playbackId);
  assert.equal(savedScrobbles, 0);
});

test('now-playing retries a temporary failure and refreshes the same playback ID', async t => {
  const calls = [];
  const reporter = new NowPlayingReporter(async (url, request) => {
    calls.push([url, request.method, request.body && JSON.parse(request.body).playbackId]);
    return new Response(null, { status: calls.length === 1 ? 503 : 204 });
  }, 60, 20);
  t.after(() => reporter.dispose());
  reporter.configure({ url: origin, token });
  reporter.observe(playingTrack('North'));
  await eventually(() => calls.length >= 3);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[1], calls[2]);
  reporter.observe(undefined);
  await eventually(() => calls.some(([, method]) => method === 'DELETE'));
  assert.ok(calls.some(([url, method]) => method === 'DELETE' && url.endsWith('/' + calls[0][2])));
});

test('now-playing prepares release metadata and uploads artwork before a track qualifies', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-prepare-artwork-'));
  const bytes = await sharp({create: {width: 24, height: 17, channels: 3, background: '#7b9dbd'}}).png().toBuffer();
  const calls = [];
  let scrobbles = 0;
  const reporter = new NowPlayingReporter(async (url, request) => {
    calls.push({ url, method: request.method, body: request.body });
    if (url.endsWith('/now-playing')) return Response.json({ artwork: { action: JSON.parse(request.body).artwork ? 'upload' : 'none' } });
    return new Response(null, { status: 200 });
  });
  const service = new ScrobblerService(join(dir, 'queue.json'), crypto, () => {}, async () => {
    scrobbles++;
    return accepted();
  }, reporter);
  t.after(async () => { await service.dispose(); await rm(dir, { recursive: true, force: true }); });
  await service.configure({ url: origin, enabled: true, token });
  const playback = { ...playingTrack('North'), albumArtist: 'Echo', trackNumber: 2, albumTrackCount: 8 };
  const artwork = 'data:image/png;base64,' + bytes.toString('base64');
  service.consume({ playback, artwork, updatedAt: epoch, error: '' }, 0);
  await eventually(() => calls.length === 1);
  const initial = JSON.parse(calls[0].body);
  assert.equal(initial.artwork, undefined);
  service.consume({ playback: { ...playback, position: 1 }, artwork, updatedAt: epoch + 1000, error: '' }, 1000);
  await eventually(() => calls.length === 3);
  const observation = JSON.parse(calls[1].body);
  assert.equal(observation.playbackId, initial.playbackId);
  assert.deepEqual(observation.artwork, { pHash: '0000000000000000', pHashVersion: 1, width: 24, height: 17 });
  assert.equal(observation.artworkSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(observation.AlbumTitle, 'Album');
  assert.equal(observation.AlbumArtist, 'Echo');
  assert.equal(observation.TrackNumber, 2);
  assert.equal(observation.AlbumTrackCount, 8);
  assert.equal(calls[2].url, origin + '/api/now-playing/' + observation.playbackId + '/artwork');
  assert.equal(calls[2].method, 'PUT');
  assert.deepEqual(Buffer.from(calls[2].body), bytes);
  assert.equal(scrobbles, 0);
});

test('does not submit the previous album cover even if GSMTC keeps repeating it', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sonarelay-album-transition-'));
  const png = width => sharp({ create: { width, height: 24, channels: 3, background: '#7b9dbd' } }).png().toBuffer();
  const [previous, transient, correct] = await Promise.all([png(150), png(135), png(120)]);
  const announcements = [];
  const uploads = [];
  const posts = [];
  const reporter = new NowPlayingReporter(async (url, request) => {
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.endsWith('/now-playing')) {
      const body = JSON.parse(request.body);
      announcements.push(body);
      return Response.json({ artwork: { action: body.artwork ? 'upload' : 'none' } });
    }
    uploads.push(Buffer.from(request.body));
    return new Response(null, { status: 200 });
  });
  const client = new ScrobblerService(join(dir, 'queue.json'), crypto, () => {}, async (_url, request) => {
    assert.equal(request.method, 'POST');
    posts.push(JSON.parse(request.body));
    return accepted();
  }, reporter);
  t.after(async () => { await client.dispose(); await rm(dir, { recursive: true, force: true }); });
  await client.configure({ url: origin, enabled: true, token });
  function observe(title, album, position, now, bytes) {
    const playback = { ...playingTrack(title, position), album, duration: 40 };
    const artwork = 'data:image/png;base64,' + bytes.toString('base64');
    client.consume({ playback, artwork, updatedAt: epoch + now, error: '' }, now);
  }
  observe('Previous track', 'Previous album', 0, 0, previous);
  observe('Previous track', 'Previous album', 1, 1000, previous);
  await eventually(() => uploads.length === 1);
  for (let position = 0; position <= 20; position++) {
    observe('New track', 'New album', position, 2000 + position * 1000, previous);
  }
  await eventually(() => posts.length === 1 && announcements.some(event => event.Title === 'New track'));
  assert.equal(posts[0].AlbumTitle, 'New album');
  assert.equal(posts[0].artwork, undefined);
  const initial = announcements.find(event => event.Title === 'New track');
  assert.equal(initial.artwork, undefined);
  observe('New track', 'New album', 21, 23000, transient);
  observe('New track', 'New album', 22, 24000, correct);
  await wait(30);
  assert.equal(uploads.length, 1);
  assert.deepEqual(announcements.filter(event => event.Title === 'New track'), [initial]);
  observe('New track', 'New album', 23, 25000, correct);
  await eventually(() => uploads.length === 2);
  assert.deepEqual(uploads[1], correct);
  assert.equal(announcements.filter(event => event.Title === 'New track').at(-1).playbackId, initial.playbackId);
  observe('New track', 'New album', 24, 26000, transient);
  observe('New track', 'New album', 25, 27000, transient);
  await eventually(() => uploads.length === 3);
  assert.deepEqual(uploads[2], transient);
  observe('Next track', 'New album', 0, 28000, transient);
  await eventually(() => uploads.length === 4);
  assert.deepEqual(uploads[3], transient);
});
