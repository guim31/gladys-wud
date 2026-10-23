// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, an in-memory WUD, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read WUD with `world.hub.pollNow()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { containerIds, serverIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { FakeWud, PASSWORD, TOKEN, USERNAME, realContainers } from './fakeWud.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const WUD_URL = 'http://192.0.2.10:3000';

export const CONFIG = {
  url: WUD_URL,
  username: USERNAME,
  password: PASSWORD,
  containers: 'nginx, redis, busybox',
  language: 'en',
};

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 23, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  wud = new FakeWud(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-wud-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: (url, options) => wud.request(url, options),
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, wud, app, hub: app.hub, clock, dataDir };
}

export const deviceId = (gladys, name, watcher = 'local') =>
  containerIds(gladys, `${watcher}.${name}`).device;
export const featureId = (gladys, name, feature, watcher = 'local') =>
  containerIds(gladys, `${watcher}.${name}`).feature(feature);
export const serverFeatureId = (gladys, feature) => serverIds(gladys).feature(feature);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeWud, PASSWORD, TOKEN, USERNAME, realContainers };
