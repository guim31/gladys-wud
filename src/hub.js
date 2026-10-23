// -----------------------------------------------------------------------------
// The What's Up Docker hub: the container list read on a timer of the
// container (the interval chosen in the configuration); the states published to
// Gladys when they change, the scene events fired on what happened since the
// last read, and the views the widget and the scene actions read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 15 minutes, beyond the fixed list of the core scheduler, and the scene
// events fire for every container, added to Gladys or not — "an update is
// available" is what spares the user one device per container.
//
// What was last seen of each container is kept in /data (src/store.js): an
// update found while the integration or Gladys restarted is still announced,
// once, and an update applied meanwhile is noticed.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildContainerDevice,
  buildServerDevice,
  containerIds,
  containerKey,
  containerValues,
  isServerId,
  parseContainerId,
  serverIds,
  serverValues,
} from './devices.js';
import { WudClient } from './wud/client.js';
import { ProblemLog } from './problems.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, pick } from './texts.js';

const logger = createLogger({ name: 'wud-hub' });

export const WIDGET_KEY = 'pending_updates';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  AVAILABLE: 'update_available',
  APPLIED: 'update_applied',
});

export const HUB_TIMINGS = {
  // After "Check now" on every container, WUD 9 checks in the background:
  // read again this soon to pick the result up.
  recheckReadMs: 30_000,
  // Every state is published again this often, even unchanged: Gladys shows
  // "no recent value" after 48 hours without one.
  heartbeatMs: 12 * 3600_000,
  // A container missing from the list this long is forgotten: until then, a
  // container removed and recreated (to update it) keeps its history.
  forgetMs: 7 * 24 * 3600_000,
};

const DAY_MS = 24 * 3600_000;
const MAX_STATES_PER_REQUEST = 100;
const MAX_STATES_PER_MINUTE = 250;
const MAX_TRANSPORTS_PER_REQUEST = 100;

const signature = (config) =>
  JSON.stringify([
    config.url,
    config.token,
    config.username,
    config.password,
    config.allowSelfSigned,
  ]);

/** A state in the publishStates format: a number, or `{ text }`. */
const toState = (externalId, value) =>
  typeof value === 'number'
    ? { device_feature_external_id: externalId, state: value }
    : { device_feature_external_id: externalId, text: value.text };
const stateKey = (value) => (typeof value === 'number' ? `n:${value}` : `t:${value.text}`);

export class WudHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/wud/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.signature = null;
    this.client = null;
    /** @type {Map<string, object>} the containers of the last read, by key */
    this.containers = new Map();
    this.version = null;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    /** Last value published per feature external id, and when. */
    this.published = new Map();
    this.publishedAt = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.widgetKey = null;
    this.saved = { initialized: false, lastFound: 0, containers: {} };
    this.pollTimer = null;
    this.soonTimer = null;
    this.stopped = false;
    // What fails again at every reading cycle: one line when it starts, one
    // when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const containers = saved?.containers;
    this.saved = {
      url: typeof saved?.url === 'string' ? saved.url : null,
      initialized: saved?.initialized === true,
      lastFound: Number.isFinite(saved?.lastFound) ? saved.lastFound : 0,
      containers: Object.fromEntries(
        Object.entries(containers && typeof containers === 'object' ? containers : {}).filter(
          ([, entry]) => entry && typeof entry === 'object',
        ),
      ),
    };
    this.savedKey = JSON.stringify(this.saved);
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.publishedAt.clear();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    if (this.config && this.config.language !== config.language) {
      this.discovered = null;
      this.published.clear(); // the texts follow the language
    }
    this.config = config;
    const next = config.url ? signature(config) : null;
    if (next !== this.signature) {
      this.signature = next;
      this.client = config.url
        ? new WudClient({
            url: config.url,
            token: config.token,
            username: config.username,
            password: config.password,
            insecure: config.allowSelfSigned,
            request: this.request,
          })
        : null;
      this.containers = new Map();
      this.version = null;
      this.readAt = 0;
      this.error = null;
    }
    try {
      await this.pollNow({ publish: true });
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.soonTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading WUD works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read again in a while (after "Check now"), on top of the usual timer. */
  readSoon() {
    clearTimeout(this.soonTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.soonTimer = setTimeout(() => {
      this.pollNow().catch((err) => logger.warn(`Read after a check failed: ${err.message}`));
    }, this.timings.recheckReadMs);
    this.soonTimer.unref?.();
  }

  // --- Devices ---------------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** Whether the configuration asks for a device for this container. */
  isProposed(container) {
    const { all, names } = this.config.containers;
    return all || names.has(container.name) || names.has(container.displayName);
  }

  discoveredDevices() {
    if (this.readAt <= 0) {
      return []; // never read: nothing to propose, not even the server
    }
    const language = this.config.language;
    return [
      buildServerDevice(this.gladys, { language, version: this.version }),
      ...[...this.containers.values()]
        .filter((container) => this.isProposed(container))
        .map((container) => buildContainerDevice(this.gladys, container, { language })),
    ];
  }

  /** Publish the Discovery list when it changed (a container added, renamed…). */
  async publishDevices({ force = false } = {}) {
    if (!this.client || (this.readAt === 0 && !force)) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale container.
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read again, publish the list again. */
  async rediscover() {
    await this.pollNow({ fresh: true });
    await this.publishDevices({ force: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (isServerId(this.gladys, device.external_id)) {
      await this.publishServerStates({ force: true });
    } else {
      const container = this.containers.get(parseContainerId(this.gladys, device.external_id));
      if (!container) {
        return;
      }
      await this.publishContainerStates(container, { force: true });
    }
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading WUD -------------------------------------------------------------

  /**
   * Read the containers and apply what changed. Concurrent calls share the read.
   * @returns {Promise<void>}
   */
  async pollNow({ publish = false, fresh = false } = {}) {
    if (!this.client) {
      return this.afterChanges({ publish });
    }
    const client = this.client;
    // A read in progress is shared, unless it started with another client
    // (reconfigured meanwhile) or the caller needs what happened since
    // (after a check of one container).
    if (this.polling && (this.polling.client !== client || fresh)) {
      await this.polling.promise.catch(() => {});
    }
    if (!this.polling || this.polling.client !== client) {
      const polling = { client };
      polling.promise = this.read(client).finally(() => {
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    await this.polling.promise;
    return this.afterChanges({ publish });
  }

  async read(client) {
    let containers;
    try {
      containers = await client.containers();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return this.applyFailure(client, err);
    }
    return this.applySuccess(client, containers);
  }

  async applyFailure(client, err) {
    if (client !== this.client) {
      return; // reconfigured meanwhile
    }
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.readAt === 0) {
      this.readAt = -1; // tried: the connection status may be published
    }
    if (wasError !== err.kind) {
      logger.warn(`WUD: ${err.message}`);
    }
    await this.publishServerStates();
  }

  async applySuccess(client, list) {
    if (client !== this.client) {
      return;
    }
    if (this.error) {
      logger.info('WUD answers again');
    }
    if (this.readAt <= 0) {
      try {
        this.version = await client.version();
      } catch (err) {
        logger.debug(`WUD version unavailable: ${err.message}`);
      }
      if (client !== this.client) {
        return;
      }
      logger.info(
        `Connected to WUD${this.version ? ` ${this.version}` : ''}, ${list.length} container(s)`,
      );
    }
    this.error = null;
    this.readAt = this.now();

    if (this.saved.url !== this.config.url) {
      // Another WUD: what was seen of the previous one means nothing here.
      this.saved = { url: this.config.url, initialized: false, lastFound: 0, containers: {} };
    }
    const next = new Map();
    for (const container of list) {
      next.set(containerKey(container), container);
    }
    const announce = this.saved.initialized;
    for (const [key, container] of next) {
      await this.update(key, container, announce);
    }
    if (client !== this.client) {
      return; // reconfigured while the events were sent
    }
    const now = this.now();
    for (const [key, entry] of Object.entries(this.saved.containers)) {
      if (!next.has(key) && now - (entry.seenAt ?? 0) > this.timings.forgetMs) {
        delete this.saved.containers[key];
      }
    }
    // An empty list (WUD restarting without its store) does not count as the
    // first read: the next one would announce every pending update at once.
    this.saved.initialized ||= next.size > 0;
    this.containers = next;
    this.save();

    for (const container of next.values()) {
      await this.publishContainerStates(container);
    }
    await this.publishServerStates();
  }

  save() {
    const key = JSON.stringify(this.saved);
    if (key !== this.savedKey) {
      // Written only when something changed: /data is often an SD card.
      this.savedKey = key;
      this.store.save(this.saved);
    }
  }

  /**
   * Compare a container with what was last seen of it, fire the scene events.
   * `announced` is the new version already announced (null: none pending).
   * The first read ever only records what is pending: installing the
   * integration does not announce every update at once.
   */
  async update(key, container, announce) {
    const before = this.saved.containers[key];
    // Refreshed once a day only: /data is written when something changed.
    const now = this.now();
    const seenAt = before && now - (before.seenAt ?? 0) < DAY_MS ? before.seenAt : now;
    if (before && (container.hidden || container.error)) {
      // A snoozed update, or a check that failed (registry down, rate limit):
      // nothing to conclude, decided at the next clean read.
      this.saved.containers[key] = { ...before, seenAt };
      return;
    }
    const entry = {
      signature: container.signature,
      current: container.current,
      announced: before?.announced ?? null,
      seenAt,
    };
    const events = [];
    if (before && before.signature !== container.signature) {
      // Another image runs: the update pending before was applied, unless WUD
      // still finds one (then only a newer one is announced below).
      if (before.announced && !container.updateAvailable) {
        events.push([
          TRIGGERS.APPLIED,
          {
            version: container.current.slice(0, 1000),
            previous_version: (before.current ?? '').slice(0, 1000),
          },
        ]);
      }
      if (!container.updateAvailable) {
        entry.announced = null;
      }
    }
    // A snoozed update, or a list read while WUD restarts, shows no update for
    // a while: `announced` is kept, the same update is never announced twice.
    if (container.updateAvailable && container.latest !== entry.announced) {
      events.push([
        TRIGGERS.AVAILABLE,
        {
          current_version: container.current.slice(0, 1000),
          new_version: container.latest.slice(0, 1000),
          kind: container.kind,
        },
      ]);
      entry.announced = container.latest;
    }
    if (!announce) {
      events.length = 0;
    }
    for (const [trigger, extra] of events) {
      if (!(await this.fireContainer(trigger, key, container, extra))) {
        // Gladys refused the event (it is restarting): announce it again later.
        if (before) {
          this.saved.containers[key] = { ...before, seenAt };
        } else {
          delete this.saved.containers[key];
        }
        return;
      }
      if (trigger === TRIGGERS.AVAILABLE) {
        this.saved.lastFound = this.now();
      }
    }
    this.saved.containers[key] = entry;
  }

  async fireContainer(key, containerKeyValue, container, extra) {
    logger.debug(`${key}: ${container.name} ${JSON.stringify(extra)}`);
    try {
      await this.gladys.publishSceneEvent(key, {
        device: containerIds(this.gladys, containerKeyValue).device,
        container: container.name.slice(0, 500),
        image: container.image.slice(0, 500),
        ...extra,
      });
      this.problems.recover('events', 'Scene events accepted again');
      return true;
    } catch (err) {
      this.problems.fail('events', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishValues(entries, { force = false } = {}) {
    const now = this.now();
    const states = [];
    for (const { externalId, value } of entries) {
      if (value === null) {
        continue;
      }
      const stale = now - (this.publishedAt.get(externalId) ?? 0) >= this.timings.heartbeatMs;
      if (!force && !stale && this.published.get(externalId) === stateKey(value)) {
        continue;
      }
      states.push(toState(externalId, value));
    }
    await this.sendStates(states);
  }

  /** The states of one container, when the user added its device. */
  async publishContainerStates(container, options) {
    if (!this.isCreated(containerIds(this.gladys, containerKey(container)).device)) {
      return; // Gladys drops the states of a device not added
    }
    await this.publishValues(
      containerValues(this.gladys, container, this.config.language),
      options,
    );
  }

  async publishServerStates(options) {
    if (this.readAt === 0 || !this.client || !this.isCreated(serverIds(this.gladys).device)) {
      return;
    }
    const reachable = this.error === null && this.readAt > 0;
    await this.publishValues(
      serverValues(this.gladys, {
        reachable,
        containers: reachable ? this.containers.values() : null,
        lastFound: this.saved.lastFound,
        language: this.config.language,
      }),
      options,
    );
  }

  async sendStates(all) {
    // Gladys accepts 300 states a minute: beyond the budget, the rest stays
    // unpublished and goes at the next cycles (after a resync, a language
    // change or the heartbeat of many containers).
    const now = this.now();
    this.sentTimes = (this.sentTimes ?? []).filter((at) => now - at < 60_000);
    const states = all.slice(0, Math.max(0, MAX_STATES_PER_MINUTE - this.sentTimes.length));
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      this.sentTimes.push(...batch.map(() => now));
      try {
        await this.gladys.publishStates(batch);
        const sentAt = this.now();
        for (const state of batch) {
          const value = state.text === undefined ? state.state : { text: state.text };
          this.published.set(state.device_feature_external_id, stateKey(value));
          this.publishedAt.set(state.device_feature_external_id, sentAt);
        }
        this.problems.recover('states', 'States accepted again');
      } catch (err) {
        this.problems.fail('states', `States refused: ${err.message}`);
      }
    }
  }

  async afterChanges({ publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    // The widget shows the pending updates and the error: refreshed when one
    // of them changes.
    const widgetKey = JSON.stringify([
      this.error?.kind ?? null,
      this.readAt > 0,
      [...this.containers.values()]
        .filter((container) => container.updateAvailable)
        .map((container) => [containerKey(container), container.latest]),
    ]);
    if (widgetKey !== this.widgetKey) {
      this.widgetKey = widgetKey;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: "local", or "unreachable". */
  async publishTransports() {
    if (this.readAt === 0 || !this.client) {
      return;
    }
    const transport = this.error === null ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    const ids = [
      serverIds(this.gladys).device,
      ...[...this.containers.keys()].map((key) => containerIds(this.gladys, key).device),
    ];
    const entries = [];
    for (const externalId of ids) {
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noInstance,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: this.readAt > 0 };
  }

  async publishConnectionStatus() {
    if (this.client && this.readAt === 0) {
      return; // not read yet
    }
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views and commands (widget, scene actions, report) -------------------------------

  /** The containers with an update, majors first, then by name. */
  pendingUpdates() {
    const rank = { major: 0, minor: 1, patch: 2, digest: 3, other: 4 };
    return [...this.containers.values()]
      .filter((container) => container.updateAvailable)
      .sort(
        (a, b) =>
          rank[a.kind] - rank[b.kind] ||
          (a.displayName || a.name).localeCompare(b.displayName || b.name),
      );
  }

  /** Throws when WUD cannot be asked anything. */
  assertReady() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noInstance, this.config?.language));
    }
  }

  /** The reason of a failed command, in the configured language. */
  commandError(err, single) {
    const language = this.config.language;
    if (single && err.status === 404) {
      return new Error(pick(ACTION_TEXT.unknownContainer, language)); // removed meanwhile
    }
    return new Error(err.kind ? pick(ERROR_TEXT[err.kind], language) : err.message);
  }

  /**
   * "Check now": WUD asks the registries again, for one container or every
   * container. Never an update of a container.
   * @param {string} [externalId] a container device; empty or the WUD device: every container
   * @returns {Promise<number>} how many containers are checked
   */
  async check(externalId) {
    this.assertReady();
    const language = this.config.language;
    if (!externalId || isServerId(this.gladys, externalId)) {
      try {
        await this.client.watchAll();
      } catch (err) {
        throw this.commandError(err, false);
      }
      logger.info('Check of every container requested');
      this.readSoon();
      return this.containers.size;
    }
    const key = parseContainerId(this.gladys, externalId);
    if (!key) {
      throw new Error(pick(ACTION_TEXT.unknownContainer, language));
    }
    if (!this.containers.has(key)) {
      await this.pollNow({ fresh: true });
    }
    const container = this.containers.get(key);
    if (!container) {
      throw new Error(pick(ACTION_TEXT.unknownContainer, language));
    }
    try {
      await this.client.watch(container.id);
    } catch (err) {
      if (err.status !== 404) {
        throw this.commandError(err, true);
      }
      // Recreated since the last read: a new Docker id.
      await this.pollNow({ fresh: true });
      const fresh = this.containers.get(key);
      if (!fresh) {
        throw this.commandError(err, true);
      }
      try {
        await this.client.watch(fresh.id);
      } catch (retry) {
        throw this.commandError(retry, true);
      }
    }
    logger.info(`Check of ${container.name} requested`);
    await this.pollNow({ fresh: true });
    return 1;
  }

  /** "Test the connection": read now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const status = this.connectionStatus();
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [text.ok];
      if (this.version) {
        parts.push(`WUD ${this.version}`);
      }
      parts.push(text.containers(this.containers.size));
      const pending = this.pendingUpdates();
      parts.push(text.updates(pending.length));
      const major = pending.filter((container) => container.kind === 'major').length;
      if (major > 0) {
        parts.push(text.major(major));
      }
      message[language] = parts.join(', ');
    }
    return message;
  }

  /** The error of WUD in words, null when it answers. */
  errorText(language) {
    return this.error ? pick(ERROR_TEXT[this.error.kind], language) : null;
  }
}
