// -----------------------------------------------------------------------------
// The WUD client on the real answers of WUD 9.5.0 and 8.4.0
// (test/fixtures/wud/), and its errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERROR_KINDS, WudClient, normalizeContainer } from '../src/wud/client.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/wud/${name}`, import.meta.url), 'utf8'));

const answer =
  (body, status = 200) =>
  async () => ({
    status,
    headers: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

for (const version of ['9.5.0', '8.4.0']) {
  test(`the containers of a real WUD ${version}`, async () => {
    const client = new WudClient({
      url: 'http://192.0.2.10:3000',
      request: answer(fixture(`containers-${version}.json`)),
    });
    const containers = await client.containers();
    const byName = Object.fromEntries(containers.map((c) => [c.name, c]));
    assert.deepEqual(
      [byName.nginx.current, byName.nginx.latest, byName.nginx.kind, byName.nginx.image],
      ['1.25.0', '1.31.8', 'minor', 'nginx'],
    );
    assert.equal(byName.redis.kind, 'major');
    assert.equal(byName.busybox.updateAvailable, false);
    assert.equal(byName.busybox.latest, null);
    assert.equal(byName.nginx.watcher, 'local');
    const app = new WudClient({
      url: 'http://192.0.2.10:3000',
      request: answer(fixture(`app-${version}.json`)),
    });
    assert.equal(await app.version(), version);
  });
}

test('a container in error (registry unknown to WUD) has no update', () => {
  const container = normalizeContainer(
    fixture('containers-9.5.0.json').find((c) => c.name === 'private-tool'),
  );
  assert.equal(container.updateAvailable, false);
  assert.equal(container.error, 'Unsupported Registry unknown');
});

test('a digest update shows the tag and the short digests', () => {
  const container = normalizeContainer({
    name: 'app',
    watcher: 'local',
    image: { name: 'library/app', tag: { value: 'latest' }, digest: { value: 'sha256:aaa' } },
    updateAvailable: true,
    updateKind: {
      kind: 'digest',
      localValue: 'sha256:0123456789abcdef',
      remoteValue: 'sha256:fedcba9876543210',
    },
  });
  assert.equal(container.current, 'latest (0123456789ab)');
  assert.equal(container.latest, 'latest (fedcba987654)');
  assert.equal(container.kind, 'digest');
});

test('credentials: a token as bearer, a user as basic, nothing otherwise', async () => {
  const seen = [];
  const request = async (url, { headers }) => {
    seen.push(headers.authorization);
    return { status: 200, headers: {}, body: '[]' };
  };
  const url = 'http://192.0.2.10:3000';
  await new WudClient({ url, token: 't0k', username: 'u', password: 'p', request }).containers();
  await new WudClient({ url, username: 'u', password: 'p', request }).containers();
  await new WudClient({ url, request }).containers();
  assert.deepEqual(seen, [
    'Bearer t0k',
    `Basic ${Buffer.from('u:p').toString('base64')}`,
    undefined,
  ]);
});

test('errors: refused, missing, read-only check, not WUD, redirect, down', async () => {
  const url = 'http://192.0.2.10:3000';
  const kind = async (client, call = (c) => c.containers()) => {
    try {
      await call(client);
    } catch (err) {
      return err.kind;
    }
    return null;
  };
  assert.equal(
    await kind(new WudClient({ url, token: 'x', request: answer('', 401) })),
    ERROR_KINDS.AUTH,
  );
  assert.equal(
    await kind(new WudClient({ url, request: answer('', 401) })),
    ERROR_KINDS.AUTH_MISSING,
  );
  assert.equal(
    await kind(new WudClient({ url, token: 'x', request: answer('', 403) }), (c) => c.watchAll()),
    ERROR_KINDS.READ_ONLY,
  );
  assert.equal(await kind(new WudClient({ url, request: answer('<html>') })), ERROR_KINDS.NOT_WUD);
  assert.equal(await kind(new WudClient({ url, request: answer({}) })), ERROR_KINDS.NOT_WUD);
  assert.equal(await kind(new WudClient({ url, request: answer('', 301) })), ERROR_KINDS.REDIRECT);
  const down = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  };
  assert.equal(await kind(new WudClient({ url, request: down })), ERROR_KINDS.UNREACHABLE);
});

test('"check every container" on WUD 8 (answers once done): a time-out is not a failure', async () => {
  const slow = async () => {
    throw Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' });
  };
  await new WudClient({ url: 'http://192.0.2.10:3000', request: slow }).watchAll();
});
