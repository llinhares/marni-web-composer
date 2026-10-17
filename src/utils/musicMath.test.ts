import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pitchToNoteName,
  isBlackKey,
  pitchToFrequency,
  ticksToSeconds,
  secondsToTicks,
  formatTimecode,
  getGridSnapTicks,
  snapTickToGrid,
  isPitchInScale,
} from './musicMath.ts';

test('pitchToNoteName converts pitches accurately for sharps and flats', () => {
  assert.equal(pitchToNoteName(60, 'sharp'), 'C4');
  assert.equal(pitchToNoteName(61, 'sharp'), 'C#4');
  assert.equal(pitchToNoteName(61, 'flat'), 'Db4');
  assert.equal(pitchToNoteName(69, 'sharp'), 'A4');
  assert.equal(pitchToNoteName(108, 'sharp'), 'C8');
  assert.equal(pitchToNoteName(24, 'sharp'), 'C1');
});

test('isBlackKey identifies chromatic accidentals accurately', () => {
  assert.equal(isBlackKey(60), false); // C
  assert.equal(isBlackKey(61), true);  // C#
  assert.equal(isBlackKey(62), false); // D
  assert.equal(isBlackKey(63), true);  // D#
  assert.equal(isBlackKey(64), false); // E
  assert.equal(isBlackKey(65), false); // F
  assert.equal(isBlackKey(66), true);  // F#
});

test('pitchToFrequency calculates correct Hz values', () => {
  const a4 = pitchToFrequency(69);
  assert.ok(Math.abs(a4 - 440) < 0.001);
  const a5 = pitchToFrequency(81);
  assert.ok(Math.abs(a5 - 880) < 0.001);
});

test('ticks and seconds conversion roundtrips cleanly at 120 BPM', () => {
  const bpm = 120;
  // 1 beat = 480 ticks = 0.5s at 120 BPM
  assert.equal(ticksToSeconds(480, bpm), 0.5);
  assert.equal(secondsToTicks(0.5, bpm), 480);
});

test('formatTimecode outputs standard MM:SS.ms format', () => {
  assert.equal(formatTimecode(0), '00:00.0');
  assert.equal(formatTimecode(65.4), '01:05.4');
});

test('snapTickToGrid snaps to specified subdivisions', () => {
  // 1/4 note = 480 ticks
  assert.equal(getGridSnapTicks('1/4'), 480);
  assert.equal(snapTickToGrid(470, '1/4'), 480);
  assert.equal(snapTickToGrid(200, '1/4'), 0);
  // 1/16 note = 120 ticks
  assert.equal(snapTickToGrid(125, '1/16'), 120);
});

test('scale checking correctly classifies notes in major scale', () => {
  // C Major: C(0), D(2), E(4), F(5), G(7), A(9), B(11)
  assert.equal(isPitchInScale(60, 0, 'major'), true);  // C4
  assert.equal(isPitchInScale(61, 0, 'major'), false); // C#4
  assert.equal(isPitchInScale(62, 0, 'major'), true);  // D4
  assert.equal(isPitchInScale(64, 0, 'major'), true);  // E4
  assert.equal(isPitchInScale(65, 0, 'major'), true);  // F4
});
