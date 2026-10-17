/**
 * Music calculation, pitch notation, and grid snapping utilities
 */

import type { GridSnap, TimeSignature } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function pitchToNoteName(pitch: number, accidentals: 'sharp' | 'flat' = 'sharp'): string {
  const octave = Math.floor(pitch / 12) - 1;
  const noteIndex = ((pitch % 12) + 12) % 12;
  const name = accidentals === 'sharp' ? NOTE_NAMES_SHARP[noteIndex] : NOTE_NAMES_FLAT[noteIndex];
  return `${name}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  const noteIndex = ((pitch % 12) + 12) % 12;
  // C# (1), D# (3), F# (6), G# (8), A# (10)
  return [1, 3, 6, 8, 10].includes(noteIndex);
}

export function pitchToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function ticksToSeconds(ticks: number, bpm: number, ticksPerBeat = TICKS_PER_BEAT): number {
  const beats = ticks / ticksPerBeat;
  return (beats * 60) / bpm;
}

export function secondsToTicks(seconds: number, bpm: number, ticksPerBeat = TICKS_PER_BEAT): number {
  const beats = (seconds * bpm) / 60;
  return Math.round(beats * ticksPerBeat);
}

export function formatTimecode(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.floor((clamped % 1) * 10);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${mm}:${ss}.${millis}`;
}

export function getBeatsPerMeasure(timeSig: TimeSignature): number {
  switch (timeSig) {
    case '4/4':
      return 4;
    case '3/4':
      return 3;
    case '6/8':
      return 3; // 2 dotted quarters or 6 eighths
    case '2/4':
      return 2;
    case '12/8':
      return 6;
    default:
      return 4;
  }
}

export function getGridSnapTicks(snap: GridSnap, ticksPerBeat = TICKS_PER_BEAT): number {
  switch (snap) {
    case '1/1':
      return ticksPerBeat * 4;
    case '1/2':
      return ticksPerBeat * 2;
    case '1/4':
      return ticksPerBeat;
    case '1/8':
      return Math.round(ticksPerBeat / 2);
    case '1/16':
      return Math.round(ticksPerBeat / 4);
    case '1/32':
      return Math.round(ticksPerBeat / 8);
    case '1/64':
      return Math.round(ticksPerBeat / 16);
    case '1/4T':
      return Math.round((ticksPerBeat * 4) / 6);
    case '1/8T':
      return Math.round((ticksPerBeat * 2) / 6);
    case '1/16T':
      return Math.round(ticksPerBeat / 6);
    case 'off':
    default:
      return 1;
  }
}

export function snapTickToGrid(tick: number, snap: GridSnap, ticksPerBeat = TICKS_PER_BEAT): number {
  const snapTicks = getGridSnapTicks(snap, ticksPerBeat);
  if (snapTicks <= 1) return Math.max(0, Math.round(tick));
  return Math.max(0, Math.round(tick / snapTicks) * snapTicks);
}

export function ticksToMeasureBeat(ticks: number, timeSig: TimeSignature, ticksPerBeat = TICKS_PER_BEAT): {
  measure: number;
  beat: number;
  subdivision: number;
} {
  const beatsPerMeasure = getBeatsPerMeasure(timeSig);
  const totalBeats = ticks / ticksPerBeat;
  const measure = Math.floor(totalBeats / beatsPerMeasure) + 1;
  const beat = Math.floor(totalBeats % beatsPerMeasure) + 1;
  const subdivision = Math.floor((totalBeats % 1) * 4) + 1;
  return { measure, beat, subdivision };
}

export interface ScaleDefinition {
  name: string;
  intervals: number[]; // semitone offsets from root
}

export const MUSICAL_SCALES: Record<string, ScaleDefinition> = {
  chromatic: { name: 'Cromática (Todas as Notas)', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: 'Maior (Jônio)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Menor Natural (Eólio)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Menor Harmônica', intervals: [0, 2, 3, 5, 7, 8, 11] },
  pentatonicMajor: { name: 'Pentatônica Maior', intervals: [0, 2, 4, 7, 9] },
  pentatonicMinor: { name: 'Pentatônica Menor', intervals: [0, 3, 5, 7, 10] },
  dorian: { name: 'Dórico', intervals: [0, 2, 3, 5, 7, 9, 10] },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
};

export function isPitchInScale(pitch: number, rootPitch = 0, scaleType = 'chromatic'): boolean {
  if (scaleType === 'chromatic') return true;
  const scale = MUSICAL_SCALES[scaleType];
  if (!scale) return true;
  const pitchClass = ((pitch % 12) + 12) % 12;
  const rootClass = ((rootPitch % 12) + 12) % 12;
  const relativeInterval = (pitchClass - rootClass + 12) % 12;
  return scale.intervals.includes(relativeInterval);
}

export interface BdoDrumPiece {
  code: string;
  name: string;
  shortName: string;
  category: 'bass' | 'snare' | 'hihat' | 'tom' | 'cymbal' | 'percussion';
  isNativeBdo: boolean;
}

export const BDO_DRUM_PIECES: Record<number, BdoDrumPiece> = {
  // Native Black Desert Online (BDO) Percussion Note Mapping
  48: { code: 'KCK', name: 'Bumbo (Kick)', shortName: 'Bumbo (Kick)', category: 'bass', isNativeBdo: true },
  49: { code: 'CSH', name: 'Prato Crash Alternativo', shortName: 'Crash Alt', category: 'cymbal', isNativeBdo: false },
  50: { code: 'SNR', name: 'Caixa (Snare Hit)', shortName: 'Caixa (Snare)', category: 'snare', isNativeBdo: true },
  51: { code: 'RIM', name: 'Rimshot / Lateral', shortName: 'Rimshot', category: 'snare', isNativeBdo: true },
  52: { code: 'FLM', name: 'Caixa Flam / Roll', shortName: 'Caixa Flam', category: 'snare', isNativeBdo: true },
  53: { code: 'TM1', name: 'Tom 1 (Grave)', shortName: 'Tom 1 (Grave)', category: 'tom', isNativeBdo: true },
  54: { code: 'HHC', name: 'Chimbal Fechado', shortName: 'Chimbal Fech.', category: 'hihat', isNativeBdo: true },
  55: { code: 'TM2', name: 'Tom 2 (Médio-Grave)', shortName: 'Tom 2 (Médio)', category: 'tom', isNativeBdo: true },
  56: { code: 'HHP', name: 'Pedal de Chimbal', shortName: 'Pedal Chimbal', category: 'hihat', isNativeBdo: true },
  57: { code: 'TM3', name: 'Tom 3 (Médio)', shortName: 'Tom 3 (Médio)', category: 'tom', isNativeBdo: true },
  58: { code: 'HHO', name: 'Chimbal Aberto', shortName: 'Chimbal Aberto', category: 'hihat', isNativeBdo: true },
  59: { code: 'TM4', name: 'Tom 4 (Agudo)', shortName: 'Tom 4 (Agudo)', category: 'tom', isNativeBdo: true },
  60: { code: 'TM5', name: 'Tom 5 (Super Agudo)', shortName: 'Tom 5 (Agudo)', category: 'tom', isNativeBdo: true },
  61: { code: 'CSH', name: 'Prato Crash', shortName: 'Prato Crash', category: 'cymbal', isNativeBdo: true },
  62: { code: 'RID', name: 'Prato Ride', shortName: 'Prato Ride', category: 'cymbal', isNativeBdo: true },

  // General MIDI (GM) Standard Percussion Fallbacks
  35: { code: 'KCK', name: 'Bumbo Secundário (GM 35)', shortName: 'Bumbo (GM)', category: 'bass', isNativeBdo: false },
  36: { code: 'KCK', name: 'Bumbo Acústico (GM 36)', shortName: 'Bumbo (GM 36)', category: 'bass', isNativeBdo: false },
  37: { code: 'RIM', name: 'Side Stick (GM 37)', shortName: 'Rimshot (GM 37)', category: 'snare', isNativeBdo: false },
  38: { code: 'SNR', name: 'Caixa Acústica (GM 38)', shortName: 'Caixa (GM 38)', category: 'snare', isNativeBdo: false },
  40: { code: 'SNR', name: 'Caixa Elétrica (GM 40)', shortName: 'Caixa (GM 40)', category: 'snare', isNativeBdo: false },
  41: { code: 'TM1', name: 'Tom de Chão Baixo (GM 41)', shortName: 'Tom 1 (GM 41)', category: 'tom', isNativeBdo: false },
  42: { code: 'HHC', name: 'Chimbal Fechado (GM 42)', shortName: 'Chimbal (GM)', category: 'hihat', isNativeBdo: false },
  43: { code: 'TM2', name: 'Tom de Chão Alto (GM 43)', shortName: 'Tom 2 (GM 43)', category: 'tom', isNativeBdo: false },
  44: { code: 'HHP', name: 'Pedal de Chimbal (GM 44)', shortName: 'Pedal (GM)', category: 'hihat', isNativeBdo: false },
  45: { code: 'TM3', name: 'Tom Baixo (GM 45)', shortName: 'Tom 3 (GM 45)', category: 'tom', isNativeBdo: false },
  46: { code: 'HHO', name: 'Chimbal Aberto (GM 46)', shortName: 'Chimbal Ab. (GM)', category: 'hihat', isNativeBdo: false },
  47: { code: 'TM4', name: 'Tom Médio (GM 47)', shortName: 'Tom 4 (GM 47)', category: 'tom', isNativeBdo: false },
};

export function getBdoDrumInfo(pitch: number): BdoDrumPiece | null {
  return BDO_DRUM_PIECES[pitch] || null;
}
