// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab: the user adds the ones to
// follow, nothing is created on their behalf.
//
// - One "What's Up Docker" device for the server: reachable (input/binary),
//   watched containers, updates available, major updates (counter-sensor),
//   and the date of the last update found (text, there is no "last check"
//   date in the WUD API).
// - One device per container, only for the names listed in the configuration
//   (or every container with `*`): update available (input/binary), current
//   version and new version (text). Keyed on the watcher and the name of the
//   container: a container recreated to update it changes id, not name.
//
// Published with should_poll: false: the integration reads WUD on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPES = Object.freeze({ CONTAINER: 'container', SERVER: 'server' });
export const SERVER_ID = 'server';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  CONTAINERS: 'containers',
  UPDATES: 'updates',
  MAJOR_UPDATES: 'major_updates',
  LAST_FOUND: 'last_found',
  UPDATE_AVAILABLE: 'update_available',
  CURRENT_VERSION: 'current_version',
  NEW_VERSION: 'new_version',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.REACHABLE]: 'Reachable',
    [FEATURE_KEYS.CONTAINERS]: 'Watched containers',
    [FEATURE_KEYS.UPDATES]: 'Updates available',
    [FEATURE_KEYS.MAJOR_UPDATES]: 'Major updates',
    [FEATURE_KEYS.LAST_FOUND]: 'Last update found',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Update available',
    [FEATURE_KEYS.CURRENT_VERSION]: 'Current version',
    [FEATURE_KEYS.NEW_VERSION]: 'New version',
  },
  fr: {
    [FEATURE_KEYS.REACHABLE]: 'Joignable',
    [FEATURE_KEYS.CONTAINERS]: 'Conteneurs surveillés',
    [FEATURE_KEYS.UPDATES]: 'Mises à jour disponibles',
    [FEATURE_KEYS.MAJOR_UPDATES]: 'Mises à jour majeures',
    [FEATURE_KEYS.LAST_FOUND]: 'Dernière mise à jour trouvée',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Mise à jour disponible',
    [FEATURE_KEYS.CURRENT_VERSION]: 'Version actuelle',
    [FEATURE_KEYS.NEW_VERSION]: 'Nouvelle version',
  },
  de: {
    [FEATURE_KEYS.REACHABLE]: 'Erreichbar',
    [FEATURE_KEYS.CONTAINERS]: 'Überwachte Container',
    [FEATURE_KEYS.UPDATES]: 'Verfügbare Updates',
    [FEATURE_KEYS.MAJOR_UPDATES]: 'Major-Updates',
    [FEATURE_KEYS.LAST_FOUND]: 'Zuletzt gefundenes Update',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Update verfügbar',
    [FEATURE_KEYS.CURRENT_VERSION]: 'Aktuelle Version',
    [FEATURE_KEYS.NEW_VERSION]: 'Neue Version',
  },
  es: {
    [FEATURE_KEYS.REACHABLE]: 'Accesible',
    [FEATURE_KEYS.CONTAINERS]: 'Contenedores vigilados',
    [FEATURE_KEYS.UPDATES]: 'Actualizaciones disponibles',
    [FEATURE_KEYS.MAJOR_UPDATES]: 'Actualizaciones mayores',
    [FEATURE_KEYS.LAST_FOUND]: 'Última actualización encontrada',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Actualización disponible',
    [FEATURE_KEYS.CURRENT_VERSION]: 'Versión actual',
    [FEATURE_KEYS.NEW_VERSION]: 'Nueva versión',
  },
};

// The text of "New version" while the container is up to date (a text state
// is never empty).
export const UP_TO_DATE = { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Actualizado' };

export const SERVER_NAME = "What's Up Docker";
export const MODEL = "What's Up Docker";

// Display bound of the counters (the core never applies it on write).
export const MAX_COUNT = 10_000;
// A text state, at most (Gladys stores it in a string column).
export const MAX_TEXT = 200;

/** The platform id of a container: its watcher and its name (no dot in a watcher name). */
export const containerKey = (container) => `${container.watcher}.${container.name}`;

export const containerIds = (gladys, key) => gladys.externalIds(DEVICE_TYPES.CONTAINER, key);
export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPES.SERVER, SERVER_ID);

/** The container key of a container device external id, null when it is not one. */
export function parseContainerId(gladys, externalId) {
  const prefix = containerIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const key = externalId.slice(prefix.length);
  return /^[^.:]+\.[^:]+$/.test(key) ? key : null;
}

export const isServerId = (gladys, externalId) => externalId === serverIds(gladys).device;

const sensor = (names, ids, key, extra) => ({
  name: names[key],
  external_id: ids.feature(key),
  read_only: true,
  has_feedback: false,
  ...extra,
});

const binary = (names, ids, key) =>
  sensor(names, ids, key, {
    category: DEVICE_FEATURE_CATEGORIES.INPUT,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    keep_history: true,
    min: 0,
    max: 1,
  });

const textFeature = (names, ids, key) =>
  sensor(names, ids, key, {
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: false,
    // min and max are NOT NULL in Gladys, text features included.
    min: 0,
    max: 0,
  });

const counter = (names, ids, key) =>
  sensor(names, ids, key, {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    keep_history: true,
    min: 0,
    max: MAX_COUNT,
  });

/** The discovery payload of the server device. */
export function buildServerDevice(gladys, { language = 'en', version = null } = {}) {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: SERVER_NAME,
    external_id: ids.device,
    model: version ? `${MODEL} ${version}` : MODEL,
    should_poll: false,
    features: [
      binary(names, ids, FEATURE_KEYS.REACHABLE),
      counter(names, ids, FEATURE_KEYS.CONTAINERS),
      counter(names, ids, FEATURE_KEYS.UPDATES),
      counter(names, ids, FEATURE_KEYS.MAJOR_UPDATES),
      textFeature(names, ids, FEATURE_KEYS.LAST_FOUND),
    ],
  };
}

/** The discovery payload of a container. */
export function buildContainerDevice(gladys, container, { language = 'en' } = {}) {
  const ids = containerIds(gladys, containerKey(container));
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: (container.displayName || container.name).slice(0, 255),
    external_id: ids.device,
    model: (container.image || MODEL).slice(0, 255),
    should_poll: false,
    params: [{ name: 'WUD_WATCHER', value: container.watcher.slice(0, 255) }],
    features: [
      binary(names, ids, FEATURE_KEYS.UPDATE_AVAILABLE),
      textFeature(names, ids, FEATURE_KEYS.CURRENT_VERSION),
      textFeature(names, ids, FEATURE_KEYS.NEW_VERSION),
    ],
  };
}

/**
 * The local date and time, in the language of the configuration (Gladys gives
 * the container its time zone in TZ).
 */
export function formatDate(ms, language) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

const clip = (value) => (value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT - 1)}…` : value);

/**
 * The value of every feature of a container (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|{ text: string }|null }>}
 */
export function containerValues(gladys, container, language) {
  const ids = containerIds(gladys, containerKey(container));
  return [
    { key: FEATURE_KEYS.UPDATE_AVAILABLE, value: container.updateAvailable ? 1 : 0 },
    { key: FEATURE_KEYS.CURRENT_VERSION, value: { text: clip(container.current) } },
    {
      key: FEATURE_KEYS.NEW_VERSION,
      value: {
        text: clip(container.latest ?? UP_TO_DATE[language] ?? UP_TO_DATE.en),
      },
    },
  ].map((entry) => ({ ...entry, externalId: ids.feature(entry.key) }));
}

/**
 * The values of the server device.
 * @param {object} gladys
 * @param {{ reachable: boolean, containers: Iterable<object>|null, lastFound: number, language: string }} state
 */
export function serverValues(gladys, { reachable, containers, lastFound, language }) {
  const ids = serverIds(gladys);
  const values = [{ key: FEATURE_KEYS.REACHABLE, value: reachable ? 1 : 0 }];
  if (containers) {
    const list = [...containers];
    values.push(
      { key: FEATURE_KEYS.CONTAINERS, value: list.length },
      { key: FEATURE_KEYS.UPDATES, value: list.filter((c) => c.updateAvailable).length },
      { key: FEATURE_KEYS.MAJOR_UPDATES, value: list.filter((c) => c.kind === 'major').length },
      {
        key: FEATURE_KEYS.LAST_FOUND,
        value: lastFound > 0 ? { text: formatDate(lastFound, language) } : null,
      },
    );
  }
  return values.map((entry) => ({ ...entry, externalId: ids.feature(entry.key) }));
}
