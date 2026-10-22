import test from 'node:test';
import assert from 'node:assert/strict';
import { placeTooltip, spotlightRect, TOUR_STEPS } from './tourLayout.ts';

const vp = { width: 1200, height: 800 };
const card = { width: 320, height: 180 };

test('tooltip goes below the target when it fits, centred and clamped horizontally', () => {
  const p = placeTooltip({ top: 10, left: 0, width: 40, height: 30 }, card, vp);
  assert.equal(p.placement, 'bottom');
  assert.equal(p.top, 52);
  assert.equal(p.left, 12, 'Clamped to the left margin');
});

test('tooltip goes above a target at the bottom of the screen', () => {
  const p = placeTooltip({ top: 740, left: 500, width: 200, height: 40 }, card, vp);
  assert.equal(p.placement, 'top');
  assert.equal(p.top, 740 - 12 - 180);
});

test('tall targets put the tooltip at the side; huge ones centre it', () => {
  const side = placeTooltip({ top: 0, left: 0, width: 250, height: 800 }, card, vp);
  assert.equal(side.placement, 'right');
  assert.equal(side.left, 262);
  const huge = placeTooltip({ top: 0, left: 0, width: 1200, height: 800 }, card, vp);
  assert.equal(huge.placement, 'center');
});

test('missing or hidden targets get a centred card', () => {
  assert.equal(placeTooltip(null, card, vp).placement, 'center');
  assert.equal(placeTooltip({ top: 0, left: 0, width: 0, height: 0 }, card, vp).placement, 'center');
});

test('spotlight pads the target and stays inside the viewport', () => {
  assert.deepEqual(spotlightRect({ top: 2, left: 100, width: 50, height: 20 }, vp), { top: 0, left: 94, width: 62, height: 28 });
});

test('every tour step has a title and text; the first one is centred', () => {
  assert.equal(TOUR_STEPS[0].target, undefined);
  for (const s of TOUR_STEPS) assert.ok(s.title && s.body.length > 20);
});
