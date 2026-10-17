import { test } from 'node:test';
import assert from 'node:assert';
import {
  noteNameToPitch,
  parseAiTranscription,
} from './aiSheetScanner.ts';

test('noteNameToPitch correctly maps standard notes and accidentals to MIDI numbers', () => {
  assert.strictEqual(noteNameToPitch('C4'), 60);
  assert.strictEqual(noteNameToPitch('C#4'), 61);
  assert.strictEqual(noteNameToPitch('Db4'), 61);
  assert.strictEqual(noteNameToPitch('D4'), 62);
  assert.strictEqual(noteNameToPitch('D#4'), 63);
  assert.strictEqual(noteNameToPitch('Eb4'), 63);
  assert.strictEqual(noteNameToPitch('E4'), 64);
  assert.strictEqual(noteNameToPitch('F4'), 65);
  assert.strictEqual(noteNameToPitch('F#4'), 66);
  assert.strictEqual(noteNameToPitch('G4'), 67);
  assert.strictEqual(noteNameToPitch('G#4'), 68);
  assert.strictEqual(noteNameToPitch('Ab4'), 68);
  assert.strictEqual(noteNameToPitch('A4'), 69);
  assert.strictEqual(noteNameToPitch('Bb4'), 70);
  assert.strictEqual(noteNameToPitch('B4'), 71);
  assert.strictEqual(noteNameToPitch('C5'), 72);
  assert.strictEqual(noteNameToPitch('G3'), 55);

  // Clamp limits
  assert.strictEqual(noteNameToPitch('C0'), 35); // Below MIN_PITCH 35
  assert.strictEqual(noteNameToPitch('C9'), 108); // Above MAX_PITCH 108
});

test('parseAiTranscription extracts notes, BPM, measures, and chords accurately', () => {
  const mockAiOutput = {
    title: 'Pegasus Fantasy',
    bpm: 140,
    timeSignature: '4/4',
    keySignature: 'C minor (3 flats)',
    chords: [
      { measure: 9, chord: 'Cm' },
      { measure: 11, chord: 'Gm' },
    ],
    notes: [
      {
        pitch: 55,
        noteName: 'G3',
        measure: 9,
        beat: 1.5,
        startTick: 15600,
        durationTicks: 240,
        velocity: 95,
      },
      {
        noteName: 'C4', // Test noteName conversion without explicit pitch
        measure: 9,
        beat: 2,
        startTick: 15840,
        durationTicks: 240,
        velocity: 95,
      },
      {
        noteName: 'Eb4', // Test flat accidental in key signature
        startTick: 16080,
        durationTicks: 480,
      },
    ],
  };

  const parsed = parseAiTranscription(mockAiOutput, 'track-target-1');

  assert.strictEqual(parsed.title, 'Pegasus Fantasy');
  assert.strictEqual(parsed.bpm, 140);
  assert.strictEqual(parsed.timeSignature, '4/4');
  assert.strictEqual(parsed.notes.length, 3);

  // First note
  assert.strictEqual(parsed.notes[0].pitch, 55);
  assert.strictEqual(parsed.notes[0].startTick, 15600);
  assert.strictEqual(parsed.notes[0].durationTicks, 240);
  assert.strictEqual(parsed.notes[0].trackId, 'track-target-1');

  // Second note C4 = 60
  assert.strictEqual(parsed.notes[1].pitch, 60);
  assert.strictEqual(parsed.notes[1].startTick, 15840);

  // Third note Eb4 = 63
  assert.strictEqual(parsed.notes[2].pitch, 63);
  assert.strictEqual(parsed.notes[2].startTick, 16080);
  assert.strictEqual(parsed.notes[2].durationTicks, 480);

  // Stats
  assert.strictEqual(parsed.stats.totalNotes, 3);
  assert.strictEqual(parsed.chords.length, 2);
  assert.strictEqual(parsed.chords[0].chord, 'Cm');
});

test('parseAiTranscription parses compact note tuples and separates right and left hands', () => {
  const mockCompactOutput = {
    title: 'Pegasus Fantasy (Piano Solo)',
    bpm: 164,
    timeSignature: '4/4',
    keySignature: 'C minor',
    notes: [
      [72, 0, 480, 95, 'right'], // C5 Right hand
      [48, 0, 960, 90, 'left'],  // C3 Left hand
      [75, 480, 240, 92, 'right'], // Eb5 Right hand
      [55, 480, 480, 88, 'left'],  // G3 Left hand
    ],
  };

  const parsed = parseAiTranscription(mockCompactOutput, 'track-target-piano');

  assert.strictEqual(parsed.title, 'Pegasus Fantasy (Piano Solo)');
  assert.strictEqual(parsed.bpm, 164);
  assert.strictEqual(parsed.notes.length, 4);
  assert.strictEqual(parsed.rightHandNotes.length, 2);
  assert.strictEqual(parsed.leftHandNotes.length, 2);
  assert.strictEqual(parsed.stats.rightHandCount, 2);
  assert.strictEqual(parsed.stats.leftHandCount, 2);

  // Check right hand notes
  assert.strictEqual(parsed.rightHandNotes[0].pitch, 72);
  assert.strictEqual(parsed.rightHandNotes[1].pitch, 75);

  // Check left hand notes
  assert.strictEqual(parsed.leftHandNotes[0].pitch, 48);
  assert.strictEqual(parsed.leftHandNotes[1].pitch, 55);
});

test('parseAiTranscription parses measure-beat tuples correctly', () => {
  const mockMeasureOutput = {
    title: 'Pegasus Fantasy (Measure-Beat)',
    bpm: 164,
    timeSignature: '4/4',
    keySignature: 'C minor',
    notes: [
      [72, 1, 1.0, 1.0, 'right'], // C5: Compasso 1, tempo 1, duração 1 tempo (480 ticks) -> startTick 0
      [48, 1, 1.0, 2.0, 'left'],  // C3: Compasso 1, tempo 1, duração 2 tempos (960 ticks) -> startTick 0
      [75, 1, 2.0, 0.5, 'right'], // Eb5: Compasso 1, tempo 2, duração 0.5 tempos (240 ticks) -> startTick 480
      [74, 1, 2.5, 0.5, 'right'], // D5: Compasso 1, tempo 2.5 -> startTick 720
      [55, 2, 1.0, 1.0, 'left'],  // G3: Compasso 2, tempo 1 -> startTick 1920
    ],
  };

  const parsed = parseAiTranscription(mockMeasureOutput, 'track-test');
  assert.strictEqual(parsed.notes.length, 5);
  // Note with pitch 48 comes first at startTick 0
  assert.strictEqual(parsed.notes[0].pitch, 48);
  assert.strictEqual(parsed.notes[0].startTick, 0);
  assert.strictEqual(parsed.notes[0].durationTicks, 960);

  // Note with pitch 72 comes second at startTick 0
  assert.strictEqual(parsed.notes[1].pitch, 72);
  assert.strictEqual(parsed.notes[1].startTick, 0);
  assert.strictEqual(parsed.notes[1].durationTicks, 480);

  // Note with pitch 75 at startTick 480
  assert.strictEqual(parsed.notes[2].pitch, 75);
  assert.strictEqual(parsed.notes[2].startTick, 480);
  assert.strictEqual(parsed.notes[2].durationTicks, 240);

  assert.strictEqual(parsed.notes[3].startTick, 720);
  assert.strictEqual(parsed.notes[4].startTick, 1920);
});

test('parseAiTranscription compacts excessive hallucinated gaps down to 1 measure', () => {
  const mockWithGiganticGap = {
    title: 'Score With Gap',
    bpm: 120,
    timeSignature: '4/4',
    notes: [
      [60, 1, 1.0, 1.0, 'right'], // Compasso 1 -> startTick 0, ends 480
      [64, 40, 1.0, 1.0, 'right'], // Hallucinated Compasso 40 (tick 74880)!
    ],
  };

  const parsed = parseAiTranscription(mockWithGiganticGap, 'track-test');
  assert.strictEqual(parsed.notes.length, 2);
  assert.strictEqual(parsed.notes[0].startTick, 0);
  // Instead of starting at tick 74880 (~40 measures gap), note 2 should be compacted
  // down to 1 measure after note 1 (startTick = 480 + 1920 = 2400)
  assert.strictEqual(parsed.notes[1].startTick, 2400);
});

test('parseAiTranscription aligns append offset cleanly without double-offset gap', () => {
  const mockPage2 = {
    title: 'Page 2 Notes',
    bpm: 120,
    timeSignature: '4/4',
    notes: [
      [67, 15, 1.0, 1.0, 'right'], // Page 2 starts at measure 15 (tick 26880)
      [69, 15, 2.0, 1.0, 'right'],
    ],
  };

  // Suppose existing track notes ended at tick 26880 (14 measures)
  const existingEnd = 26880;
  const parsed = parseAiTranscription(mockPage2, 'track-test', { startTickOffset: existingEnd });

  assert.strictEqual(parsed.notes[0].startTick, 26880);
  assert.strictEqual(parsed.notes[1].startTick, 26880 + 480);
});

test('parseAiTranscription throws descriptive error on empty or invalid payload', () => {
  assert.throws(() => {
    parseAiTranscription(null, 't1');
  }, /Formato de resposta da IA inválido/);

  assert.throws(() => {
    parseAiTranscription({ notes: [] }, 't1');
  }, /Nenhuma nota musical foi detectada/);
});
