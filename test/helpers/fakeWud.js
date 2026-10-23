// -----------------------------------------------------------------------------
// An in-memory What's Up Docker, answering the routes of its REST API the way
// WUD 9.5.0 does (the shapes of test/fixtures/wud/): container list, app
// version, "watch" of every container or of one. `failure` simulates a server
// down, refused credentials, etc. Starts from the real list of the fixture:
// alpine 3.18 (minor), nginx 1.25.0 (minor), redis 7.0.0 (major), busybox
// latest (up to date), private-tool (registry unknown to WUD).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const USERNAME = 'gladys';
export const PASSWORD = 'wud-test-password';
export const TOKEN = 'wud-test-token';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/wud/${name}`, import.meta.url), 'utf8'));

export const realContainers = () => fixture('containers-9.5.0.json');

let nextId = 1;
const newId = () => `${String(nextId++).padStart(4, '0')}${'ab'.repeat(30)}`;

export class FakeWud {
  constructor({ containers = realContainers(), auth = 'basic', version = '9.5.0' } = {}) {
    this.containers = containers;
    this.auth = auth; // 'basic', 'token', 'none'
    this.readOnly = false;
    this.version = version;
    this.failure = null; // { code } (network error) or { status }
    this.calls = [];
  }

  get(name) {
    return this.containers.find((container) => container.name === name);
  }

  /** WUD found a newer tag for a container. */
  offer(name, tag, semverDiff = 'minor') {
    const container = this.get(name);
    container.result = { ...container.result, tag };
    container.updateAvailable = true;
    container.updateKind = {
      kind: 'tag',
      localValue: container.image.tag.value,
      remoteValue: tag,
      semverDiff,
    };
  }

  /** WUD found a new digest for a moving tag (`latest`). */
  offerDigest(name, digest) {
    const container = this.get(name);
    container.image.digest = { watch: true, value: 'sha256:1111111111111111aaaa', repo: null };
    container.result = { ...container.result, digest };
    container.updateAvailable = true;
    container.updateKind = {
      kind: 'digest',
      localValue: container.image.digest.value,
      remoteValue: digest,
      semverDiff: null,
    };
  }

  /** The user updated the container: recreated, new id, new image, no update left. */
  apply(name, tag = null) {
    const container = this.get(name);
    container.id = newId();
    container.image.id = `sha256:${newId()}`;
    if (tag) {
      container.image.tag.value = tag;
    }
    if (container.image.digest?.watch) {
      container.image.digest.value = container.result.digest;
    }
    container.result = { ...container.result, tag: container.image.tag.value };
    container.updateAvailable = false;
    container.updateKind = {
      kind: 'unknown',
      localValue: null,
      remoteValue: null,
      semverDiff: null,
    };
  }

  /** The user snoozed the update in WUD 9: no update shown, same image. */
  snooze(name) {
    const container = this.get(name);
    container.isSnoozed = true;
    container.updateAvailable = false;
  }

  remove(name) {
    this.containers = this.containers.filter((container) => container.name !== name);
  }

  authorized(headers) {
    const header = headers.authorization ?? '';
    if (this.auth === 'none') {
      return true;
    }
    if (this.auth === 'token') {
      return header === `Bearer ${TOKEN}`;
    }
    return (
      header === `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}` ||
      header === `Bearer ${TOKEN}`
    );
  }

  /** The HTTP seam of src/wud/http.js. */
  async request(url, { method = 'GET', headers = {} } = {}) {
    const { pathname } = new URL(url);
    this.calls.push(`${method} ${pathname}`);
    if (this.failure?.code) {
      const error = new Error(this.failure.code);
      error.code = this.failure.code;
      throw error;
    }
    if (this.failure?.status) {
      return { status: this.failure.status, headers: {}, body: '<html></html>' };
    }
    if (!this.authorized(headers)) {
      return { status: 401, headers: {}, body: 'Unauthorized' };
    }
    const json = (body, status = 200) => ({ status, headers: {}, body: JSON.stringify(body) });
    if (method === 'GET' && pathname === '/api/containers') {
      return json(this.containers);
    }
    if (method === 'GET' && pathname === '/api/app') {
      return json({ name: 'wud', version: this.version });
    }
    if (method === 'POST' && this.readOnly) {
      return json({ error: 'Forbidden' }, 403);
    }
    if (method === 'POST' && pathname === '/api/containers/watch') {
      return json({ status: 'started', jobId: '5f4cd3e7-4cb1-4b1c-95b9-340c9b9bea4d' }, 202);
    }
    const one = pathname.match(/^\/api\/containers\/([^/]+)\/watch$/);
    if (method === 'POST' && one) {
      const container = this.containers.find((c) => c.id === decodeURIComponent(one[1]));
      return container ? json(container) : { status: 404, headers: {}, body: '' };
    }
    return { status: 404, headers: {}, body: '' };
  }
}
