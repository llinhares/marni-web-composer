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

  const decoded = parseBdoBinaryFile(arrayBuffer, 'Sustain_Test.bms');
  assert.strictEqual(decoded.title, 'Sustain_Test');
  assert.strictEqual(decoded.composer, 'MarniTester');
  assert.strictEqual(decoded.arranger, 'MarniTester');
  assert.strictEqual(decoded.author, 'MarniTester');
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
  assert.strictEqual(decoded.tracks[0].volume, 80);
});

test('exportToBdo and parseBdoBinaryFile round-trip effector settings and native volume', async () => {
  const notes: Note[] = [
    {
      id: 'n-1',
      trackId: 'tr-fx',
      pitch: 60, // C4
      startTick: 0,
      durationTicks: 480,
      velocity: 100,
    },
  ];

  const tracks: Track[] = [
    {
      id: 'tr-fx',
      name: 'Florchestra Violin',
      instrumentId: 'violin',
      color: '#e07a5f',
      volume: 95,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes,
    },
  ];

  const song = {
    bpm: 140,
    timeSignature: [4, 4] as [number, number],
    title: 'Effector_Song',
  };

  const options: ExportOptions = {
    charName: 'MarniEffector',
    ownerId: 999999,
    transpose: 0,
    velMode: 'off',
    velStepBase: 100,
    velStepStep: 5,
    velRescaleMin: 80,
    velRescaleMax: 127,
    velFloorVal: 100,
    instrumentOverrides: { 'tr-fx': 'Florchestra Violin' },
    velocityScales: { 'tr-fx': 100 },
    effector: {
      reverb: { enabled: true, damp: 50, mix: 45, time: 60 },
      delay: { enabled: true, time: 30, feedback: 30, mix: 35 },
      chorus: { enabled: true, feedback: 25, lfoDepth: 40, lfoFrequency: 35, mix: 50 },
    },
  };

  const blob = exportToBdo(tracks, song, options);
  const arrayBuffer = await blob.arrayBuffer();

  const decoded = parseBdoBinaryFile(arrayBuffer, 'Effector_Song');
  assert.strictEqual(decoded.tracks[0].volume, 95);
  assert.strictEqual(decoded.effectorSettings?.reverb.enabled, true);
  assert.strictEqual(decoded.effectorSettings?.reverb.mix, 45);
  assert.strictEqual(decoded.effectorSettings?.reverb.time, 60);
  assert.strictEqual(decoded.effectorSettings?.delay.enabled, true);
  assert.strictEqual(decoded.effectorSettings?.delay.mix, 35);
  assert.strictEqual(decoded.effectorSettings?.chorus.enabled, true);
  assert.strictEqual(decoded.effectorSettings?.chorus.mix, 50);
});

test('parseBdoBinaryFile unifies multiple chunks of the same instrument into a single track without duplication', async () => {
  // Create 800 notes in a single track (which forces chunking into 2 chunks of 730 + 70)
  const notes: Note[] = Array.from({ length: 800 }, (_, i) => ({
    id: `n-${i}`,
    trackId: 'tr-piano',
    pitch: 60 + (i % 24),
    startTick: i * 60,
    durationTicks: 40,
    velocity: 80,
  }));

  const tracks: Track[] = [
    {
      id: 'tr-piano',
      name: 'Florchestra Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 90,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes,
    },
  ];

  const song = {
    bpm: 120,
    timeSignature: [4, 4] as [number, number],
    title: 'Multi_Chunk_Song',
  };

  const options: ExportOptions = {
    charName: 'ChunkTester',
    ownerId: 1009649,
    transpose: 0,
    velMode: 'off',
    velStepBase: 100,
    velStepStep: 5,
    velRescaleMin: 80,
    velRescaleMax: 127,
    velFloorVal: 100,
    instrumentOverrides: { 'tr-piano': 'Florchestra Piano' },
    velocityScales: { 'tr-piano': 100 },
    effector: {
      reverb: { enabled: false, damp: 50, mix: 30, time: 20 },
      delay: { enabled: false, time: 20, feedback: 20, mix: 25 },
      chorus: { enabled: false, feedback: 20, lfoDepth: 30, lfoFrequency: 20, mix: 20 },
    },
    maxChunkNotes: 730,
  };

  const blob = exportToBdo(tracks, song, options);
  const arrayBuffer = await blob.arrayBuffer();

  const decoded = parseBdoBinaryFile(arrayBuffer, 'Multi_Chunk_Song');
  // Must be exactly 1 track with all 800 notes, NOT 2 separate duplicate piano tracks!
  assert.strictEqual(decoded.tracks.length, 1);
  assert.strictEqual(decoded.tracks[0].name, 'Florchestra Piano');
  assert.strictEqual(decoded.tracks[0].notes.length, 800);
});

test('parseBdoBinaryFile sets isProtected flag and protects original composer, arranger, and ownerId against plagiarism', async () => {
  const notes: Note[] = [
    {
      id: 'n-lock',
      trackId: 'tr-lock',
      pitch: 60,
      startTick: 0,
      durationTicks: 480,
      velocity: 100,
    },
  ];

  const tracks: Track[] = [
    {
      id: 'tr-lock',
      name: 'Florchestra Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 80,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes,
    },
  ];

  const originalOwnerId = 9876543;
  const originalCreator = 'OriginalMasterComposer';

  const blob = exportToBdo(
    tracks,
    { bpm: 130, timeSignature: [4, 4], title: 'Masterpiece' },
    {
      charName: originalCreator,
      ownerId: originalOwnerId,
      transpose: 0,
      velMode: 'off',
      velStepBase: 100,
      velStepStep: 5,
      velRescaleMin: 80,
      velRescaleMax: 127,
      velFloorVal: 100,
      instrumentOverrides: { 'tr-lock': 'Florchestra Piano' },
      velocityScales: { 'tr-lock': 100 },
      effector: {
        reverb: { enabled: false, damp: 50, mix: 30, time: 20 },
        delay: { enabled: false, time: 20, feedback: 20, mix: 25 },
        chorus: { enabled: false, feedback: 20, lfoDepth: 30, lfoFrequency: 20, mix: 20 },
      },
    }
  );

  const arrayBuffer = await blob.arrayBuffer();
  const decoded = parseBdoBinaryFile(arrayBuffer, 'Masterpiece');

  // Must have protection flag enabled
  assert.strictEqual(decoded.isProtected, true);
  // Must preserve exact author, composer, arranger, and owner ID
  assert.strictEqual(decoded.author, originalCreator);
  assert.strictEqual(decoded.composer, originalCreator);
  assert.strictEqual(decoded.arranger, originalCreator);
  assert.strictEqual(decoded.ownerId, originalOwnerId);
});

