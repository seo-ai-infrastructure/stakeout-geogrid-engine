import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { buildingLayer, buildingHeight, buildingBase } from '../apps/web/lib/demographic-map-view';

// Validate against the same style engine installed with the web map, without starting WebGL.
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const mapRequire = createRequire(webRequire.resolve('maplibre-gl'));
const { createExpression, validateStyleMin, featureFilter } = mapRequire('@maplibre/maplibre-gl-style-spec');

function evaluate(expression: unknown, properties: Record<string, unknown>, zoom = 16) {
  const compiled = createExpression(expression, { type: 'number' });
  assert.equal(compiled.result, 'success', JSON.stringify(compiled.value));
  return compiled.value.evaluateWithoutErrorHandling({ zoom }, { type: 'Polygon', properties });
}

test('3D building layer passes the installed MapLibre style validator', () => {
  const layer = buildingLayer('buildings');
  const errors = validateStyleMin({ version: 8, sources: { buildings: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [layer] });
  assert.deepEqual(errors.map((error: { message: string }) => error.message), []);
});

test('missing and invalid heights are not invented, and bases cannot exceed roofs', () => {
  for (const height of [undefined, null, -10, 'unknown', 0]) {
    const properties = height === undefined ? {} : { render_height: height };
    assert.equal(evaluate(buildingHeight, properties), 0);
  }
  assert.equal(evaluate(buildingHeight, { render_height: '12.5' }), 12.5);
  assert.equal(evaluate(buildingBase, { render_height: 12, render_min_height: 20 }), 12);
  assert.equal(evaluate(buildingBase, { render_height: 12, render_min_height: -5 }), 0);
  assert.equal(evaluate(buildingBase, { render_height: 12 }), 0);
  assert.equal(evaluate(buildingBase, { render_height: 12, render_min_height: 4 }), 4);
});

test('building outlines marked hide_3d and unknown-height features are excluded', () => {
  const { filter } = featureFilter(buildingLayer().filter);
  const included = (properties: Record<string, unknown>) => filter({ zoom: 16 }, { type: 'Polygon', properties });
  for (const hide of [true, 'true', 1, '1']) assert.equal(included({ render_height: 12, hide_3d: hide }), false);
  for (const hide of [false, 'false', 0, '0']) assert.equal(included({ render_height: 12, hide_3d: hide }), true);
  assert.equal(included({ render_height: 12 }), true);
  assert.equal(included({}), false);
  assert.equal(included({ render_height: -10 }), false);
});

test('zoom interpolation grows buildings without putting the base above the roof', () => {
  const paint = buildingLayer().paint!;
  const properties = { render_height: 20, render_min_height: 5 };
  assert.equal(evaluate(paint['fill-extrusion-height'], properties, 13), 0);
  assert.equal(evaluate(paint['fill-extrusion-height'], properties, 13.5), 10);
  assert.equal(evaluate(paint['fill-extrusion-base'], properties, 13.5), 2.5);
  assert.equal(evaluate(paint['fill-extrusion-height'], properties, 16), 20);
});
