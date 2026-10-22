import test from 'node:test';
import assert from 'node:assert/strict';
import { noteNameToMidi, parseSoundfontScript, pickSample, INSTRUMENT_SAMPLES } from './sampleLibrary.ts';

test('noteNameToMidi handles naturals, flats and sharps', () => {
  assert.equal(noteNameToMidi('A0'), 21);
  assert.equal(noteNameToMidi('C4'), 60);
  assert.equal(noteNameToMidi('Bb3'), 58);
  assert.equal(noteNameToMidi('F#5'), 78);
  assert.equal(noteNameToMidi('C8'), 108);
  assert.equal(noteNameToMidi('H2'), null);
});

test('parseSoundfontScript reads a midi-js-soundfonts file', () => {
  const text = `
if (typeof(MIDI) === 'undefined') var MIDI = {};
MIDI.Soundfont.flute = {
"A0": "data:audio/mp3;base64,AAAA",
"Bb0": "data:audio/mp3;base64,BBBB",
"C8": "data:audio/mp3;base64,CCCC"
}`;
  const samples = parseSoundfontScript(text);
  assert.deepEqual([...samples.keys()], [21, 22, 108]);
  assert.equal(samples.get(22), 'BBBB');
});

test('pickSample uses the exact sample when available and re-pitches outside the recorded span', () => {
  const available = Array.from({ length: 88 }, (_, i) => 21 + i);
  assert.deepEqual(pickSample(60, available), { samplePitch: 60, rate: 1 });
  const low = pickSample(12, available)!;
  assert.equal(low.samplePitch, 21);
  assert.ok(Math.abs(low.rate - Math.pow(2, -9 / 12)) < 1e-9);
  assert.equal(pickSample(119, available)!.samplePitch, 108);
  assert.equal(pickSample(60, []), null);
});

test('every melodic instrument except the synth has a sampled timbre', () => {
  assert.equal(INSTRUMENT_SAMPLES['grand-piano'], 'acoustic_grand_piano');
  assert.equal(INSTRUMENT_SAMPLES.marnisynth, null);
  assert.equal(INSTRUMENT_SAMPLES.percussion, null);
});
