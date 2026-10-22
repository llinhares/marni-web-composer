import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortedByStart,
  lowerBoundByStart,
  notesInWindow,
  audibleTracks,
  songEndTick,
  tickAtTime,
  timeAtTick,
  reanchor,
} from './scheduling.ts';
import type { Note, Track } from '../types/music.ts';

const note = (id: string, startTick: number, durationTicks = 240): Note => ({
  id,
  trackId: 't',
  pitch: 60,
  startTick,
  durationTicks,
  velocity: 90,
});

const track = (id: string, notes: Note[], extra: Partial<Track> = {}): Track => ({
  id,
  name: id,
  instrumentId: 'grand-piano',
  color: '#fff',
  volume: 75,
  pan: 0,
  isMuted: false,
  isSolo: false,
  auxSend: true,
  notes,
  ...extra,
});

test('sortedByStart sorts once and caches per notes array', () => {
  const notes = [note('c', 960), note('a', 0), note('b', 480)];
  const sorted = sortedByStart(notes);
  assert.deepEqual(sorted.map((n) => n.id), ['a', 'b', 'c']);
  assert.equal(sortedByStart(notes), sorted, 'Same array instance returns the cached result');
  assert.deepEqual(notes.map((n) => n.id), ['c', 'a', 'b'], 'Original array is not mutated');
});

test('notesInWindow returns exactly the notes starting in [from, to)', () => {
  const sorted = sortedByStart([0, 100, 100, 200, 300, 480].map((t, i) => note(`n${i}`, t)));
  assert.equal(lowerBoundByStart(sorted, 100), 1);
  assert.equal(lowerBoundByStart(sorted, 1000), 6);
  assert.deepEqual(notesInWindow(sorted, 100, 300).map((n) => n.startTick), [100, 100, 200]);
  assert.deepEqual(notesInWindow(sorted, 301, 480), []);
  assert.deepEqual(notesInWindow(sorted, 480, 481).map((n) => n.id), ['n5']);
});

test('consecutive scheduler windows play every note exactly once', () => {
  const notes = Array.from({ length: 500 }, (_, i) => note(`n${i}`, Math.floor(Math.random() * 20000)));
  const sorted = sortedByStart(notes);
  const seen: string[] = [];
  for (let from = 0; from < 21000; from += 37) seen.push(...notesInWindow(sorted, from, from + 37).map((n) => n.id));
  assert.equal(seen.length, 500);
  assert.equal(new Set(seen).size, 500);
});

test('audibleTracks applies mute and solo', () => {
  const a = track('a', []);
  const b = track('b', [], { isMuted: true });
  const c = track('c', [], { isSolo: true });
  assert.deepEqual(audibleTracks([a, b]).map((t) => t.id), ['a']);
  assert.deepEqual(audibleTracks([a, b, c]).map((t) => t.id), ['c']);
});

test('songEndTick finds the end of the last note', () => {
  assert.equal(songEndTick([track('a', [note('x', 0, 480)]), track('b', [note('y', 960, 100)])]), 1060);
  assert.equal(songEndTick([]), 0);
});

test('tempo re-anchoring keeps the playhead continuous', () => {
  const a = { audioTime: 10, tick: 0, bpm: 120 }; // 960 ticks per second
  assert.equal(tickAtTime(a, 11), 960);
  assert.equal(timeAtTick(a, 1920), 12);

  const b = reanchor(a, 11, 60); // halve the tempo after 1 s
  assert.equal(tickAtTime(b, 11), 960, 'No jump at the change point');
  assert.equal(tickAtTime(b, 12), 1440, 'Then advances at 480 ticks per second');
});
