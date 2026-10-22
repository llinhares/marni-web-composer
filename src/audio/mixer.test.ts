import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMixer, peakToDb, dbToMeter, meterFall, mixerOf, DEFAULT_TRACK_MIXER } from './mixer.ts';
import type { Track } from '../types/music.ts';

test('sanitizeMixer clamps values and ignores garbage', () => {
  assert.equal(sanitizeMixer(null), undefined);
  assert.deepEqual(sanitizeMixer({ eqLow: 40, eqMid: 'x', compressor: true, compThreshold: -90, compRatio: 0 }), {
    eqLow: 12,
    eqMid: 0,
    eqHigh: 0,
    compressor: true,
    compThreshold: -60,
    compRatio: 1,
  });
});

test('mixerOf fills defaults for tracks without mixer settings', () => {
  assert.deepEqual(mixerOf({ mixer: { eqLow: 3 } } as unknown as Track), { ...DEFAULT_TRACK_MIXER, eqLow: 3 });
});

test('meter conversions', () => {
  assert.equal(peakToDb(1), 0);
  assert.ok(Math.abs(peakToDb(0.5) - -6.0206) < 1e-3);
  assert.equal(peakToDb(0), -120);
  assert.equal(dbToMeter(0), 1);
  assert.equal(dbToMeter(-30), 0.5);
  assert.equal(dbToMeter(-90), 0);
});

test('meter ballistics: instant rise, 20 dB/s fall', () => {
  assert.equal(meterFall(-30, -10, 0.1), -10);
  assert.equal(meterFall(-10, -60, 0.5), -20);
  assert.equal(meterFall(-10, -12, 1), -12);
});
