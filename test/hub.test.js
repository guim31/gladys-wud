// -----------------------------------------------------------------------------
// The hub, end to end: the SDK's fake Gladys on one side, an in-memory WUD on
// the other, a manual clock. Devices, states, updates found and applied and
// their scene events, persistence across restarts, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { FEATURE_KEYS, serverIds } from '../src/devices.js';
import {
  CONFIG,
  FakeWud,
  TOKEN,
  WUD_URL,
  createClock,
  createDevices,
  createWorld,
  deviceId,
  featureId,
  serverFeatureId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const result = await createWorld(options);
  t.after(() => result.app.stop());
  return result;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

async function step(w, ms = 300_000) {
  w.clock.advance(ms);
  await w.hub.pollNow();
}

test('the WUD device and the chosen containers in the Discovery tab, nothing polled by Gladys', async (t) => {
  const w = await world(t);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id, d.model]),
    [
      ["What's Up Docker", serverIds(w.gladys).device, "What's Up Docker 9.5.0"],
      ['busybox', deviceId(w.gladys, 'busybox'), 'busybox'],
      ['nginx', deviceId(w.gladys, 'nginx'), 'nginx'],
      ['redis', deviceId(w.gladys, 'redis'), 'redis'],
    ],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  assert.deepEqual(
    devices[2].features.map((f) => f.external_id),
    ['update_available', 'current_version', 'new_version'].map((key) =>
      featureId(w.gladys, 'nginx', key),
    ),
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.states.length, 0, 'nothing sent for devices not added');
  assert.equal(w.fake.sceneEvents.length, 0, 'the first read announces nothing');
});

test('no container in the configuration: the WUD device only; "*" proposes every container', async (t) => {
  const none = await world(t, { config: { ...CONFIG, containers: '' } });
  assert.equal(none.fake.discoveredDevices.length, 1);
  const all = await world(t, { config: { ...CONFIG, containers: '*' } });
  assert.equal(all.fake.discoveredDevices.length, 6);
  assert.equal(all.fake.discoveredDevices[1].features[0].name, 'Update available');
  const french = await world(t, { config: { ...CONFIG, language: undefined } });
  assert.equal(french.fake.discoveredDevices[1].features[0].name, 'Mise à jour disponible');
});

test('adding devices publishes all their states at once', async (t) => {
  const w = await world(t);
  await createDevices(w);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'nginx', FEATURE_KEYS.UPDATE_AVAILABLE)), 1);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, 'nginx', FEATURE_KEYS.CURRENT_VERSION)),
    '1.25.0',
  );
  assert.equal(w.fake.lastState(featureId(w.gladys, 'nginx', FEATURE_KEYS.NEW_VERSION)), '1.31.8');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'busybox', FEATURE_KEYS.UPDATE_AVAILABLE)), 0);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, 'busybox', FEATURE_KEYS.NEW_VERSION)),
    'Up to date',
  );
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.REACHABLE)), 1);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.CONTAINERS)), 5);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.UPDATES)), 3);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.MAJOR_UPDATES)), 1);
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
  assert.ok(w.fake.transports.length > 0);

  // Nothing changed: nothing published again.
  const count = w.fake.states.length;
  await step(w);
  assert.equal(w.fake.states.length, count);
  // Except the heartbeat, every 12 hours.
  await step(w, 12 * 3600_000);
  assert.ok(w.fake.states.length > count);
});

test('a new update fires "update_available" once, with the versions and the kind', async (t) => {
  const w = await world(t);
  w.wud.offer('nginx', '1.31.9', 'patch');
  w.wud.offer('busybox', '1.38.0', 'major');
  await step(w);
  const found = events(w, TRIGGERS.AVAILABLE);
  assert.deepEqual(
    found.map((event) => event.data),
    [
      {
        device: deviceId(w.gladys, 'busybox'),
        container: 'busybox',
        image: 'busybox',
        current_version: 'latest',
        new_version: '1.38.0',
        kind: 'major',
      },
      {
        device: deviceId(w.gladys, 'nginx'),
        container: 'nginx',
        image: 'nginx',
        current_version: '1.25.0',
        new_version: '1.31.9',
        kind: 'patch',
      },
    ],
  );
  await step(w);
  assert.equal(events(w, TRIGGERS.AVAILABLE).length, 2, 'announced once');
});

test('an update applied (container recreated, new id) fires "update_applied"', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.wud.apply('nginx', '1.31.8');
  await step(w);
  assert.deepEqual(
    events(w, TRIGGERS.APPLIED).map((event) => event.data),
    [
      {
        device: deviceId(w.gladys, 'nginx'),
        container: 'nginx',
        image: 'nginx',
        version: '1.31.8',
        previous_version: '1.25.0',
      },
    ],
  );
  assert.equal(w.fake.lastState(featureId(w.gladys, 'nginx', FEATURE_KEYS.UPDATE_AVAILABLE)), 0);
  assert.equal(
    w.fake.lastState(featureId(w.gladys, 'nginx', FEATURE_KEYS.CURRENT_VERSION)),
    '1.31.8',
  );
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.UPDATES)), 2);
  await step(w);
  assert.equal(events(w, TRIGGERS.APPLIED).length, 1);

  // A newer version later: announced again.
  w.wud.offer('nginx', '1.32.0', 'minor');
  await step(w);
  assert.equal(events(w, TRIGGERS.AVAILABLE).at(-1).data.new_version, '1.32.0');
});

test('a snoozed update, or a list read while WUD restarts, is neither "applied" nor announced twice', async (t) => {
  const w = await world(t);
  w.wud.snooze('redis');
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
  w.wud.offer('redis', '8.10.2', 'major');
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0, 'the same update is not announced again');
});

test('a partial update (a newer version still waiting) is not "applied"', async (t) => {
  const w = await world(t);
  w.wud.apply('redis', '7.2.0');
  w.wud.offer('redis', '8.10.2', 'major');
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('a digest update of a moving tag', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.wud.offerDigest('busybox', 'sha256:2222222222222222bbbb');
  await step(w);
  const [event] = events(w, TRIGGERS.AVAILABLE);
  assert.equal(event.data.kind, 'digest');
  assert.equal(event.data.current_version, 'latest (111111111111)');
  assert.equal(event.data.new_version, 'latest (222222222222)');
  w.wud.apply('busybox');
  await step(w);
  assert.equal(events(w, TRIGGERS.APPLIED).length, 1);
});

test('a container removed, then recreated with the same name, keeps its history', async (t) => {
  const w = await world(t);
  const nginx = structuredClone(w.wud.get('nginx'));
  w.wud.remove('nginx');
  await step(w);
  nginx.id = 'f'.repeat(64);
  nginx.image.id = 'sha256:' + 'e'.repeat(64);
  nginx.image.tag.value = '1.31.8';
  nginx.updateAvailable = false;
  w.wud.containers.push(nginx);
  await step(w);
  assert.equal(events(w, TRIGGERS.APPLIED).length, 1);
  assert.equal(events(w, TRIGGERS.AVAILABLE).length, 0);
});

test('a new container with an update is announced, once the integration knows the others', async (t) => {
  const w = await world(t);
  const extra = structuredClone(w.wud.get('nginx'));
  extra.name = 'web';
  extra.displayName = 'web';
  w.wud.containers.push(extra);
  await step(w);
  assert.deepEqual(
    events(w, TRIGGERS.AVAILABLE).map((event) => event.data.container),
    ['web'],
  );
});

test('the state survives a restart: an update found meanwhile is announced, once', async (t) => {
  const first = await world(t);
  await first.app.stop();
  first.wud.offer('nginx', '1.32.0');
  const second = await world(t, { wud: first.wud, dataDir: first.dataDir });
  assert.equal(events(second, TRIGGERS.AVAILABLE).length, 1);
  await second.app.stop();
  const third = await world(t, { wud: first.wud, dataDir: first.dataDir });
  assert.equal(third.fake.sceneEvents.length, 0);
});

test('an event refused by Gladys is fired again at the next read', async (t) => {
  const w = await world(t);
  w.wud.offer('nginx', '1.32.0');
  const refuse = t.mock.method(w.gladys, 'publishSceneEvent', async () => {
    throw new Error('HTTP 503');
  });
  await step(w);
  assert.equal(refuse.mock.callCount(), 1);
  refuse.mock.restore();
  await step(w);
  assert.equal(events(w, TRIGGERS.AVAILABLE).length, 1);
});

test('WUD down: unreachable status, badge and state, then back', async (t) => {
  const w = await world(t);
  await createDevices(w);
  w.wud.failure = { code: 'ECONNREFUSED' };
  await step(w);
  assert.deepEqual(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.REACHABLE)), 0);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  w.wud.failure = null;
  await step(w);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.lastState(serverFeatureId(w.gladys, FEATURE_KEYS.REACHABLE)), 1);
  assert.equal(w.fake.sceneEvents.length, 0, 'nothing announced by the outage');
});

test('refused or missing credentials, another service: the reason in the status', async (t) => {
  const cases = [
    [{ ...CONFIG, password: 'wrong' }, null, /refused by WUD/],
    [{ url: WUD_URL }, null, /asks for a user/],
    [CONFIG, { status: 404 }, /no What's Up Docker API/],
    [CONFIG, { status: 302 }, /redirects/],
    [CONFIG, { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, /certificate refused/],
    [{ url: 'http://' }, null, /Address not understood/],
    [{}, null, /Enter the address/],
  ];
  for (const [config, failure, expected] of cases) {
    const wud = new FakeWud();
    wud.failure = failure;
    const w = await world(t, { wud, config: { language: 'en', ...config } });
    assert.equal(w.fake.connectionStatus.connected, false);
    assert.match(w.fake.connectionStatus.message.en, expected);
  }
});

test('an API token is sent as a bearer token', async (t) => {
  const wud = new FakeWud({ auth: 'token' });
  const w = await world(t, { wud, config: { url: WUD_URL, api_token: ` ${TOKEN}\n` } });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('"Check now" on every container, or on one; refused for a read-only user', async (t) => {
  const w = await world(t);
  const all = await w.fake.sceneAction('check_now', {});
  assert.equal(all.success, true, all.error);
  assert.equal(all.data.outputs.count, 5);
  assert.ok(w.wud.calls.includes('POST /api/containers/watch'));

  const id = w.wud.get('redis').id;
  const one = await w.fake.sceneAction('check_now', { device: deviceId(w.gladys, 'redis') });
  assert.equal(one.data.outputs.count, 1);
  assert.ok(w.wud.calls.includes(`POST /api/containers/${id}/watch`));

  const unknown = await w.fake.sceneAction('check_now', { device: deviceId(w.gladys, 'gone') });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /no longer watched/);

  w.wud.readOnly = true;
  const refused = await w.fake.sceneAction('check_now', {});
  assert.equal(refused.success, false);
  assert.match(refused.error, /read-only/);
});

test('"Test the connection" reports the version and the updates', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection');
  assert.equal(ack.success, true);
  const message = ack.data?.message ?? ack.message;
  assert.equal(message.en, 'OK, WUD 9.5.0, 5 container(s) watched, 3 update(s) available, 1 major');
  assert.equal(
    message.fr,
    'OK, WUD 9.5.0, 5 conteneur(s) surveillé(s), 3 mise(s) à jour disponible(s), dont 1 majeure(s)',
  );
});

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const w = await world(t);
  await createDevices(w);
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      await step(w);
    }
  });
  assert.deepEqual(lines, []);
});

test('WUD unreachable for long: one line, and one when it answers again, no secret', async (t) => {
  const w = await world(t);
  const lines = await captureLogs(t, 'info', async () => {
    w.wud.failure = { code: 'ECONNREFUSED' };
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await step(w);
    }
    w.wud.failure = null;
    await step(w);
    await step(w);
  });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /WARN.*ECONNREFUSED/);
  assert.match(lines[1], /answers again/);
  assert.ok(!lines.join('\n').includes(CONFIG.password));
});

test('a container appears in the Discovery tab when the configuration names it', async (t) => {
  const w = await world(t, { clock: createClock() });
  await w.fake.configUpdated({ ...CONFIG, containers: 'alpine' });
  assert.deepEqual(
    w.fake.discoveredDevices.map((d) => d.name),
    ["What's Up Docker", 'alpine'],
  );
});

// --- Review fixes ----------------------------------------------------------------------

test('snoozed, then recreated on another image: no "applied", no second announcement', async (t) => {
  const w = await world(t);
  w.wud.snooze('redis');
  w.wud.apply('redis', '7.2.0');
  w.wud.get('redis').isSnoozed = true;
  await step(w);
  w.wud.get('redis').isSnoozed = false;
  w.wud.offer('redis', '8.10.2', 'major');
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('a check that failed after a recreation concludes nothing until a clean read', async (t) => {
  const w = await world(t);
  w.wud.apply('redis', '7.2.0');
  w.wud.get('redis').error = { message: 'Registry error 429' };
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
  delete w.wud.get('redis').error;
  w.wud.offer('redis', '8.10.2', 'major');
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0, '8.10.2 was already announced');
});

test('/data is not written at every read', async (t) => {
  const w = await world(t);
  const save = t.mock.method(w.hub.store, 'save');
  await step(w);
  await step(w);
  assert.equal(save.mock.callCount(), 0);
});

test('another WUD address starts afresh: nothing announced from the old history', async (t) => {
  const w = await world(t);
  const other = new FakeWud();
  other.apply('nginx', '1.31.8');
  w.wud.containers = other.containers;
  await w.fake.configUpdated({ ...CONFIG, url: 'http://192.0.2.11:3000' });
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('a first read with an empty list does not count as the first read', async (t) => {
  const wud = new FakeWud();
  const containers = wud.containers;
  wud.containers = [];
  const w = await world(t, { wud });
  wud.containers = containers;
  await step(w);
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('"Check now" on a container recreated since the last read uses its new id', async (t) => {
  const w = await world(t);
  w.wud.apply('nginx', '1.31.8');
  const ack = await w.fake.sceneAction('check_now', { device: deviceId(w.gladys, 'nginx') });
  assert.equal(ack.success, true, ack.error);
  assert.ok(w.wud.calls.includes(`POST /api/containers/${w.wud.get('nginx').id}/watch`));
});
