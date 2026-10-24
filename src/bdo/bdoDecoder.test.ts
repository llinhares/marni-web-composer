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

  // Note 2: B8 is above the Florchestra piano (C0–B7 in the game): folded to B7, without pedal
  assert.strictEqual(decodedNotes[2].pitch, 107);
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
  assert.strictEqual(decoded.tracks[0].name, 'Florquestra · Piano');
  assert.strictEqual(decoded.tracks[0].bdoInstrument, 'florchestra-piano');
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

test('parseBdoBinaryFile prioritizes original composer over arranger and retains distinct credits', async () => {
  const notes: Note[] = [
    {
      id: 'n-distinct',
      trackId: 'tr-distinct',
      pitch: 64,
      startTick: 0,
      durationTicks: 480,
      velocity: 95,
    },
  ];

  const tracks: Track[] = [
    {
      id: 'tr-distinct',
      name: 'Florchestra Piano',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 85,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes,
    },
  ];

  const originalComposer = 'FamiliaStars';
  const playerArranger = 'Tchepper';
  const ownerId = 0xa3480;

  const blob = exportToBdo(
    tracks,
    { bpm: 120, timeSignature: [4, 4], title: 'Dupla' },
    {
      charName: originalComposer,
      composerName: originalComposer,
      arrangerName: playerArranger,
      ownerId,
      transpose: 0,
      velMode: 'off',
      velStepBase: 100,
      velStepStep: 5,
      velRescaleMin: 80,
      velRescaleMax: 127,
      velFloorVal: 100,
      instrumentOverrides: { 'tr-distinct': 'Florchestra Piano' },
      velocityScales: { 'tr-distinct': 100 },
      effector: {
        reverb: { enabled: false, damp: 50, mix: 30, time: 20 },
        delay: { enabled: false, time: 20, feedback: 20, mix: 25 },
        chorus: { enabled: false, feedback: 20, lfoDepth: 30, lfoFrequency: 20, mix: 20 },
      },
    }
  );

  const arrayBuffer = await blob.arrayBuffer();
  const decoded = parseBdoBinaryFile(arrayBuffer, 'musica para dupla');

  // The author MUST be the original composer (FamiliaStars), NOT the arranger (Tchepper)!
  assert.strictEqual(decoded.author, 'FamiliaStars');
  assert.strictEqual(decoded.composer, 'FamiliaStars');
  assert.strictEqual(decoded.arranger, 'Tchepper');
  assert.strictEqual(decoded.ownerId, 0xa3480);
});



test('exportToBdo writes the exact game instrument, Marnion sound, technique byte and kit keys', async () => {
  const mk = (id: string, extra: Partial<Track>, notes: Array<Partial<Note>>): Track => ({
    id,
    name: id,
    instrumentId: 'grand-piano',
    color: '#fff',
    volume: 100,
    pan: 0,
    isMuted: false,
    isSolo: false,
    auxSend: true,
    ...extra,
    notes: notes.map((n, i) => ({ id: `${id}-${i}`, trackId: id, pitch: 60, startTick: i * 480, durationTicks: 240, velocity: 100, ...n })),
  });
  const tracks: Track[] = [
    mk('beg', { bdoInstrument: 'beginner-piano' }, [{}]),
    mk('flor', { bdoInstrument: 'florchestra-piano', sustainPedal: false }, [{ sustain: true }, {}]),
    mk('kit', { bdoInstrument: 'florchestra-drum-set', instrumentId: 'percussion' }, [{ pitch: 42 }, { pitch: 64 }]),
    mk('marn', { bdoInstrument: 'marnion-sandwich', bdoSound: 2, instrumentId: 'marnisynth' }, [{ technique: 17 }, {}]),
    mk('bass', { bdoInstrument: 'marnibass', instrumentId: 'electric-bass' }, [{ technique: 13 }]),
  ];
  const blob = exportToBdo(tracks, { bpm: 120, timeSignature: [4, 4], title: 't' }, {
    charName: 'A',
    ownerId: 1,
    transpose: 0,
    velMode: 'off',
    velStepBase: 100,
    velStepStep: 5,
    velRescaleMin: 80,
    velRescaleMax: 127,
    velFloorVal: 100,
    instrumentOverrides: {},
    velocityScales: {},
    effector: {
      reverb: { enabled: false, damp: 0, mix: 0, time: 0 },
      delay: { enabled: false, time: 0, feedback: 0, mix: 0 },
      chorus: { enabled: false, feedback: 0, lfoDepth: 0, lfoFrequency: 0, mix: 0 },
    },
  });
  const song = parseBdoBinaryFile(await blob.arrayBuffer(), 't');
  const by = (key: string, sound = 0) => song.tracks.find((t) => t.bdoInstrument === key && (t.bdoSound ?? 0) === sound)!;

  // Instruments without techniques store 99 (beginner piano, drum kit), like the game
  assert.deepEqual(by('beginner-piano').notes.map((n) => n.technique), [99]);
  // Florchestra piano: 11 = pedal, 0 = plain note
  assert.deepEqual(by('florchestra-piano').notes.map((n) => n.technique), [11, 0]);
  // Drum kit: General MIDI closed hi-hat (42) becomes HihatC (54); SnrRollL (64) is kept
  assert.deepEqual(by('florchestra-drum-set').notes.map((n) => [n.pitch, n.technique]), [
    [54, 99],
    [64, 99],
  ]);
  // Marnion sound 3 is its own code; techniques are kept note by note
  assert.deepEqual(by('marnion-sandwich', 2).notes.map((n) => n.technique), [17, 0]);
  assert.deepEqual(by('marnibass').notes.map((n) => n.technique), [13]);
});

test('the game instrument song: every range and style decodes and exports back unchanged', async () => {
  // Built like the song made in the game: each instrument at its lowest and highest key, with its styles
  const { BDO_INSTRUMENT_DEFS } = await import('./bdoInstruments.ts');
  const tracks: Track[] = BDO_INSTRUMENT_DEFS.map((d) => ({
    id: d.key,
    name: d.name,
    instrumentId: d.family,
    bdoInstrument: d.key,
    color: '#fff',
    volume: 70,
    pan: 0,
    isMuted: false,
    isSolo: false,
    auxSend: false,
    notes: [d.minPitch, d.maxPitch, ...d.techniques.map(() => Math.round((d.minPitch + d.maxPitch) / 2))].map((pitch, i) => ({
      id: `${d.key}-${i}`,
      trackId: d.key,
      pitch,
      startTick: i * 480,
      durationTicks: 480,
      velocity: 100,
      technique: i >= 2 ? d.techniques[i - 2] : undefined,
    })),
  }));
  const blob = exportToBdo(tracks, { bpm: 120, timeSignature: [4, 4], title: 'instrumentos' }, {
    charName: 'A',
    ownerId: 1,
    transpose: 0,
    velMode: 'off',
    velStepBase: 100,
    velStepStep: 5,
    velRescaleMin: 80,
    velRescaleMax: 127,
    velFloorVal: 100,
    instrumentOverrides: {},
    velocityScales: {},
    effector: {
      reverb: { enabled: false, damp: 0, mix: 0, time: 0 },
      delay: { enabled: false, time: 0, feedback: 0, mix: 0 },
      chorus: { enabled: false, feedback: 0, lfoDepth: 0, lfoFrequency: 0, mix: 0 },
    },
  });
  const song = parseBdoBinaryFile(await blob.arrayBuffer(), 'instrumentos');
  for (const d of BDO_INSTRUMENT_DEFS) {
    const tr = song.tracks.find((t) => t.bdoInstrument === d.key)!;
    assert.ok(tr, d.key);
    const pitches = tr.notes.map((x) => x.pitch);
    assert.equal(Math.min(...pitches), d.minPitch, `${d.key} lowest key`);
    assert.equal(Math.max(...pitches), d.maxPitch, `${d.key} highest key`);
    const styles = new Set(tr.notes.map((x) => x.technique));
    if (d.techniques.length === 0) assert.deepEqual([...styles], [99], d.key);
    else for (const code of d.techniques) assert.ok(styles.has(code), `${d.key} style ${code}`);
  }
});
