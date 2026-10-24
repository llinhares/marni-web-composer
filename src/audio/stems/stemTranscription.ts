/**
 * Turns separated stems into note tracks:
 * - vocals: one melodic line (the strongest note at every moment), played by an instrument that
 *   sings well in the game (Florchestra violin: G2–E6 covers male and female voices, legato bow);
 * - bass: the lowest line (Marnibass);
 * - other: the full harmony (Florchestra piano);
 * - drums: onsets per frequency band, mapped to the drum kit pieces (kick, snare, hi-hats, crash).
 * The pitched stems are transcribed with basic-pitch (see audioToMidi.ts).
 */

import type { Note } from '../../types/music.ts';
import { TICKS_PER_BEAT } from '../../types/music.ts';
import { getBdoInstrument, type BdoInstrumentKey } from '../../bdo/bdoInstruments.ts';
import type { StemName, StereoStem } from './stemTypes.ts';
import { newId } from '../../utils/ids.ts';

export const STEM_LABELS: Record<StemName, string> = {
  vocals: 'Voz',
  drums: 'Bateria',
  bass: 'Baixo',
  other: 'Outros (harmonia)',
};

/** Game instrument chosen for each stem (the user can change it before importing). */
export const STEM_INSTRUMENTS: Record<StemName, BdoInstrumentKey> = {
  vocals: 'florchestra-violin',
  drums: 'florchestra-drum-set',
  bass: 'marnibass',
  other: 'florchestra-piano',
};

/** Loudness of a stem in dBFS (RMS of both channels). */
export function stemLevelDb(stem: StereoStem): number {
  let sum = 0;
  const n = stem.left.length;
  for (let i = 0; i < n; i += 4) sum += stem.left[i] * stem.left[i] + stem.right[i] * stem.right[i];
  const rms = Math.sqrt(sum / Math.max(1, (n / 4) * 2));
  return 20 * Math.log10(rms + 1e-12);
}

/** Stems quieter than this carry no part (an instrumental song has no vocals stem worth reading). */
export const SILENT_STEM_DB = -45;

export function mixToMono(stem: StereoStem): Float32Array {
  const out = new Float32Array(stem.left.length);
  for (let i = 0; i < out.length; i++) out[i] = (stem.left[i] + stem.right[i]) * 0.5;
  return out;
}

/**
 * Keeps one note at a time. At every moment where notes overlap, `pick` chooses which one sounds
 * (the loudest for a melody, the lowest for a bass line); the others are cut there.
 */
export function monophonicLine(notes: Note[], pick: 'loudest' | 'lowest', minTicks = 30): Note[] {
  if (notes.length === 0) return [];
  const bounds = [...new Set(notes.flatMap((n) => [n.startTick, n.startTick + n.durationTicks]))].sort((a, b) => a - b);
  const better = (a: Note, b: Note) =>
    pick === 'lowest' ? a.pitch < b.pitch || (a.pitch === b.pitch && a.velocity > b.velocity) : a.velocity > b.velocity || (a.velocity === b.velocity && a.pitch > b.pitch);

  const out: Note[] = [];
  let current: Note | null = null; // output note being extended
  let currentSource: Note | null = null;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    let chosen: Note | null = null;
    for (const n of notes) {
      if (n.startTick <= a && n.startTick + n.durationTicks >= b && (!chosen || better(n, chosen))) chosen = n;
    }
    if (chosen && chosen === currentSource && current) {
      current.durationTicks = b - current.startTick;
    } else {
      if (current && current.durationTicks >= minTicks) out.push(current);
      current = chosen ? { ...chosen, startTick: a, durationTicks: b - a } : null;
      currentSource = chosen;
    }
  }
  if (current && current.durationTicks >= minTicks) out.push(current);
  return out;
}

/** Moves notes by whole octaves into the instrument's range in the game. */
export function foldIntoInstrument(notes: Note[], key: BdoInstrumentKey): Note[] {
  const d = getBdoInstrument(key);
  if (!d || d.drumKit) return notes;
  return notes.map((n) => {
    let p = n.pitch;
    while (p < d.minPitch && p + 12 <= d.maxPitch) p += 12;
    while (p > d.maxPitch && p - 12 >= d.minPitch) p -= 12;
    return p === n.pitch ? n : { ...n, pitch: Math.max(d.minPitch, Math.min(d.maxPitch, p)) };
  });
}

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

/** RBJ biquad (low-pass, high-pass or band-pass), applied in place on a copy. */
function biquad(input: Float32Array, sampleRate: number, type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q = 0.707): Float32Array {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Energy per frame in dB. */
function frameDb(signal: Float32Array, hop: number): Float32Array {
  const frames = Math.floor(signal.length / hop);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += signal[i] * signal[i];
    out[f] = 10 * Math.log10(s / hop + 1e-12);
  }
  return out;
}

interface Onset {
  frame: number;
  rise: number; // dB
  peakDb: number;
}

/** Sudden rises of a band's energy: local maxima of the rise, clearly above the recent level. */
function bandOnsets(db: Float32Array, minRiseDb: number, floorDb: number, minGapFrames: number): Onset[] {
  const rise = new Float32Array(db.length);
  for (let f = 2; f < db.length; f++) rise[f] = Math.max(0, db[f] - Math.min(db[f - 1], db[f - 2]));
  const onsets: Onset[] = [];
  let last = -Infinity;
  for (let f = 2; f < db.length - 1; f++) {
    if (rise[f] < minRiseDb || rise[f] < rise[f - 1] || rise[f] < rise[f + 1]) continue;
    const peak = Math.max(db[f], db[f + 1] ?? -Infinity);
    if (peak < floorDb) continue;
    if (f - last < minGapFrames) {
      if (onsets.length && rise[f] > onsets[onsets.length - 1].rise) onsets[onsets.length - 1] = { frame: f, rise: rise[f], peakDb: peak };
      continue;
    }
    onsets.push({ frame: f, rise: rise[f], peakDb: peak });
    last = f;
  }
  return onsets;
}

/**
 * Drum hits of a separated drums stem, as notes on the drum kit keys: Kck (48), SnrHit (50),
 * HihatC (54), HihatO (58) and CymCrsh (61).
 */
export function transcribeDrums(mono: Float32Array, sampleRate: number, bpm: number): Note[] {
  const hop = 512;
  const frameSec = hop / sampleRate;
  const ticksPerSec = (bpm * TICKS_PER_BEAT) / 60;
  const low = frameDb(biquad(mono, sampleRate, 'lowpass', 120), hop);
  const body = frameDb(biquad(mono, sampleRate, 'bandpass', 220, 1.2), hop);
  const crack = frameDb(biquad(mono, sampleRate, 'bandpass', 3000, 0.8), hop);
  const high = frameDb(biquad(mono, sampleRate, 'highpass', 7000), hop);

  const loudest = (db: Float32Array) => db.reduce((m, v) => (v > m ? v : m), -200);
  const gap = Math.max(2, Math.round(0.06 / frameSec));
  const kicks = bandOnsets(low, 6, loudest(low) - 35, gap);
  const snares = bandOnsets(crack, 6, loudest(crack) - 35, gap);
  const hats = bandOnsets(high, 5, loudest(high) - 35, gap);

  const near = (list: Onset[], f: number, tol = 2) => list.find((o) => Math.abs(o.frame - f) <= tol);
  const velocity = (o: Onset, top: number) => Math.max(40, Math.min(127, Math.round(127 + (o.peakDb - top) * 2.2)));
  const notes: Note[] = [];
  const add = (frame: number, pitch: number, vel: number) =>
    notes.push({
      id: newId('note'),
      trackId: '',
      pitch,
      startTick: Math.max(0, Math.round(frame * frameSec * ticksPerSec)),
      durationTicks: 120,
      velocity: vel,
    });

  // Kick: the sub band must dominate the drum body band (a snare's body leaks a little below 120 Hz)
  const lowTop = loudest(low);
  const kickFrames = kicks.filter((k) => Math.max(low[k.frame], low[k.frame + 1] ?? -200) >= Math.max(body[k.frame], body[k.frame + 1] ?? -200) - 3);
  for (const k of kickFrames) add(k.frame, 48, velocity(k, lowTop));

  // Snare: the 3 kHz crack together with the drum body; a crack alone is a hi-hat or a cymbal
  const crackTop = loudest(crack);
  const snareFrames: number[] = [];
  const bodyTop = loudest(body);
  const peakAt = (db: Float32Array, f: number) => Math.max(db[f], db[f + 1] ?? -200, db[f + 2] ?? -200);
  for (const s of snares) {
    const bodyPeak = peakAt(body, s.frame);
    const bodyRise = body[s.frame] - Math.min(body[Math.max(0, s.frame - 2)], body[Math.max(0, s.frame - 1)]);
    const kickHere = near(kickFrames, s.frame);
    // A real snare hit: loud drum body and loud crack (quiet rises from silence are bleed)
    const isSnare =
      bodyRise >= 3 &&
      bodyPeak > bodyTop - 15 &&
      s.peakDb > crackTop - 20 &&
      (!kickHere || bodyPeak > peakAt(low, s.frame) - 6);
    if (isSnare) {
      add(s.frame, 50, velocity(s, crackTop));
      snareFrames.push(s.frame);
    }
  }

  // Hi-hats and crash: how long the high band keeps ringing tells them apart
  const highTop = loudest(high);
  for (const h of hats) {
    if (snareFrames.some((f) => Math.abs(f - h.frame) <= 1) || h.peakDb < highTop - 30) continue;
    // Ringing time: until the band stays 9 dB below the hit for 3 frames (noise flickers)
    let ring = 0;
    let below = 0;
    for (let f = h.frame; f < high.length && below < 3; f++) {
      if (high[f] > h.peakDb - 9) {
        ring = f - h.frame + 1;
        below = 0;
      } else below++;
    }
    const ringSec = ring * frameSec;
    const pitch = ringSec > 0.35 ? 61 : ringSec > 0.15 ? 58 : 54;
    add(h.frame, pitch, velocity(h, highTop));
  }

  return notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
}
