/**
 * Marni Web Composer - Core Music Types
 */

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
  | 'marnisynth';

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
  pitch: number; // MIDI pitch 24 - 108
  startTick: number; // Ticks from start (1 beat = 480 ticks)
  durationTicks: number; // Duration in ticks
  velocity: number; // 1 - 127
  selected?: boolean;
}

export interface Track {
  id: string;
  name: string;
  instrumentId: InstrumentId;
  color: string;
  volume: number; // 0 - 100
  pan: number; // -1 to 1 (0 = center)
  isMuted: boolean;
  isSolo: boolean;
  auxSend: boolean; // Reverb/Delay FX send toggle
  notes: Note[];
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
    minPitch: 24, // C1
    maxPitch: 108, // C8
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
];
