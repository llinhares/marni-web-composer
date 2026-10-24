import test from 'node:test';
import assert from 'node:assert/strict';
import type { Note } from '../../types/music.ts';
import { foldIntoInstrument, monophonicLine, stemLevelDb, transcribeDrums } from './stemTranscription.ts';

const SR = 44100;

// Deterministic noise
let seed = 1;
const noise = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x3fffffff - 1;
};

/** Mixes a drum hit into `out` at `sec`. */
function hit(out: Float32Array, sec: number, kind: 'kick' | 'snare' | 'hat' | 'crash') {
  const start = Math.round(sec * SR);
  const len = Math.round((kind === 'crash' ? 1.2 : kind === 'kick' ? 0.25 : kind === 'snare' ? 0.2 : 0.05) * SR);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR;
    let v = 0;
    if (kind === 'kick') v = Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 12);
    else {
      const n = noise();
      hp = 0.6 * (hp + n - prev); // crude high-pass to make cymbal-like noise
      prev = n;
      if (kind === 'snare') v = (0.6 * n + 0.6 * Math.sin(2 * Math.PI * 200 * t)) * Math.exp(-t * 18);
      else if (kind === 'hat') v = hp * 0.7 * Math.exp(-t * 60);
      else v = hp * 0.6 * Math.exp(-t * 2);
    }
    out[start + i] += v * 0.5;
  }
}

test('drum hits of a separated drum stem land on the kit pieces', () => {
  const bpm = 120; // one beat = 0.5 s = 480 ticks
  const out = new Float32Array(Math.round(5.6 * SR));
  for (let beat = 0; beat < 8; beat++) {
    const t = 0.25 + beat * 0.5;
    if (beat % 2 === 0) hit(out, t, 'kick');
    else hit(out, t, 'snare');
    hit(out, t + 0.25, 'hat');
  }
  hit(out, 4.2, 'crash');
  const notes = transcribeDrums(out, SR, bpm);
  const count = (p: number) => notes.filter((n) => n.pitch === p).length;
  assert.equal(count(48), 4, 'kicks');
  assert.equal(count(50), 4, 'snares');
  assert.ok(count(54) >= 7, `closed hi-hats: ${count(54)}`);
  assert.equal(count(61), 1, 'crash');
  // Timing: the first kick sits on 0.25 s = 240 ticks
  const firstKick = notes.find((n) => n.pitch === 48)!;
  assert.ok(Math.abs(firstKick.startTick - 240) <= 15, `kick at ${firstKick.startTick}`);
});

const note = (pitch: number, start: number, dur: number, velocity: number): Note => ({
  id: `${pitch}-${start}`,
  trackId: '',
  pitch,
  startTick: start,
  durationTicks: dur,
  velocity,
});

test('a vocal line keeps the strongest note at every moment', () => {
  // Melody 67 with a quiet octave ghost (79) and a short overlap with the next note
  const line = monophonicLine([note(67, 0, 480, 100), note(79, 0, 480, 40), note(69, 400, 480, 90)], 'loudest');
  assert.deepEqual(
    line.map((n) => [n.pitch, n.startTick, n.durationTicks]),
    [
      [67, 0, 480],
      [69, 480, 400],
    ]
  );
});

test('a bass line keeps the lowest note', () => {
  const line = monophonicLine([note(40, 0, 960, 60), note(52, 0, 480, 100)], 'lowest');
  assert.deepEqual(line.map((n) => [n.pitch, n.durationTicks]), [[40, 960]]);
});

test('notes are folded into the game instrument range and silent stems are detected', () => {
  // Marnibass: E1–E4
  const folded = foldIntoInstrument([note(20, 0, 480, 90), note(76, 0, 480, 90)], 'marnibass');
  assert.deepEqual(folded.map((n) => n.pitch), [32, 64]);
  const silent = { left: new Float32Array(44100), right: new Float32Array(44100) };
  assert.ok(stemLevelDb(silent) < -100);
});
