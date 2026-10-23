// -----------------------------------------------------------------------------
// The `pending_updates` widget: content within the core budget (checked with
// the SDK validator), majors first, the "Check now" button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { ACTIONS } from '../src/widgets.js';
import { FakeWud, createWorld } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const content = async (w, language = 'en') => {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
};

const valid = (data) => {
  assert.deepEqual(validateWidgetContent(data), []);
};

test('the containers with an update, majors first, and the figures', async (t) => {
  const w = await world(t);
  const data = await content(w);
  valid(data);
  const [updates, major, list, button] = data.components;
  assert.equal(updates.value, 3);
  assert.equal(major.value, 1);
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.text]),
    [
      ['redis', '7.0.0 → 8.10.2', 'Major'],
      ['alpine', '3.18 → 3.24', 'Minor'],
      ['nginx', '1.25.0 → 1.31.8', 'Minor'],
    ],
  );
  assert.equal(button.action.key, ACTIONS.CHECK_ALL);
  const french = await content(w, 'fr');
  assert.equal(french.components[2].items[0].badge.text, 'Majeure');
});

test('every container up to date, WUD down, not configured', async (t) => {
  const wud = new FakeWud();
  for (const name of ['alpine', 'nginx', 'redis']) {
    wud.apply(name);
  }
  const w = await world(t, { wud });
  assert.equal((await content(w)).components[2].text, 'Every container is up to date.');
  wud.failure = { code: 'ECONNREFUSED' };
  await w.hub.pollNow();
  const down = await content(w);
  valid(down);
  assert.match(down.components[2].text, /does not answer/);
  const empty = await world(t, { config: {} });
  assert.match((await content(empty)).components[0].text, /Enter the address/);
});

test('more than 8 updates: 8 rows and a line for the rest, within the budget', async (t) => {
  const wud = new FakeWud();
  const base = wud.get('nginx');
  for (let i = 0; i < 10; i += 1) {
    wud.containers.push({ ...structuredClone(base), name: `web${i}`, displayName: `web${i}` });
  }
  const w = await world(t, { wud });
  const data = await content(w);
  valid(data);
  assert.equal(data.components[2].items.length, 8);
  assert.equal(data.components[3].text, 'And 5 more.');
});

test('"Check now" asks WUD to check every container', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction(WIDGET_KEY, ACTIONS.CHECK_ALL);
  assert.equal(ack.success, true, ack.error);
  assert.ok(w.wud.calls.includes('POST /api/containers/watch'));
});
