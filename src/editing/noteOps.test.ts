import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyNotes,
  pasteNotes,
  moveNotes,
  quantizeNotes,
  swungGridTick,
  humanizeNotes,
  barRangeOf,
} from './noteOps.ts';
import type { Note } from '../types/music.ts';

const n = (id: string, pitch: number, startTick: number, durationTicks = 240, velocity = 90): Note => ({
  id,
  trackId: 't',
  pitch,
  startTick,
  durationTicks,
  velocity,
});

test('copy keeps relative timing and paste places it at the target with new ids', () => {
  const clip = copyNotes([n('a', 60, 960), n('b', 64, 1200, 480)])!;
  assert.equal(clip.spanTicks, 720);
  let i = 0;
  const pasted = pasteNotes(clip, 1920, 'other', () => `p${i++}`);
  assert.deepEqual(
    pasted.map((x) => [x.id, x.trackId, x.pitch, x.startTick, x.selected]),
    [
      ['p0', 'other', 60, 1920, true],
      ['p1', 'other', 64, 2160, true],
    ]
  );
  assert.equal(copyNotes([]), null);
});

test('moveNotes shifts only the selection and clamps the group at the edges', () => {
  const notes = [n('a', 60, 100), n('b', 118, 500), n('c', 50, 0)];
  const moved = moveNotes(notes, new Set(['a', 'b']), -480, 5);
  assert.deepEqual(moved.map((x) => [x.startTick, x.pitch]), [
    [0, 61],
    [400, 119],
    [0, 50],
  ]);
  assert.equal(moved[2], notes[2], 'Unselected notes keep their identity');
});

test('quantize snaps to the grid with strength', () => {
  const notes = [n('a', 60, 130), n('b', 62, 470)];
  const ids = new Set(['a', 'b']);
  assert.deepEqual(quantizeNotes(notes, ids, { gridTicks: 120 }).map((x) => x.startTick), [120, 480]);
  assert.deepEqual(quantizeNotes(notes, ids, { gridTicks: 120, strength: 0.5 }).map((x) => x.startTick), [125, 475]);
});

test('swing delays every second grid step', () => {
  assert.equal(swungGridTick(240, 240, 0), 240);
  assert.equal(swungGridTick(240, 240, 1), 320, 'Full swing = triplet feel');
  assert.equal(swungGridTick(480, 240, 1), 480, 'On-beat steps are not delayed');
});

test('quantizing ends keeps at least one grid step', () => {
  const [q] = quantizeNotes([n('a', 60, 10, 30)], new Set(['a']), { gridTicks: 120, quantizeEnds: true });
  assert.equal(q.startTick, 0);
  assert.equal(q.durationTicks, 120);
});

test('humanize jitters timing and velocity within bounds', () => {
  const values = [0, 1];
  let k = 0;
  const out = humanizeNotes([n('a', 60, 480, 240, 100)], new Set(['a']), {
    timingTicks: 10,
    velocity: 50,
    random: () => values[k++ % 2],
  });
  assert.equal(out[0].startTick, 470);
  assert.equal(out[0].velocity, 127, 'Velocity is clamped');
});

test('barRangeOf covers the notes with whole bars', () => {
  assert.deepEqual(barRangeOf([n('a', 60, 2000, 100), n('b', 60, 2100, 3000)], 1920), { start: 1920, end: 5760 });
  assert.equal(barRangeOf([], 1920), null);
});
