// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds. WUD asks the
// registries itself (every hour by default): reading what it found every few
// minutes is enough, and never forces a check.
export const POLL_INTERVALS = ['120', '300', '600', '900'];

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  api_token: '',
  containers: '',
  poll_interval: '300',
  allow_self_signed: false,
  language: 'fr',
};

// Pages of the WUD interface: a URL copied from the browser points at one of
// them, the API lives at the root.
const INTERFACE_PATH =
  /\/(containers?|watchers?|registries|triggers|authentications|servers?|login|configuration|logs|api)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:3000`), or a URL copied from the browser
 * (`https://wud.example.com/containers`). HTTP by default. A path is kept
 * (behind a reverse proxy sub-path), the interface pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseInstanceUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * The containers to propose as devices: names separated by commas, spaces or
 * new lines; `*` for every container.
 * @returns {{ all: boolean, names: Set<string> }}
 */
export function parseContainerNames(raw) {
  const names = new Set(
    (typeof raw === 'string' ? raw : '')
      .split(/[\s,;]+/)
      .map((name) => name.trim().replace(/^\//, ''))
      .filter(Boolean),
  );
  return { all: names.has('*'), names };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const value = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const chosen = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(chosen) ? chosen : DEFAULT_CONFIG[key];
  };
  const typed = value('url');
  const url = typed ? parseInstanceUrl(typed) : null;
  return {
    url,
    invalidUrl: Boolean(typed) && url === null,
    username: value('username'),
    // A password may start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    // A pasted token often carries a trailing space or new line.
    token: value('api_token'),
    containers: parseContainerNames(source.containers),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    allowSelfSigned: source.allow_self_signed === true || source.allow_self_signed === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
