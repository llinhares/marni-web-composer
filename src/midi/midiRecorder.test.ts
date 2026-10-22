import test from 'node:test';
import assert from 'node:assert/strict';
import { createMidiRecorder, recordedToNotes } from './midiRecorder.ts';

test('records held notes with their real durations and velocities', () => {
  const r = createMidiRecorder(0);
  r.noteOn(60, 100, 0);
  r.noteOn(64, 80, 240);
  assert.deepEqual(r.noteOff(60, 480), { pitch: 60, startTick: 0, endTick: 480, velocity: 100, sustain: false });
  r.noteOff(64, 960);
  const notes = r.finish(2000);
  assert.deepEqual(
    notes.map((n) => [n.pitch, n.startTick, n.endTick, n.velocity]),
    [
      [60, 0, 480, 100],
      [64, 240, 960, 80],
    ]
  );
});

test('notes played during the count-in start on the first beat; taps get a minimum length', () => {
  const r = createMidiRecorder(1920);
  r.noteOn(60, 90, 1800);
  r.noteOff(60, 1921);
  const [n] = r.finish(3000);
  assert.equal(n.startTick, 1920);
  assert.ok(n.endTick - n.startTick >= 15);
});

test('sustain pedal holds released notes until it is lifted and flags them', () => {
  const r = createMidiRecorder(0);
  r.sustainPedal(true, 0);
  r.noteOn(60, 100, 0);
  assert.equal(r.noteOff(60, 240), null, 'Released key keeps sounding under the pedal');
  const closed = r.sustainPedal(false, 960);
  assert.deepEqual(closed.map((n) => [n.pitch, n.endTick, n.sustain]), [[60, 960, true]]);
});

test('re-striking a key closes the previous note; stop closes notes still held', () => {
  const r = createMidiRecorder(0);
  r.noteOn(60, 100, 0);
  r.noteOn(60, 90, 480);
  const notes = r.finish(720);
  assert.deepEqual(notes.map((n) => [n.startTick, n.endTick]), [
    [0, 480],
    [480, 720],
  ]);
});

test('recordedToNotes builds project notes', () => {
  let i = 0;
  const notes = recordedToNotes(
    [{ pitch: 62, startTick: 10, endTick: 110, velocity: 70, sustain: true }],
    't1',
    () => `id${i++}`
  );
  assert.deepEqual(notes, [{ id: 'id0', trackId: 't1', pitch: 62, startTick: 10, durationTicks: 100, velocity: 70, sustain: true }]);
});
