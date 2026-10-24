/**
 * Marni Web Composer - Core Music Types
 */

import type { BdoInstrumentKey } from '../bdo/bdoInstruments.ts';

export type InstrumentId =
  | 'grand-piano'
  | 'flute'
  | 'violin'
  | 'percussion'
  | 'guitar'
  | 'bass'
  | 'harp'
  | 'trumpet'
  | 'cello'
  | 'marnisynth'
  | 'recorder'
  | 'clarinet'
  | 'horn'
  | 'electric-guitar'
  | 'electric-bass'
  | 'handpan';

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  category: 'strings' | 'woodwind' | 'brass' | 'keyboard' | 'percussion' | 'special';
  description: string;
  iconName: string;
  bdoMnemonic: string;
  color: string;
  minPitch: number; // MIDI pitch (e.g. 24 = C1, 36 = C2, etc.)
  maxPitch: number; // e.g. 108 = C8
  defaultVolume: number; // 0 - 100
  bdoCode: number; // BDO internal instrument ID
}

export interface Note {
  id: string;
  trackId: string;
  pitch: number; // MIDI pitch 12 (C0) to 119 (B8)
  startTick: number; // Ticks from start (1 beat = 480 ticks)
  durationTicks: number; // Duration in ticks
  velocity: number; // 1 - 127
  selected?: boolean;
  sustain?: boolean; // Sustain pedal effect (BDO byte 11)
  /**
   * BDO technique byte ("Estilo" in the game composer), kept exactly as read from a game file or
   * chosen in the editor. Omitted = the instrument's default.
   */
  technique?: number;
}

/** Channel strip of a track: 3-band EQ (dB) and compressor. */
export interface TrackMixer {
  eqLow: number; // -12..12 dB, low shelf 200 Hz
  eqMid: number; // -12..12 dB, peak 1 kHz
  eqHigh: number; // -12..12 dB, high shelf 5 kHz
  compressor: boolean;
  compThreshold: number; // dB
  compRatio: number;
}

export interface Track {
  id: string;
  name: string;
  /** Sound family used for playback (derived from the game instrument). */
  instrumentId: InstrumentId;
  /** Exact Black Desert instrument (see src/bdo/bdoInstruments.ts). Omitted in old projects. */
  bdoInstrument?: BdoInstrumentKey;
  /** Sound of a Marnion synth (0-3). */
  bdoSound?: number;
  color: string;
  volume: number; // 0 - 100
  pan: number; // -1 to 1 (0 = center)
  isMuted: boolean;
  isSolo: boolean;
  auxSend: boolean; // Reverb/Delay FX send toggle
  sustainPedal?: boolean; // Sustain pedal enabled for track (default true for piano)
  mixer?: TrackMixer; // EQ/compressor (defaults: flat, off)
  notes: Note[];
}

/** Named position on the timeline (verse, chorus...), saved with the project. */
export interface Marker {
  id: string;
  tick: number;
  name: string;
}

export type GridSnap = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64' | '1/4T' | '1/8T' | '1/16T' | 'off';

export type TimeSignature = '4/4' | '3/4' | '6/8' | '2/4' | '12/8';

export type ToolMode = 'pointer' | 'pencil' | 'eraser' | 'select' | 'pan';

export interface EffectorSettings {
  reverb: {
    enabled: boolean;
    time: number; // 0 - 100
    damp: number; // 0 - 100
    mix: number; // 0 - 100
  };
  delay: {
    enabled: boolean;
    feedback: number; // 0 - 100
    time: number; // 0 - 100 (in sixteenths or ms)
    mix: number; // 0 - 100
  };
  chorus: {
    enabled: boolean;
    feedback: number; // 0 - 100
    lfoDepth: number; // 0 - 100
    lfoFrequency: number; // 0 - 100
    mix: number; // 0 - 100
  };
}

export interface SongMetadata {
  title: string;
  author: string;
  bpm: number;
  timeSignature: TimeSignature;
  ticksPerQuarterNote: number; // Usually 480
  accidentals: 'sharp' | 'flat'; // # vs b
  gridSnap: GridSnap;
  bdoGrade: 'F' | 'D' | 'C' | 'B' | 'A' | 'S'; // BDO note budget limit
  isBdoProtected?: boolean; // Anti-plagiarism protection lock for imported BDO scores
  originalBdoAuthor?: string;
  originalBdoOwnerId?: number;
  originalBdoComposer?: string;
  originalBdoArranger?: string;
}

export const TICKS_PER_BEAT = 480;

export const BDO_GRADE_LIMITS: Record<string, { maxNotes: number; maxBars: number }> = {
  F: { maxNotes: 500, maxBars: 50 },
  D: { maxNotes: 1000, maxBars: 70 },
  C: { maxNotes: 2000, maxBars: 100 },
  B: { maxNotes: 4000, maxBars: 150 },
  A: { maxNotes: 7000, maxBars: 200 },
  S: { maxNotes: 10000, maxBars: 300 },
};

export const BDO_INSTRUMENTS: InstrumentInfo[] = [
  {
    id: 'grand-piano',
    name: 'Grand Piano',
    category: 'keyboard',
    description: 'Piano acústico de cauda encorpado com dinâmica refinada de concerto.',
    iconName: 'Piano',
    bdoMnemonic: 'PNO',
    color: '#d4a373',
    minPitch: 12, // C0
    maxPitch: 119, // B8
    defaultVolume: 75,
    bdoCode: 0,
  },
  {
    id: 'flute',
    name: 'Flauta',
    category: 'woodwind',
    description: 'Flauta de madeira com respiração suave, vibrato lírico e ataque aéreo.',
    iconName: 'Wind',
    bdoMnemonic: 'FLT',
    color: '#64b5f6',
    minPitch: 60, // C4
    maxPitch: 96, // C7
    defaultVolume: 70,
    bdoCode: 1,
  },
  {
    id: 'violin',
    name: 'Violino',
    category: 'strings',
    description: 'Violino clássico com ressonância de arco expressiva e timbre aveludado.',
    iconName: 'Music',
    bdoMnemonic: 'VLN',
    color: '#e07a5f',
    minPitch: 55, // G3
    maxPitch: 103, // G7
    defaultVolume: 75,
    bdoCode: 2,
  },
  {
    id: 'percussion',
    name: 'Percussão',
    category: 'percussion',
    description: 'Conjunto rítmico com bumbo, caixa, pratos, pandeiro e tambores Marni.',
    iconName: 'Drum',
    bdoMnemonic: 'DRM',
    color: '#81b29a',
    minPitch: 35, // B0/B1
    maxPitch: 81, // A5
    defaultVolume: 80,
    bdoCode: 3,
  },
  {
    id: 'guitar',
    name: 'Guitarra Acústica',
    category: 'strings',
    description: 'Violão clássico dedilhado com cordas de nylon e resposta acústica calorosa.',
    iconName: 'Guitar',
    bdoMnemonic: 'GTR',
    color: '#f4a261',
    minPitch: 40, // E2
    maxPitch: 88, // E6
    defaultVolume: 75,
    bdoCode: 4,
  },
  {
    id: 'bass',
    name: 'Baixo Acústico',
    category: 'strings',
    description: 'Contrabaixo acústico profundo que sustenta os graves da partitura.',
    iconName: 'Volume2',
    bdoMnemonic: 'BSS',
    color: '#e76f51',
    minPitch: 28, // E1
    maxPitch: 67, // G4
    defaultVolume: 85,
    bdoCode: 5,
  },
  {
    id: 'harp',
    name: 'Harpa',
    category: 'strings',
    description: 'Harpa etérea com glissandos cristalinos e ressonâncias encantadas.',
    iconName: 'Sparkles',
    bdoMnemonic: 'HRP',
    color: '#b388eb',
    minPitch: 36, // C2
    maxPitch: 103, // G7
    defaultVolume: 70,
    bdoCode: 6,
  },
  {
    id: 'trumpet',
    name: 'Trompete',
    category: 'brass',
    description: 'Trompete e clarim brilhante com projeção orquestral vigorosa.',
    iconName: 'Megaphone',
    bdoMnemonic: 'TRP',
    color: '#e9c46a',
    minPitch: 52, // E3
    maxPitch: 88, // E6
    defaultVolume: 80,
    bdoCode: 7,
  },
  {
    id: 'cello',
    name: 'Violoncelo',
    category: 'strings',
    description: 'Violoncelo solene com textura aveludada em registros médios e graves.',
    iconName: 'Disc',
    bdoMnemonic: 'VLC',
    color: '#a8dadc',
    minPitch: 36, // C2
    maxPitch: 76, // E5
    defaultVolume: 75,
    bdoCode: 8,
  },
  {
    id: 'marnisynth',
    name: 'Marnisynth & Ondas',
    category: 'special',
    description: 'Sintetizador mágico desenvolvido pelo cientista louco Marni em Florin.',
    iconName: 'Radio',
    bdoMnemonic: 'MRN',
    color: '#52b788',
    minPitch: 36, // C2
    maxPitch: 96, // C7
    defaultVolume: 75,
    bdoCode: 9,
  },
  {
    id: 'recorder',
    name: 'Flauta Doce',
    category: 'woodwind',
    description: 'Flauta doce (gravador) de som simples e direto.',
    iconName: 'Wind',
    bdoMnemonic: 'REC',
    color: '#90caf9',
    minPitch: 60,
    maxPitch: 96,
    defaultVolume: 70,
    bdoCode: 2,
  },
  {
    id: 'clarinet',
    name: 'Clarinete',
    category: 'woodwind',
    description: 'Clarinete de madeira, quente nos graves e brilhante nos agudos.',
    iconName: 'Wind',
    bdoMnemonic: 'CLR',
    color: '#4fc3f7',
    minPitch: 50,
    maxPitch: 94,
    defaultVolume: 72,
    bdoCode: 0x27,
  },
  {
    id: 'horn',
    name: 'Trompa',
    category: 'brass',
    description: 'Trompa orquestral, redonda e cheia.',
    iconName: 'Megaphone',
    bdoMnemonic: 'HRN',
    color: '#f2c14e',
    minPitch: 34,
    maxPitch: 77,
    defaultVolume: 78,
    bdoCode: 0x28,
  },
  {
    id: 'electric-guitar',
    name: 'Guitarra Elétrica',
    category: 'strings',
    description: 'Guitarra elétrica Marni, do timbre limpo à distorção.',
    iconName: 'Guitar',
    bdoMnemonic: 'EGT',
    color: '#ef8354',
    minPitch: 40,
    maxPitch: 88,
    defaultVolume: 75,
    bdoCode: 0x24,
  },
  {
    id: 'electric-bass',
    name: 'Marnibass',
    category: 'strings',
    description: 'Baixo elétrico Marni para linhas graves marcantes.',
    iconName: 'Volume2',
    bdoMnemonic: 'EBS',
    color: '#d1495b',
    minPitch: 28,
    maxPitch: 67,
    defaultVolume: 85,
    bdoCode: 0x0e,
  },
  {
    id: 'handpan',
    name: 'Tamborim (Handpan)',
    category: 'percussion',
    description: 'Handpan metálico e afinado, de notas ressonantes.',
    iconName: 'Disc',
    bdoMnemonic: 'HPN',
    color: '#9fd8cb',
    minPitch: 48,
    maxPitch: 84,
    defaultVolume: 75,
    bdoCode: 0x13,
  },
];
