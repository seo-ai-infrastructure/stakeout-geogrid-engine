import assert from 'node:assert/strict';
import { test } from 'node:test';
import demo from '../apps/web/data/demographics-demo.json';
import { type Tract, type DemoPin, visibilityMetrics, formatPercent, formatMoney } from '../apps/web/lib/demographics';

const tract = (GEOID: string, income: number | null, owners: number | null, ownerPct = 70) => ({ GEOID, income, owner_units: owners, owner_pct: ownerPct } as Tract);
const pin = (id: string, tractId: string | null, rankSouth: number, rankNorth = rankSouth) => ({ id, tractId, rankSouth, rankNorth, lat: 28, lng: -82, aiCited: false } as DemoPin);
const noFilters = { minIncome: 0, minOwners: 0 };

test('tract weight is shared among its pins rather than counted repeatedly', () => {
  const tracts = { a: tract('a', 100000, 100), b: tract('b', 50000, 200) };
  const pins = [pin('1', 'a', 1), pin('2', 'a', 2), pin('3', 'b', 10)];
  const scores = visibilityMetrics(pins, tracts, 'south', noFilters);
  assert.equal(scores.weighted, 50);
  assert.ok(Math.abs(scores.standard! - 200 / 3) < 1e-10);
  assert.equal(scores.delta, scores.weighted! - scores.standard!);
});

test('filters use a consistent visible cohort for pins and both score denominators', () => {
  const tracts = { a: tract('a', 120000, 100, 80), b: tract('b', 50000, 200, 40) };
  const pins = [pin('1', 'a', 1), pin('2', 'b', 10)];
  const scores = visibilityMetrics(pins, tracts, 'south', { minOwners: 60, minIncome: 100000 });
  assert.equal(scores.eligible.length, 1); assert.equal(scores.standard, 100); assert.equal(scores.weighted, 100);
});

test('missing, zero and non-finite weights are excluded without imputation', () => {
  const tracts = { a: tract('a', 100000, 100), b: tract('b', null, 100), c: tract('c', 50000, 0), d: tract('d', Infinity, 100) };
  const scores = visibilityMetrics([pin('1', 'a', 1), pin('2', 'b', 20), pin('3', 'c', 20), pin('4', null, 20), pin('5', 'd', 20)], tracts, 'south', noFilters);
  assert.equal(scores.weightedPins, 1); assert.equal(scores.weighted, 100); assert.equal(scores.standard, 20);
  assert.equal(formatPercent(0), '0.0%'); assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(null), 'Not available');
});

test('empty filtered cohorts report unavailable rather than zero visibility', () => {
  const scores = visibilityMetrics([pin('1', 'a', 1)], { a: tract('a', 50000, 100, 40) }, 'south', { minOwners: 80, minIncome: 0 });
  assert.equal(scores.standard, null); assert.equal(scores.weighted, null); assert.equal(scores.delta, null);
});

test('real fixture has complete spatial joins and scenarios isolate geography from raw SoLV', () => {
  const tracts = demo.tracts as Record<string, Tract>;
  const pins = demo.pins as DemoPin[];
  assert.equal(Object.keys(tracts).length, 174); assert.equal(pins.length, 49);
  assert.equal(new Set(pins.map(p => p.id)).size, 49);
  for (const p of pins) { assert.ok(p.tractId && tracts[p.tractId]); assert.ok(p.lat > 27 && p.lat < 29); assert.ok(p.lng > -83 && p.lng < -81); }
  for (const t of Object.values(tracts)) {
    assert.match(t.GEOID, /^12105\d{6}$/);
    for (const k of ['owner_pct', 'poverty_pct', 'unemp_pct'] as const) assert.ok(t[k] === null || (t[k] >= 0 && t[k] <= 100));
    for (const k of ['income', 'home_value', 'year_built'] as const) assert.ok(t[k] === null || t[k] >= 0);
  }
  const south = visibilityMetrics(pins, tracts, 'south', noFilters);
  const north = visibilityMetrics(pins, tracts, 'north', noFilters);
  assert.equal(south.standard, north.standard); assert.notEqual(south.weighted, north.weighted);
  assert.equal(south.weightedPins, 49);
  console.log(`Demo scenarios: raw ${south.standard?.toFixed(1)}%; south weighted ${south.weighted?.toFixed(1)}%; north weighted ${north.weighted?.toFixed(1)}%`);
});
