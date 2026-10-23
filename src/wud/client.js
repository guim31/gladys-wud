// -----------------------------------------------------------------------------
// What's Up Docker client: the REST API of WUD (`/api`, port 3000). Checked
// against a real WUD 9.5.0 and 8.4.0 (test/fixtures/wud/).
//
// Authentication, the first one configured wins:
//   - an API token (WUD 9, profile → API tokens): `Authorization: Bearer`;
//   - a user and a password: `Authorization: Basic` (WUD 8 optional, WUD 9
//     mandatory);
//   - nothing (WUD 8 without authentication).
//
// What the integration reads, at every cycle: GET /api/containers (every
// watched container, its current tag, the newer tag or digest WUD found, the
// kind of update), and once GET /api/app (version).
// What it writes, on the user's request only (the "Check now" scene action and
// widget button): POST /api/containers/watch?async=true (WUD 9 answers 202 at
// once, WUD 8 ignores the parameter and answers when done) or
// POST /api/containers/<id>/watch for one container. Never an update, never a
// WUD trigger: the integration is read-only on the containers.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // credentials refused
  AUTH_MISSING: 'auth_missing', // WUD asks for credentials and none are configured
  READ_ONLY: 'read_only', // a check refused: read-only user or token
  NOT_WUD: 'not_wud', // something answers, not WUD
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class WudError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'WudError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// WUD's own words for the kinds of update (`updateKind.semverDiff`), plus the
// digest of a moving tag (`latest`) and an update WUD cannot rank.
export const UPDATE_KINDS = Object.freeze(['major', 'minor', 'patch', 'digest', 'other']);

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** `sha256:0123456789abcdef…` → `0123456789ab`, the short form Docker prints. */
export const shortDigest = (value) =>
  text(value)
    ?.replace(/^sha256:/, '')
    .slice(0, 12) ?? null;

/**
 * One entry of GET /api/containers, normalized. The identity of a container is
 * its watcher and its name: a container recreated to update it changes id.
 */
export function normalizeContainer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const image = source.image && typeof source.image === 'object' ? source.image : {};
  const tag = text(image.tag?.value) ?? 'latest';
  const update =
    source.updateKind && typeof source.updateKind === 'object' ? source.updateKind : {};
  const digest = update.kind === 'digest';
  let kind = null;
  if (source.updateAvailable === true) {
    if (digest) {
      kind = 'digest';
    } else {
      kind = ['major', 'minor', 'patch'].includes(update.semverDiff) ? update.semverDiff : 'other';
    }
  }
  const localDigest = shortDigest(update.localValue) ?? shortDigest(image.digest?.value);
  const current = digest && localDigest ? `${tag} (${localDigest})` : tag;
  let latest = null;
  if (kind === 'digest') {
    const remote = shortDigest(update.remoteValue) ?? shortDigest(source.result?.digest);
    latest = remote ? `${tag} (${remote})` : tag;
  } else if (kind) {
    latest = text(update.remoteValue) ?? text(source.result?.tag);
  }
  return {
    id: text(source.id) ?? '',
    name: text(source.name) ?? text(source.displayName) ?? '',
    displayName: text(source.displayName) ?? text(source.name) ?? '',
    watcher: text(source.watcher) ?? 'local',
    image: text(image.name)?.replace(/^library\//, '') ?? '',
    tag,
    current,
    // What changes when the container runs another image: a new tag, or the
    // same tag pulled again (`latest`).
    signature: `${tag}|${text(image.id) ?? localDigest ?? ''}`,
    updateAvailable: kind !== null,
    kind,
    latest: kind ? (latest ?? '?') : null,
    link: text(source.result?.link) ?? text(source.link),
    error: text(source.error?.message),
  };
}

export class WudClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.token] API token (WUD 9), '' for none
   * @param {string} [options.username] '' for none
   * @param {string} [options.password]
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    token = '',
    username = '',
    password = '',
    insecure = false,
    request = httpRequest,
    timeoutMs = 15_000,
  }) {
    this.url = url;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
    if (token) {
      this.authorization = `Bearer ${token}`;
    } else if (username) {
      this.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    } else {
      this.authorization = null;
    }
  }

  /**
   * @returns {Promise<{ status: number, body: string }>} a 2xx answer
   * @throws {WudError}
   */
  async call(path, { method = 'GET', timeoutMs = this.timeoutMs } = {}) {
    const headers = { accept: 'application/json' };
    if (this.authorization) {
      headers.authorization = this.authorization;
    }
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        headers,
        body: method === 'POST' ? '' : undefined,
        insecure: this.insecure,
        timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new WudError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new WudError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message, {
        code: err.code,
      });
    }
    const { status } = response;
    if (status === 401) {
      throw this.authorization
        ? new WudError(ERROR_KINDS.AUTH, 'Credentials refused (HTTP 401)', { status })
        : new WudError(ERROR_KINDS.AUTH_MISSING, 'WUD asks for credentials (HTTP 401)', {
            status,
          });
    }
    if (status === 403) {
      // A read-only user or token: reading works, checking does not.
      throw method === 'GET'
        ? new WudError(ERROR_KINDS.AUTH, 'Access refused (HTTP 403)', { status })
        : new WudError(ERROR_KINDS.READ_ONLY, 'Check refused, read-only access (HTTP 403)', {
            status,
          });
    }
    if (status >= 300 && status < 400) {
      throw new WudError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new WudError(ERROR_KINDS.NOT_WUD, `Not found (HTTP 404) on ${path.split('?')[0]}`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new WudError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
    return response;
  }

  async json(path) {
    const { body } = await this.call(path);
    try {
      return JSON.parse(body);
    } catch {
      // An HTML page: another service, or a reverse proxy login page.
      throw new WudError(ERROR_KINDS.NOT_WUD, 'The answer is not WUD JSON');
    }
  }

  /** Every container WUD watches, in the order of the API. */
  async containers() {
    const data = await this.json('/api/containers');
    if (!Array.isArray(data)) {
      throw new WudError(ERROR_KINDS.NOT_WUD, 'The container list is not an array');
    }
    return data.map(normalizeContainer).filter((container) => container.name);
  }

  /** @returns {Promise<string|null>} the version of WUD */
  async version() {
    const data = await this.json('/api/app');
    return text(data?.version);
  }

  /**
   * Every watcher checks its containers now. WUD 9 answers at once (202);
   * WUD 8 answers once done: a time-out then only means it is still checking.
   */
  async watchAll() {
    try {
      await this.call('/api/containers/watch?async=true', { method: 'POST', timeoutMs: 30_000 });
    } catch (err) {
      if (err.kind !== ERROR_KINDS.UNREACHABLE || err.code !== 'ETIMEDOUT') {
        throw err;
      }
    }
  }

  /** One container checks its registry now (answers once done). */
  async watch(id) {
    await this.call(`/api/containers/${encodeURIComponent(id)}/watch`, {
      method: 'POST',
      timeoutMs: 60_000,
    });
  }
}
