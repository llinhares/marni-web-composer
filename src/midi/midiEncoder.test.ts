import test from 'node:test';
import assert from 'node:assert/strict';
import { writeVarLength, createStandardMidiFile } from './midiEncoder.ts';
import type { Track } from '../types/music.ts';

test('writeVarLength encodes small and multi-byte values correctly', () => {
  // 0 -> [0]
  assert.deepEqual(writeVarLength(0), [0x00]);
  // 127 -> [0x7f]
  assert.deepEqual(writeVarLength(127), [0x7f]);
  // 128 -> [0x81, 0x00]
  assert.deepEqual(writeVarLength(128), [0x81, 0x00]);
  // 480 (0x1E0) -> [0x83, 0x60]
  assert.deepEqual(writeVarLength(480), [0x83, 0x60]);
});

test('createStandardMidiFile produces valid SMF Format 1 header and chunks', () => {
  const mockTracks: Track[] = [
    {
      id: 'track-1',
      name: 'Grand Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 75,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes: [
        { id: 'n1', trackId: 'track-1', pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 },
        { id: 'n2', trackId: 'track-1', pitch: 64, startTick: 480, durationTicks: 480, velocity: 90 },
      ],
    },
  ];

  const midiBytes = createStandardMidiFile(mockTracks, 120, 480);
  assert.ok(midiBytes instanceof Uint8Array);
  assert.ok(midiBytes.length > 30);

  // Check 'MThd' header
  const headerStr = String.fromCharCode(midiBytes[0], midiBytes[1], midiBytes[2], midiBytes[3]);
  assert.equal(headerStr, 'MThd');

  // Format 1 check
  assert.equal(midiBytes[9], 1);
  // Number of tracks (1 tempo track + 1 user track = 2)
  assert.equal(midiBytes[11], 2);
});
