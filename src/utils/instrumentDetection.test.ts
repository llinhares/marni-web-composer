import { test } from 'node:test';
import assert from 'node:assert';
import { detectBdoInstrument } from './instrumentDetection.ts';

test('detectBdoInstrument detects percussion via channel 9', () => {
  assert.strictEqual(detectBdoInstrument({ channel: 9 }), 'percussion');
});

test('detectBdoInstrument detects instrument from file name', () => {
  assert.strictEqual(detectBdoInstrument({ fileName: '01_Acoustic_Bass.mid' }), 'bass');
  assert.strictEqual(detectBdoInstrument({ fileName: 'guitar_melody.mid' }), 'guitar');
  assert.strictEqual(detectBdoInstrument({ fileName: 'violao_nylon.mid' }), 'guitar');
  assert.strictEqual(detectBdoInstrument({ fileName: 'flauta_solo.mid' }), 'flute');
  assert.strictEqual(detectBdoInstrument({ fileName: 'violino_lead.mid' }), 'violin');
  assert.strictEqual(detectBdoInstrument({ fileName: 'bateria_track.mid' }), 'percussion');
  assert.strictEqual(detectBdoInstrument({ fileName: 'cello_bassline.mid' }), 'cello');
  assert.strictEqual(detectBdoInstrument({ fileName: 'harpa_gliss.mid' }), 'harp');
  assert.strictEqual(detectBdoInstrument({ fileName: 'trompete_fanfare.mid' }), 'trumpet');
  assert.strictEqual(detectBdoInstrument({ fileName: 'synth_waves.mid' }), 'marnisynth');
});

test('detectBdoInstrument detects instrument from track name', () => {
  assert.strictEqual(detectBdoInstrument({ name: 'Contrabaixo Acústico' }), 'bass');
  assert.strictEqual(detectBdoInstrument({ name: 'Violoncelo' }), 'cello');
  assert.strictEqual(detectBdoInstrument({ name: 'Lead Flute' }), 'flute');
  assert.strictEqual(detectBdoInstrument({ name: 'Section Brass Trumpet' }), 'trumpet');
  assert.strictEqual(detectBdoInstrument({ name: 'Electric Guitar Overdrive' }), 'guitar');
});

test('detectBdoInstrument detects instrument from GM program change', () => {
  assert.strictEqual(detectBdoInstrument({ program: 25 }), 'guitar'); // Steel Guitar
  assert.strictEqual(detectBdoInstrument({ program: 33 }), 'bass'); // Electric Bass
  assert.strictEqual(detectBdoInstrument({ program: 40 }), 'violin'); // Violin
  assert.strictEqual(detectBdoInstrument({ program: 42 }), 'cello'); // Cello
  assert.strictEqual(detectBdoInstrument({ program: 46 }), 'harp'); // Orchestral Harp
  assert.strictEqual(detectBdoInstrument({ program: 56 }), 'trumpet'); // Trumpet
  assert.strictEqual(detectBdoInstrument({ program: 73 }), 'flute'); // Flute
  assert.strictEqual(detectBdoInstrument({ program: 81 }), 'marnisynth'); // Lead Synth
  assert.strictEqual(detectBdoInstrument({ program: 118 }), 'percussion'); // Synth Drum
  assert.strictEqual(detectBdoInstrument({ program: 0 }), 'grand-piano'); // Acoustic Grand Piano
});

test('detectBdoInstrument detects bass or flute register from notes pitch heuristics', () => {
  // Low notes -> bass
  const bassNotes = [
    { pitch: 36 },
    { pitch: 40 },
    { pitch: 43 },
    { pitch: 38 },
  ];
  assert.strictEqual(detectBdoInstrument({ notes: bassNotes }), 'bass');

  // High notes -> flute
  const fluteNotes = [
    { pitch: 72 },
    { pitch: 76 },
    { pitch: 84 },
    { pitch: 88 },
  ];
  assert.strictEqual(detectBdoInstrument({ notes: fluteNotes }), 'flute');
});

test('detectBdoInstrument falls back to grand-piano when unknown', () => {
  assert.strictEqual(detectBdoInstrument({ name: 'Track 1', fileName: 'song.mid' }), 'grand-piano');
});
