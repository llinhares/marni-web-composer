import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateForBdo,
  applyBdoFix,
  foldIntoRange,
  quartersPerBar,
  timeSignatureParts,
} from './bdoValidation.ts';
import type { InstrumentId, Note, Track } from '../types/music.ts';

let seq = 0;
const n = (pitch: number, startTick: number, durationTicks = 480): Note => ({
  id: `n${seq++}`,
  trackId: '',
  pitch,
  startTick,
  durationTicks,
  velocity: 90,
});
const t = (id: string, instrumentId: InstrumentId, notes: Note[], extra: Partial<Track> = {}): Track => ({
  id,
  name: id,
  instrumentId,
  color: '#fff',
  volume: 75,
  pan: 0,
  isMuted: false,
  isSolo: false,
  auxSend: true,
  notes,
  ...extra,
});
const ids = (r: ReturnType<typeof validateForBdo>) => r.issues.map((i) => i.id);

test('a clean song has no issues and the lowest fitting rank', () => {
  const r = validateForBdo([t('p', 'grand-piano', [n(60, 0), n(64, 480)])], { grade: 'S', timeSignature: '4/4' });
  assert.deepEqual(r.issues, []);
  assert.equal(r.exportedNotes, 2);
  assert.equal(r.bars, 1);
  assert.equal(r.minGrade, 'F');
  assert.ok(r.canExport);
});

test('rank limits: too many notes is an error with a fix to the smallest rank that fits', () => {
  const notes = Array.from({ length: 600 }, (_, i) => n(60 + (i % 12), i * 30, 30)); // 600 notes, ~10 bars
  const r = validateForBdo([t('p', 'grand-piano', notes)], { grade: 'F', timeSignature: '4/4' });
  const issue = r.issues.find((i) => i.id === 'grade-notes');
  assert.equal(issue?.severity, 'error');
  assert.equal(issue?.fix?.grade, 'D');
  assert.equal(r.canExport, false);
});

test('bar count follows the time signature', () => {
  assert.equal(quartersPerBar('3/4'), 3);
  assert.equal(quartersPerBar('6/8'), 3);
  const song = [t('p', 'grand-piano', [n(60, 0, 480 * 3 * 51)])]; // exactly 51 bars of 3/4
  const r = validateForBdo(song, { grade: 'F', timeSignature: '3/4' });
  assert.equal(r.bars, 51);
  assert.ok(ids(r).includes('grade-bars'), 'Rank F allows 50 bars');
  assert.deepEqual(timeSignatureParts('6/8'), [6, 8]);
});

test('notes outside C0–B8 are reported and folded by octaves', () => {
  const song = [t('p', 'grand-piano', [n(5, 0), n(125, 0), n(60, 0)])];
  const r = validateForBdo(song, { grade: 'S', timeSignature: '4/4' });
  assert.equal(r.issues.find((i) => i.id === 'bdo-range')?.count, 2);
  const fixed = applyBdoFix(song, 'fold-bdo-range');
  assert.deepEqual(fixed[0].notes.map((x) => x.pitch), [17, 113, 60]);
  assert.ok(!ids(validateForBdo(fixed, { grade: 'S', timeSignature: '4/4' })).includes('bdo-range'));
});

test('keys the game instrument does not have are reported and folded by octaves', () => {
  const song = [t('f', 'flute', [n(40, 0), n(72, 480)])]; // Florchestra flute: C3–E6 in the game
  const r = validateForBdo(song, { grade: 'S', timeSignature: '4/4' });
  assert.equal(r.issues.find((i) => i.id === 'instrument-range')?.severity, 'warning');
  assert.ok(r.canExport);
  assert.equal(applyBdoFix(song, 'fold-instrument-range')[0].notes[0].pitch, 52);
});

test('percussion: GM pitches are converted, unknown pitches are flagged (they would become kick or crash)', () => {
  const song = [t('d', 'percussion', [n(38, 0), n(42, 0), n(50, 480), n(100, 960)])];
  const r = validateForBdo(song, { grade: 'S', timeSignature: '4/4' });
  assert.equal(r.issues.find((i) => i.id === 'drums-gm')?.count, 2);
  assert.equal(r.issues.find((i) => i.id === 'drums-unknown')?.count, 1);
  const fixed = applyBdoFix(song, 'map-drums');
  assert.deepEqual(fixed[0].notes.map((x) => x.pitch), [50, 54, 50, 61]);
  assert.ok(!ids(validateForBdo(fixed, { grade: 'S', timeSignature: '4/4' })).includes('drums-gm'));
});

test('duplicates across tracks sharing an in-game instrument keep the longest note', () => {
  const short = n(60, 0, 240);
  const long = n(60, 0, 960);
  const song = [t('a', 'grand-piano', [short, n(62, 0)]), t('b', 'grand-piano', [long])];
  const r = validateForBdo(song, { grade: 'S', timeSignature: '4/4' });
  assert.equal(r.issues.find((i) => i.id === 'duplicates')?.count, 1);
  assert.equal(r.exportedNotes, 2);
  assert.ok(ids(r).some((id) => id.startsWith('merge-')), 'Tracks merged into the same instrument are reported');

  const fixed = applyBdoFix(song, 'remove-duplicates');
  assert.deepEqual(fixed[0].notes.map((x) => x.pitch), [62]);
  assert.equal(fixed[1].notes[0], long);
});

test('muted tracks are excluded from the count and reported; an all-muted song cannot be exported', () => {
  const song = [t('a', 'grand-piano', [n(60, 0)], { isMuted: true })];
  const r = validateForBdo(song, { grade: 'S', timeSignature: '4/4' });
  assert.ok(ids(r).includes('muted'));
  assert.ok(ids(r).includes('empty'));
  assert.equal(r.canExport, false);
});

test('foldIntoRange keeps the pitch class', () => {
  assert.equal(foldIntoRange(30, 60, 96), 66);
  assert.equal(foldIntoRange(100, 60, 96), 88);
  assert.equal(foldIntoRange(70, 60, 96), 70);
});

test('applyBdoFix keeps untouched tracks by identity', () => {
  const song = [t('a', 'grand-piano', [n(60, 0)]), t('b', 'grand-piano', [n(130, 0)])];
  const fixed = applyBdoFix(song, 'fold-bdo-range');
  assert.equal(fixed[0], song[0]);
  assert.notEqual(fixed[1], song[1]);
});

test('missing owner ID or author name is a warning, never filled with someone else\'s', () => {
  const song = [t('p', 'grand-piano', [n(60, 0)])];
  const missing = validateForBdo(song, { grade: 'S', timeSignature: '4/4', ownerId: 0, author: '  ' });
  assert.deepEqual(
    missing.issues.filter((i) => i.id === 'owner-id' || i.id === 'author').map((i) => i.severity),
    ['warning', 'warning']
  );
  assert.ok(missing.canExport, 'Still exportable: the user decides');
  const ok = validateForBdo(song, { grade: 'S', timeSignature: '4/4', ownerId: 1234, author: 'Aria' });
  assert.deepEqual(ok.issues, []);
});

test('time signatures the game lacks are reported and exported as the closest game one', () => {
  const song = [t('a', 'grand-piano', [n(60, 0)])];
  assert.ok(ids(validateForBdo(song, { grade: 'S', timeSignature: '2/4' })).includes('time-signature'));
  assert.ok(!ids(validateForBdo(song, { grade: 'S', timeSignature: '6/8' })).includes('time-signature'));
  assert.deepEqual(timeSignatureParts('2/4'), [4, 4]);
  assert.deepEqual(timeSignatureParts('12/8'), [6, 8]);
});
