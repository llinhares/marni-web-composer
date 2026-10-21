import { test } from 'node:test';
import assert from 'node:assert';
import { mergeImportedTracks } from './trackImport.ts';
import type { Track } from '../types/music.ts';

const createTrack = (id: string, name: string, noteCount: number = 0): Track => ({
  id,
  name,
  instrumentId: 'grand-piano',
  color: '#d4a373',
  volume: 75,
  pan: 0,
  isMuted: false,
  isSolo: false,
  auxSend: true,
  notes: Array.from({ length: noteCount }, (_, i) => ({
    id: `note-${id}-${i}`,
    trackId: id,
    pitch: 60 + i,
    startTick: i * 480,
    durationTicks: 480,
    velocity: 90,
  })),
});

test('mergeImportedTracks replaces project when mode is "replace"', () => {
  const currentTracks = [createTrack('track-1', 'Existing Guitar', 3)];
  const importedTracks = [createTrack('track-midi-1', 'Imported Flute', 5)];

  const result = mergeImportedTracks(currentTracks, importedTracks, 'replace');

  assert.strictEqual(result.isAppended, false);
  assert.strictEqual(result.tracks.length, 1);
  assert.strictEqual(result.tracks[0].id, 'track-midi-1');
  assert.strictEqual(result.activeTrackId, 'track-midi-1');
  assert.strictEqual(result.tracks[0].notes.length, 5);
});

test('mergeImportedTracks appends tracks when mode is "append" and project has notes', () => {
  const currentTracks = [
    createTrack('track-1', 'Track 1', 2),
    createTrack('track-2', 'Track 2', 4),
  ];
  const importedTracks = [
    createTrack('imp-1', 'Imported Bass', 3),
  ];

  const result = mergeImportedTracks(currentTracks, importedTracks, 'append');

  assert.strictEqual(result.isAppended, true);
  assert.strictEqual(result.tracks.length, 3);
  // First two tracks are untouched
  assert.strictEqual(result.tracks[0].id, 'track-1');
  assert.strictEqual(result.tracks[1].id, 'track-2');

  // Third track is appended with new unique ID
  const appendedTrack = result.tracks[2];
  assert.notStrictEqual(appendedTrack.id, 'imp-1');
  assert.match(appendedTrack.id, /^track-imp-/);
  assert.strictEqual(appendedTrack.name, 'Imported Bass');
  assert.strictEqual(appendedTrack.notes.length, 3);

  // Appended track's notes must have remapped IDs pointing to the new track ID
  for (const note of appendedTrack.notes) {
    assert.match(note.id, /^note-imp-/);
    assert.strictEqual(note.trackId, appendedTrack.id);
  }

  // Active track is switched to the new track
  assert.strictEqual(result.activeTrackId, appendedTrack.id);
});

test('mergeImportedTracks replaces empty placeholder canvas even if mode is "append"', () => {
  const emptyCanvas = [createTrack('track-piano', 'Grand Piano', 0)];
  const importedTracks = [createTrack('track-imported', 'Imported Violin', 8)];

  const result = mergeImportedTracks(emptyCanvas, importedTracks, 'append');

  assert.strictEqual(result.isAppended, false);
  assert.strictEqual(result.tracks.length, 1);
  assert.strictEqual(result.tracks[0].id, 'track-imported');
  assert.strictEqual(result.activeTrackId, 'track-imported');
  assert.strictEqual(result.tracks[0].notes.length, 8);
});

test('mergeImportedTracks handles empty importedTracks safely', () => {
  const currentTracks = [createTrack('track-1', 'Piano', 2)];
  const result = mergeImportedTracks(currentTracks, [], 'append');

  assert.strictEqual(result.isAppended, false);
  assert.strictEqual(result.tracks.length, 1);
  assert.strictEqual(result.activeTrackId, 'track-1');
});
