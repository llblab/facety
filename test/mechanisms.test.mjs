import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { experimentConfig } from '../src/experiment.mjs';
import { WALKTHROUGHS, runWalkthrough } from '../examples/causal-walkthroughs.mjs';

const register = JSON.parse(readFileSync(new URL('../docs/mechanisms.json', import.meta.url), 'utf8'));
function leaves(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? prefix + '.' + key : key));
}
function matches(pattern, path) {
  const a = pattern.split('.');
  const b = path.split('.');
  return a.length === b.length && a.every((key, i) => key === '*' || key === b[i]);
}

test('every normalized experiment control has inventory meaning, units, scope, provenance and status', () => {
  const parameters = register.inventory.parameters;
  const paths = leaves(experimentConfig());
  for (const path of paths) assert.ok(parameters.some(row => row.paths.some(pattern => matches(pattern, path))), 'missing ' + path);
  for (const row of parameters) {
    for (const key of ['meaning', 'units', 'scope', 'provenance', 'status']) assert.ok(row[key], row.paths + ' missing ' + key);
    for (const pattern of row.paths) assert.ok(paths.some(path => matches(pattern, path)), 'stale ' + pattern);
  }
});

test('mechanism records retain open links, falsifiers, source paths and trace bindings without asserting emergence', () => {
  const ids = register.mechanisms.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 15);
  for (const row of register.mechanisms) {
    for (const field of ['question', 'initiatingChange', 'path', 'feedback', 'signs', 'delay', 'bottleneck', 'basis', 'code', 'observable', 'intervention', 'alternative', 'falsifier', 'status', 'diagram']) assert.ok(row[field], row.id + ':' + field);
    for (const path of row.code) {
      const url = new URL('../' + path.split('#')[0], import.meta.url);
      assert.ok(existsSync(url), row.id + ':' + path);
      if (path.includes('#')) for (const token of path.slice(path.indexOf('#') + 1).split('/').map(value => value.replace(/^#/, ''))) {
        assert.ok(readFileSync(url, 'utf8').includes(token), row.id + ': stale code locator ' + token);
      }
    }
    for (const name of row.diagnostic ?? []) assert.ok(WALKTHROUGHS.includes(name), row.id + ':' + name);
  }
  for (const name of WALKTHROUGHS) for (const record of runWalkthrough(name).trace.records) {
    for (const id of record.mechanisms) assert.ok(ids.includes(id), name + ':' + id);
  }
  assert.ok(register.mechanisms.find(row => row.id === 'M08').feedback.missing.includes('unimplemented'));
});
