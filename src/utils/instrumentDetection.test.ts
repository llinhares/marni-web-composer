import { test } from 'node:test';
import assert from 'node:assert';
import { detectBdoInstrument, detectGameInstrument } from './instrumentDetection.ts';

test('channel 10 is always the drum kit', () => {
  assert.strictEqual(detectGameInstrument({ channel: 9, program: 40, name: 'Violin' }), 'florchestra-drum-set');
  assert.strictEqual(detectBdoInstrument({ channel: 9 }), 'percussion');
});

test('instrument words in file and track names (pt-BR and English, accents included)', () => {
  const cases: Array<[string, string]> = [
    ['01_Acoustic_Bass.mid', 'florchestra-contrabass'],
    ['guitar_melody.mid', 'florchestra-acoustic-guitar'],
    ['violao_nylon.mid', 'florchestra-acoustic-guitar'],
    ['flauta_solo.mid', 'florchestra-flute'],
    ['violino_lead.mid', 'florchestra-violin'],
    ['bateria_track.mid', 'florchestra-drum-set'],
    ['cello_bassline.mid', 'florchestra-contrabass'],
    ['harpa_gliss.mid', 'florchestra-harp'],
    ['trompete_fanfare.mid', 'florchestra-horn'],
    ['synth_waves.mid', 'marnion-wavy-planet'],
  ];
  for (const [fileName, key] of cases) assert.strictEqual(detectGameInstrument({ fileName }), key, fileName);

  const names: Array<[string, string]> = [
    ['Contrabaixo Acústico', 'florchestra-contrabass'],
    ['Violoncelo', 'florchestra-contrabass'],
    ['Lead Flute', 'florchestra-flute'],
    ['Section Brass Trumpet', 'florchestra-horn'],
    ['Electric Guitar Overdrive', 'guitar-highway'],
    ['Guitarra distorção', 'guitar-hexe-glam'],
    ['Electric Bass', 'marnibass'],
    ['Órgão Hammond', 'marnion-sandwich'],
    ['Sax Alto', 'florchestra-clarinet'],
    ['Percussão', 'florchestra-drum-set'],
    ['Strings Ensemble', 'florchestra-violin'],
  ];
  for (const [name, key] of names) assert.strictEqual(detectGameInstrument({ name }), key, name);
});

test('a General MIDI program wins over the track name', () => {
  assert.strictEqual(detectGameInstrument({ program: 25 }), 'florchestra-acoustic-guitar'); // steel guitar
  assert.strictEqual(detectGameInstrument({ program: 30 }), 'guitar-hexe-glam'); // distortion
  assert.strictEqual(detectGameInstrument({ program: 33 }), 'marnibass'); // electric bass
  assert.strictEqual(detectGameInstrument({ program: 40 }), 'florchestra-violin');
  assert.strictEqual(detectGameInstrument({ program: 42 }), 'florchestra-contrabass'); // cello
  assert.strictEqual(detectGameInstrument({ program: 46 }), 'florchestra-harp');
  assert.strictEqual(detectGameInstrument({ program: 56 }), 'florchestra-horn'); // trumpet
  assert.strictEqual(detectGameInstrument({ program: 65 }), 'florchestra-clarinet'); // alto sax
  assert.strictEqual(detectGameInstrument({ program: 73 }), 'florchestra-flute');
  assert.strictEqual(detectGameInstrument({ program: 81 }), 'marnion-wavy-planet'); // lead
  assert.strictEqual(detectGameInstrument({ program: 89 }), 'marnion-illusion-tree'); // pad
  assert.strictEqual(detectGameInstrument({ program: 114 }), 'florchestra-handpan'); // steel drums
  assert.strictEqual(detectGameInstrument({ program: 0 }), 'florchestra-piano');
  assert.strictEqual(detectGameInstrument({ program: 41, name: 'Piano' }), 'florchestra-violin');
  // Program 0 is the default many DAWs write: the name decides
  assert.strictEqual(detectGameInstrument({ program: 0, name: 'Flute' }), 'florchestra-flute');
});

test('register of the notes when nothing else is known', () => {
  const low = [36, 40, 43, 38].map((pitch) => ({ pitch }));
  assert.strictEqual(detectGameInstrument({ notes: low }), 'florchestra-contrabass');
  const high = [72, 76, 84, 88].map((pitch) => ({ pitch }));
  assert.strictEqual(detectGameInstrument({ notes: high }), 'florchestra-flute');
});

test('falls back to the Florchestra piano', () => {
  assert.strictEqual(detectGameInstrument({ name: 'Track 1', fileName: 'song.mid' }), 'florchestra-piano');
  assert.strictEqual(detectBdoInstrument({ name: 'Track 1' }), 'grand-piano');
});
