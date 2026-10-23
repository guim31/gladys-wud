import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseContainerNames, parseInstanceUrl } from '../src/config.js';

test('the address: bare host, browser URL, sub-path, refused forms', () => {
  assert.equal(parseInstanceUrl('192.0.2.10:3000'), 'http://192.0.2.10:3000');
  assert.equal(parseInstanceUrl('https://wud.example.com/containers'), 'https://wud.example.com');
  assert.equal(parseInstanceUrl('https://example.com/wud/'), 'https://example.com/wud');
  assert.equal(parseInstanceUrl('http://user:pass@192.0.2.10:3000'), null);
  assert.equal(parseInstanceUrl('ftp://192.0.2.10'), null);
  assert.equal(parseInstanceUrl('   '), null);
});

test('the container names: commas, spaces, new lines, a leading slash, "*"', () => {
  assert.deepEqual(
    [...parseContainerNames('gladys, /zigbee2mqtt\nmosquitto').names],
    ['gladys', 'zigbee2mqtt', 'mosquitto'],
  );
  assert.equal(parseContainerNames('*').all, true);
  assert.equal(parseContainerNames(undefined).names.size, 0);
});

test('the defaults: French, 5 minutes, no credentials', () => {
  const config = normalizeConfig({});
  assert.equal(config.language, 'fr');
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.url, null);
  assert.equal(config.invalidUrl, false);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ url: 'http://' }).invalidUrl, true);
  assert.equal(normalizeConfig({ api_token: ' abc\n' }).token, 'abc');
});
