import { test } from 'node:test';
import assert from 'node:assert';
import { isBdoBinaryContent, parseBdoBinaryFile } from './bdoDecoder.ts';
import { exportToBdo, type ExportOptions } from './bdoExportV2.ts';
import type { Track, Note } from '../types/music.ts';

test('isBdoBinaryContent correctly identifies BDO binary file header', () => {
  const validHeader = new Uint8Array(0x150);
  validHeader[0] = 0x09;
  validHeader[1] = 0x00;
  validHeader[2] = 0x00;
  validHeader[3] = 0x00;
  assert.strictEqual(isBdoBinaryContent(validHeader), true);

  const invalidHeader = new Uint8Array(0x150);
  invalidHeader[0] = 0x01;
  assert.strictEqual(isBdoBinaryContent(invalidHeader), false);

  const shortBuf = new Uint8Array(10);
  assert.strictEqual(isBdoBinaryContent(shortBuf), false);
});

test('exportToBdo and parseBdoBinaryFile preserve sustain pedal and C0-B8 note range', async () => {
  const notes: Note[] = [
    {
      id: 'n-c0',
      trackId: 'tr-1',
      pitch: 12, // C0
      startTick: 0,
      durationTicks: 480,
      velocity: 100,
      sustain: true, // Sustain pedal active!
    },
    {
      id: 'n-a5',
      trackId: 'tr-1',
      pitch: 81, // A5
      startTick: 480,
      durationTicks: 480,
      velocity: 90,
      sustain: true, // Sustain pedal active!
    },
    {
      id: 'n-b8',
      trackId: 'tr-1',
      pitch: 119, // B8
      startTick: 960,
      durationTicks: 480,
      velocity: 80,
      sustain: false, // Normal note
    },
  ];

  const tracks: Track[] = [
    {
      id: 'tr-1',
      name: 'Florchestra Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 80,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      sustainPedal: true,
      notes,
    },
  ];

  const song = {
    bpm: 120,
    timeSignature: [4, 4] as [number, number],
    title: 'Sustain_Test',
  };

  const options: ExportOptions = {
    charName: 'MarniTester',
    ownerId: 1009649,
    transpose: 0,
    velMode: 'off',
    velStepBase: 100,
    velStepStep: 5,
    velRescaleMin: 80,
    velRescaleMax: 127,
    velFloorVal: 100,
    instrumentOverrides: { 'tr-1': 'Florchestra Piano' },
    velocityScales: { 'tr-1': 100 },
    effector: {
      reverb: { enabled: false, damp: 50, mix: 30, time: 20 },
      delay: { enabled: false, time: 20, feedback: 20, mix: 25 },
      chorus: { enabled: false, feedback: 20, lfoDepth: 30, lfoFrequency: 20, mix: 20 },
    },
  };

  const blob = exportToBdo(tracks, song, options);
  const arrayBuffer = await blob.arrayBuffer();

  assert.strictEqual(isBdoBinaryContent(arrayBuffer), true);

  const decoded = parseBdoBinaryFile(arrayBuffer);
  assert.strictEqual(decoded.title, 'Sustain_Test');
  assert.strictEqual(decoded.bpm, 120);
  assert.strictEqual(decoded.tracks.length, 1);

  const decodedNotes = decoded.tracks[0].notes;
  assert.strictEqual(decodedNotes.length, 3);

  // Note 0: C0 with sustain pedal!
  assert.strictEqual(decodedNotes[0].pitch, 12);
  assert.strictEqual(decodedNotes[0].sustain, true);

  // Note 1: A5 with sustain pedal!
  assert.strictEqual(decodedNotes[1].pitch, 81);
  assert.strictEqual(decodedNotes[1].sustain, true);

  // Note 2: B8 without sustain pedal!
  assert.strictEqual(decodedNotes[2].pitch, 119);
  assert.strictEqual(decodedNotes[2].sustain, false);
});
