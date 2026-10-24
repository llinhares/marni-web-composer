/**
 * Black Desert Online instruments, exactly as the in-game composer offers them.
 *
 * Codes, the 730-note blocks and the technique byte were read from songs saved by the game itself
 * (Documents/Black Desert/Music). The game groups instruments in four tabs (Flauta, Violinos, Piano
 * Elétrico, Percussão) and three tiers (Para Novato, Florquestra, Marnis). Each Marnion synth has four
 * sounds, stored as four consecutive instrument codes.
 */

import type { InstrumentId } from '../types/music.ts';

export type BdoInstrumentKey =
  | 'beginner-flute'
  | 'beginner-recorder'
  | 'florchestra-flute'
  | 'florchestra-clarinet'
  | 'florchestra-horn'
  | 'beginner-guitar'
  | 'beginner-harp'
  | 'beginner-violin'
  | 'florchestra-acoustic-guitar'
  | 'florchestra-contrabass'
  | 'florchestra-harp'
  | 'florchestra-violin'
  | 'marnibass'
  | 'guitar-silver-wave'
  | 'guitar-highway'
  | 'guitar-hexe-glam'
  | 'beginner-piano'
  | 'florchestra-piano'
  | 'marnion-wavy-planet'
  | 'marnion-illusion-tree'
  | 'marnion-secret-note'
  | 'marnion-sandwich'
  | 'beginner-hand-drum'
  | 'beginner-cymbals'
  | 'florchestra-drum-set'
  | 'florchestra-handpan';

export type BdoTab = 'flute' | 'strings' | 'keys' | 'percussion';
export type BdoTier = 'beginner' | 'florchestra' | 'marnis';

export interface BdoInstrumentDef {
  key: BdoInstrumentKey;
  /** Instrument code in the game file (first sound for the Marnions). */
  code: number;
  /** Number of sounds (consecutive codes); 4 for the Marnions, 1 otherwise. */
  sounds: number;
  tab: BdoTab;
  tier: BdoTier;
  /** Name shown by the game (pt-BR client). */
  name: string;
  nameEn: string;
  /** Sound family used by the DAW for playback and General MIDI export. */
  family: InstrumentId;
  /** Drum kit: notes are kit pieces on fixed keys (see DRUM_KIT_PIECES). */
  drumKit: boolean;
  /** Percussion instrument (no sustain, no pitch transposition on export). */
  percussion: boolean;
  /** Technique byte written for notes without an explicit technique (99 = instrument has none). */
  defaultTechnique: number;
  /** Lowest and highest key the game composer offers for this instrument (MIDI numbers). */
  minPitch: number;
  maxPitch: number;
  /** Technique codes the instrument accepts ("Estilo"), in the order of the game menu. */
  techniques: number[];
}

export const BDO_TABS: Array<{ id: BdoTab; name: string }> = [
  { id: 'flute', name: 'Flauta' },
  { id: 'strings', name: 'Violinos' },
  { id: 'keys', name: 'Piano Elétrico' },
  { id: 'percussion', name: 'Percussão' },
];

export const BDO_TIER_NAMES: Record<BdoTier, string> = {
  beginner: 'Para Novato',
  florchestra: 'Florquestra',
  marnis: 'Marnis',
};

const def = (
  key: BdoInstrumentKey,
  code: number,
  tab: BdoTab,
  tier: BdoTier,
  name: string,
  nameEn: string,
  family: InstrumentId,
  range: [number, number],
  techniques: number[],
  extra: Partial<Pick<BdoInstrumentDef, 'sounds' | 'drumKit' | 'percussion'>> = {}
): BdoInstrumentDef => ({
  key,
  code,
  tab,
  tier,
  name,
  nameEn,
  family,
  minPitch: range[0],
  maxPitch: range[1],
  techniques,
  sounds: extra.sounds ?? 1,
  drumKit: extra.drumKit ?? false,
  percussion: extra.percussion ?? false,
  defaultTechnique: techniques.length ? techniques[0] : 99,
});

// The game stores one global list of technique codes and each instrument offers part of it. Ranges
// and codes were read from a song made in the game with every instrument at its lowest and highest
// key and every technique of its menu.
const NONE: number[] = []; // instrument without techniques: notes store 99
const STRINGS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MARNION = [0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 20, 21];
const E_GUITAR = [0, 6, 13, 14, 25];

/** In the order the game lists them (tab, then tier). */
export const BDO_INSTRUMENT_DEFS: BdoInstrumentDef[] = [
  def('beginner-flute', 0x01, 'flute', 'beginner', 'Flauta Transversal', 'Beginner Flute', 'flute', [12, 107], [0]),
  def('beginner-recorder', 0x02, 'flute', 'beginner', 'Gravador', 'Beginner Recorder', 'recorder', [36, 83], NONE),
  def('florchestra-flute', 0x0b, 'flute', 'florchestra', 'Flauta Transversal', 'Florchestra Flute', 'flute', [48, 88], [0, 1, 2, 3, 4, 15]),
  def('florchestra-clarinet', 0x27, 'flute', 'florchestra', 'Clarinete', 'Florchestra Clarinet', 'clarinet', [24, 95], [0]),
  def('florchestra-horn', 0x28, 'flute', 'florchestra', 'Trompa', 'Florchestra Horn', 'horn', [24, 95], [0, 3, 4, 12, 26, 27, 28]),

  def('beginner-guitar', 0x00, 'strings', 'beginner', 'Outros', 'Beginner Guitar', 'guitar', [12, 119], [0]),
  def('beginner-harp', 0x06, 'strings', 'beginner', 'Harpa', 'Beginner Harp', 'harp', [36, 95], NONE),
  def('beginner-violin', 0x08, 'strings', 'beginner', 'Violino', 'Beginner Violin', 'violin', [36, 83], NONE),
  def('florchestra-acoustic-guitar', 0x0a, 'strings', 'florchestra', 'Violão Acústico', 'Florchestra Acoustic Guitar', 'guitar', [36, 88], [0, 3, 12, 13, 14, 15]),
  def('florchestra-contrabass', 0x0f, 'strings', 'florchestra', 'Contrabaixo', 'Florchestra Contrabass', 'bass', [28, 64], [0, 3, 12, 13, 14, 23]),
  def('florchestra-harp', 0x10, 'strings', 'florchestra', 'Harpa', 'Florchestra Harp', 'harp', [12, 90], [0, 9, 10, 16]),
  def('florchestra-violin', 0x12, 'strings', 'florchestra', 'Violino', 'Florchestra Violin', 'violin', [43, 88], STRINGS),
  def('marnibass', 0x0e, 'strings', 'marnis', 'Marnibass', 'Marnibass', 'electric-bass', [28, 64], [0, 3, 12, 13, 14, 16, 22, 23, 24]),
  def('guitar-silver-wave', 0x24, 'strings', 'marnis', 'Guitarra Elétrica: Onda Prateada', 'Electric Guitar: Silver Wave', 'electric-guitar', [24, 95], E_GUITAR),
  def('guitar-highway', 0x25, 'strings', 'marnis', 'Guitarra Elétrica: Highway', 'Electric Guitar: Highway', 'electric-guitar', [24, 95], E_GUITAR),
  def('guitar-hexe-glam', 0x26, 'strings', 'marnis', 'Guitarra Elétrica: Hexe Glam', 'Electric Guitar: Hexe Glam', 'electric-guitar', [24, 95], E_GUITAR),

  def('beginner-piano', 0x07, 'keys', 'beginner', 'Piano', 'Beginner Piano', 'grand-piano', [12, 107], NONE),
  def('florchestra-piano', 0x11, 'keys', 'florchestra', 'Piano', 'Florchestra Piano', 'grand-piano', [12, 107], [0, 11]),
  def('marnion-wavy-planet', 0x14, 'keys', 'marnis', 'Marnion: Planeta Ondulado', 'Marnian: Wavy Planet', 'marnisynth', [12, 100], MARNION, { sounds: 4 }),
  def('marnion-illusion-tree', 0x18, 'keys', 'marnis', 'Marnion: Árvore Fantasiosa', 'Marnian: Illusion Tree', 'marnisynth', [12, 100], MARNION, { sounds: 4 }),
  def('marnion-secret-note', 0x1c, 'keys', 'marnis', 'Marnion: Nota Secreta', 'Marnian: Secret Note', 'marnisynth', [12, 100], MARNION, { sounds: 4 }),
  def('marnion-sandwich', 0x20, 'keys', 'marnis', 'Marnion: Sanduíche', 'Marnian: Sandwich', 'marnisynth', [12, 100], MARNION, { sounds: 4 }),

  def('beginner-hand-drum', 0x04, 'percussion', 'beginner', 'Tambor', 'Hand Drum', 'percussion', [60, 79], NONE, { percussion: true }),
  def('beginner-cymbals', 0x05, 'percussion', 'beginner', 'Prato', 'Cymbals', 'percussion', [60, 71], NONE, { percussion: true }),
  def('florchestra-drum-set', 0x0d, 'percussion', 'florchestra', 'Kit de Bateria', 'Florchestra Drum Set', 'percussion', [48, 64], NONE, {
    percussion: true,
    drumKit: true,
  }),
  def('florchestra-handpan', 0x13, 'percussion', 'florchestra', 'Tamborim', 'Handpan', 'handpan', [41, 88], NONE, { percussion: true }),
];

/** Names of the techniques ("Estilo" menu of the game composer, pt-BR client). */
export const TECHNIQUE_NAMES: Record<number, string> = {
  0: 'Sustenido',
  1: 'Tab',
  2: 'Corte',
  3: 'Slide para cima',
  4: 'Curto',
  5: 'Pizzicato',
  6: 'Tremolo',
  7: 'Trilo Menor',
  8: 'Trilo Maior',
  9: 'Acorde Maior',
  10: 'Acorde Menor',
  11: 'Pedal',
  12: 'Slide para Baixo',
  13: 'Mute',
  14: 'Harmônicos',
  15: 'Tercina',
  16: 'Glissando',
  17: 'Vibrato',
  18: 'Marcato',
  19: 'Filter Sustain',
  20: 'Filter Brassy',
  21: 'Filter Pluck',
  22: 'Slap',
  23: 'Gliss Up',
  24: 'X-notes',
  25: 'FX (C2 a G2)',
  26: 'SusPiano',
  27: 'SusMezzoForte',
  28: 'SusForte',
};

/** Colour of each style, like the squares of the game's style menu. */
const TECHNIQUE_COLORS: Record<number, string> = {
  0: '#9ca3af',
  1: '#84a83a',
  2: '#2fa58c',
  3: '#2b8fa8',
  4: '#2f5fbf',
  5: '#6a3fc2',
  6: '#a33ea8',
  7: '#b8325c',
  8: '#b5462f',
  9: '#a86a2f',
  10: '#9a9a2f',
  11: '#67e8f9',
  12: '#2f9a5e',
  13: '#d08a3a',
  14: '#2f55b5',
  15: '#b52f3a',
  16: '#b52f8a',
  17: '#d24a4a',
  18: '#d0773a',
  19: '#d4a12f',
  20: '#a8a83a',
  21: '#4f9a45',
  22: '#2f7a45',
  23: '#2f8a7a',
  24: '#3f6a8a',
  25: '#c0304a',
  26: '#2f8ad0',
  27: '#6a3fc2',
  28: '#c03030',
};

export function techniqueColor(code: number): string {
  if (TECHNIQUE_COLORS[code]) return TECHNIQUE_COLORS[code];
  return `hsl(${(code * 47) % 360} 55% 55%)`;
}

/** Name of a technique code ("Técnica N" for a code the game menus never showed). */
export function techniqueName(code: number): string {
  if (code === 99) return 'Básico';
  return TECHNIQUE_NAMES[code] ?? `Técnica ${code}`;
}

/** Technique written for a note: its own when the instrument accepts it, else the instrument default. */
export function validTechnique(d: BdoInstrumentDef, technique: number | undefined): number {
  if (d.techniques.length === 0) return 99;
  return technique !== undefined && d.techniques.includes(technique) ? technique : d.defaultTechnique;
}

const BY_KEY = new Map(BDO_INSTRUMENT_DEFS.map((d) => [d.key, d]));

export function getBdoInstrument(key: BdoInstrumentKey | string | undefined | null): BdoInstrumentDef | null {
  return (key && BY_KEY.get(key as BdoInstrumentKey)) || null;
}

export function isBdoInstrumentKey(key: unknown): key is BdoInstrumentKey {
  return typeof key === 'string' && BY_KEY.has(key as BdoInstrumentKey);
}

/** Game instrument code of an instrument and sound (Marnion sound 0-3). */
export function bdoInstrumentCode(d: BdoInstrumentDef, sound = 0): number {
  return d.code + Math.max(0, Math.min(d.sounds - 1, Math.round(sound)));
}

/** Instrument and sound of a code read from a game file. */
export function bdoInstrumentFromCode(code: number): { def: BdoInstrumentDef; sound: number } | null {
  for (const d of BDO_INSTRUMENT_DEFS) {
    if (code >= d.code && code < d.code + d.sounds) return { def: d, sound: code - d.code };
  }
  return null;
}

/** Display name with tier, e.g. "Florquestra · Piano" or "Marnion: Sanduíche (som 2)". */
export function bdoInstrumentLabel(d: BdoInstrumentDef, sound = 0): string {
  const base = d.tier === 'marnis' ? d.name : `${BDO_TIER_NAMES[d.tier]} · ${d.name}`;
  return d.sounds > 1 && sound > 0 ? `${base} (${MARNION_SOUND_NAMES[sound]})` : base;
}

export const MARNION_SOUND_NAMES = ['Básico', 'Stereo', 'Super', 'SuperOct'];

/** Best game instrument for a DAW sound family (projects made before the game catalog existed). */
export function defaultBdoInstrumentForFamily(family: InstrumentId | string | undefined): BdoInstrumentKey {
  switch (family) {
    case 'flute':
      return 'florchestra-flute';
    case 'recorder':
      return 'beginner-recorder';
    case 'clarinet':
      return 'florchestra-clarinet';
    case 'trumpet':
    case 'horn':
      return 'florchestra-horn';
    case 'violin':
      return 'florchestra-violin';
    case 'cello':
    case 'bass':
      return 'florchestra-contrabass';
    case 'electric-bass':
      return 'marnibass';
    case 'guitar':
      return 'florchestra-acoustic-guitar';
    case 'electric-guitar':
      return 'guitar-silver-wave';
    case 'harp':
      return 'florchestra-harp';
    case 'percussion':
      return 'florchestra-drum-set';
    case 'handpan':
      return 'florchestra-handpan';
    case 'marnisynth':
      return 'marnion-wavy-planet';
    default:
      return 'florchestra-piano';
  }
}

/**
 * Game instrument for a General MIDI program (0-127), as a professional DAW exports it.
 * Channel 10 (index 9) is always the drum kit.
 */
export function bdoInstrumentForGmProgram(program: number, channel = 0): BdoInstrumentKey {
  if (channel === 9) return 'florchestra-drum-set';
  const p = Math.max(0, Math.min(127, Math.round(program)));
  if (p <= 7) return 'florchestra-piano'; // pianos, electric pianos, harpsichord, clavinet
  if (p <= 15) return p === 12 || p === 13 ? 'florchestra-handpan' : 'florchestra-harp'; // celesta, glockenspiel, music box, vibes, bells / marimba, xylophone
  if (p <= 20) return 'marnion-sandwich'; // organs
  if (p <= 23) return 'florchestra-clarinet'; // reed organ, accordion, harmonica, bandoneon
  if (p <= 26) return 'florchestra-acoustic-guitar'; // nylon, steel, jazz
  if (p <= 28) return 'guitar-silver-wave'; // clean, muted electric
  if (p === 29) return 'guitar-highway'; // overdriven
  if (p === 30) return 'guitar-hexe-glam'; // distortion
  if (p === 31) return 'guitar-silver-wave'; // harmonics
  if (p === 32 || p === 35) return 'florchestra-contrabass'; // acoustic, fretless
  if (p <= 39) return 'marnibass'; // electric, slap, synth basses
  if (p <= 41) return 'florchestra-violin'; // violin, viola
  if (p <= 43) return 'florchestra-contrabass'; // cello, contrabass
  if (p <= 45) return 'florchestra-violin'; // tremolo, pizzicato strings
  if (p === 46) return 'florchestra-harp';
  if (p === 47) return 'florchestra-handpan'; // timpani (pitched)
  if (p <= 51) return 'florchestra-violin'; // string ensembles
  if (p <= 54) return 'florchestra-flute'; // choir, voice
  if (p === 55) return 'florchestra-piano'; // orchestra hit
  if (p <= 61) return 'florchestra-horn'; // trumpet, trombone, tuba, horn, brass
  if (p <= 63) return 'marnion-sandwich'; // synth brass
  if (p <= 71) return 'florchestra-clarinet'; // saxes, oboe, english horn, bassoon, clarinet
  if (p <= 79) return 'florchestra-flute'; // piccolo, flute, recorder, pan flute, ocarina...
  if (p <= 87) return 'marnion-wavy-planet'; // synth leads
  if (p <= 95) return 'marnion-illusion-tree'; // synth pads
  if (p <= 103) return 'marnion-secret-note'; // synth effects
  if (p <= 107) return 'florchestra-acoustic-guitar'; // sitar, banjo, shamisen, koto
  if (p === 108) return 'florchestra-handpan'; // kalimba
  if (p === 109 || p === 111) return 'florchestra-clarinet'; // bagpipe, shanai
  if (p === 110) return 'florchestra-violin'; // fiddle
  if (p <= 119) return 'florchestra-handpan'; // tinkle bell, agogo, steel drums, woodblock, taiko, toms
  return 'marnion-secret-note'; // sound effects
}

/** General MIDI program written for an instrument when exporting a .mid file. */
export function gmProgramForBdoInstrument(key: BdoInstrumentKey): number {
  switch (key) {
    case 'beginner-flute':
    case 'florchestra-flute':
      return 73;
    case 'beginner-recorder':
      return 74;
    case 'florchestra-clarinet':
      return 71;
    case 'florchestra-horn':
      return 60;
    case 'beginner-guitar':
    case 'florchestra-acoustic-guitar':
      return 24;
    case 'beginner-harp':
    case 'florchestra-harp':
      return 46;
    case 'beginner-violin':
    case 'florchestra-violin':
      return 40;
    case 'florchestra-contrabass':
      return 43;
    case 'marnibass':
      return 33;
    case 'guitar-silver-wave':
      return 27;
    case 'guitar-highway':
      return 29;
    case 'guitar-hexe-glam':
      return 30;
    case 'marnion-wavy-planet':
      return 80;
    case 'marnion-illusion-tree':
      return 88;
    case 'marnion-secret-note':
      return 98;
    case 'marnion-sandwich':
      return 16;
    case 'florchestra-handpan':
      return 114;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Drum kit
// ---------------------------------------------------------------------------

export interface DrumKitPiece {
  key: number; // note number in the game file
  label: string; // label shown by the game composer
  name: string; // pt-BR description
  category: 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal';
}

/**
 * Florchestra Drum Set: 17 pieces on consecutive keys from C4 (48) to E5 (64), laid out like the
 * General MIDI drum map one octave higher.
 */
export const DRUM_KIT_PIECES: DrumKitPiece[] = [
  { key: 48, label: 'Kck', name: 'Bumbo', category: 'kick' },
  { key: 49, label: 'SnrSide', name: 'Caixa (aro lateral)', category: 'snare' },
  { key: 50, label: 'SnrHit', name: 'Caixa', category: 'snare' },
  { key: 51, label: 'RimShot', name: 'Aro (rimshot)', category: 'snare' },
  { key: 52, label: 'SnrFlam', name: 'Caixa flam', category: 'snare' },
  { key: 53, label: 'Tom1', name: 'Tom 1 (surdo grave)', category: 'tom' },
  { key: 54, label: 'HihatC', name: 'Chimbal fechado', category: 'hihat' },
  { key: 55, label: 'Tom2', name: 'Tom 2 (surdo)', category: 'tom' },
  { key: 56, label: 'HatPdl', name: 'Chimbal no pedal', category: 'hihat' },
  { key: 57, label: 'Tom3', name: 'Tom 3', category: 'tom' },
  { key: 58, label: 'HihatO', name: 'Chimbal aberto', category: 'hihat' },
  { key: 59, label: 'Tom4', name: 'Tom 4', category: 'tom' },
  { key: 60, label: 'Tom5', name: 'Tom 5 (agudo)', category: 'tom' },
  { key: 61, label: 'CymCrsh', name: 'Prato de ataque (crash)', category: 'cymbal' },
  { key: 62, label: 'CymRide', name: 'Prato de condução (ride)', category: 'cymbal' },
  { key: 63, label: 'SnrRollS', name: 'Rufo de caixa curto', category: 'snare' },
  { key: 64, label: 'SnrRollL', name: 'Rufo de caixa longo', category: 'snare' },
];

export const DRUM_KIT_MIN = 48;
export const DRUM_KIT_MAX = 64;

const DRUM_BY_KEY = new Map(DRUM_KIT_PIECES.map((p) => [p.key, p]));

export function drumKitPiece(key: number): DrumKitPiece | null {
  return DRUM_BY_KEY.get(key) ?? null;
}

/** General MIDI drum note (channel 10) -> drum kit key. */
const GM_TO_KIT: Record<number, number> = {
  27: 63, // high Q -> short roll
  28: 51, // slap
  29: 64, // scratch push -> long roll
  30: 64,
  31: 49, // sticks
  32: 49, // square click
  33: 49, // metronome click
  34: 61, // metronome bell
  35: 48, // acoustic bass drum
  36: 48, // bass drum 1
  37: 49, // side stick
  38: 50, // acoustic snare
  39: 51, // hand clap
  40: 50, // electric snare
  41: 53, // low floor tom
  42: 54, // closed hi-hat
  43: 55, // high floor tom
  44: 56, // pedal hi-hat
  45: 57, // low tom
  46: 58, // open hi-hat
  47: 59, // low-mid tom
  48: 60, // hi-mid tom
  49: 61, // crash 1
  50: 60, // high tom
  51: 62, // ride 1
  52: 61, // chinese cymbal
  53: 62, // ride bell
  54: 54, // tambourine -> closed hi-hat
  55: 61, // splash
  56: 51, // cowbell -> rimshot
  57: 61, // crash 2
  58: 51, // vibraslap
  59: 62, // ride 2
  60: 60, // hi bongo
  61: 59, // low bongo
  62: 59, // mute hi conga
  63: 57, // open hi conga
  64: 55, // low conga
  65: 60, // high timbale
  66: 57, // low timbale
  67: 51, // high agogo
  68: 51, // low agogo
  69: 54, // cabasa
  70: 54, // maracas
  71: 58, // short whistle
  72: 58, // long whistle
  73: 54, // short guiro
  74: 58, // long guiro
  75: 49, // claves
  76: 49, // hi wood block
  77: 49, // low wood block
  78: 54, // mute cuica
  79: 58, // open cuica
  80: 54, // mute triangle
  81: 58, // open triangle
  82: 54, // shaker
  83: 58, // jingle bell
  84: 62, // bell tree
  85: 49, // castanets
  86: 53, // mute surdo
  87: 53, // open surdo
};

/** Drum kit key for a General MIDI drum note (unknown notes -> the nearest piece of the same octave). */
export function gmDrumToKit(gmNote: number): number {
  const mapped = GM_TO_KIT[gmNote];
  if (mapped !== undefined) return mapped;
  if (gmNote >= DRUM_KIT_MIN && gmNote <= DRUM_KIT_MAX) return gmNote;
  return gmNote < 35 ? 48 : 61;
}

/** Drum kit key back to the General MIDI drum note (for .mid export). */
export function kitToGmDrum(key: number): number {
  switch (key) {
    case 48:
      return 36;
    case 49:
      return 37;
    case 50:
      return 38;
    case 51:
      return 39;
    case 52:
      return 40;
    case 62:
      return 51;
    case 63:
    case 64:
      return 38;
    default:
      return key >= 53 && key <= 61 ? key - 12 : 38;
  }
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/** Game instrument of a track (old projects without one get the closest match for their sound). */
export function trackGameInstrument(track: {
  bdoInstrument?: BdoInstrumentKey | string;
  bdoSound?: number;
  instrumentId?: InstrumentId | string;
}): { def: BdoInstrumentDef; sound: number } {
  const d = getBdoInstrument(track.bdoInstrument) ?? getBdoInstrument(defaultBdoInstrumentForFamily(track.instrumentId))!;
  const sound = Math.max(0, Math.min(d.sounds - 1, Math.round(track.bdoSound ?? 0)));
  return { def: d, sound };
}

/** Track fields for a game instrument (the sound family follows the instrument). */
export function gameInstrumentFields(
  key: BdoInstrumentKey,
  sound = 0
): { bdoInstrument: BdoInstrumentKey; bdoSound: number; instrumentId: InstrumentId } {
  const d = getBdoInstrument(key) ?? getBdoInstrument('florchestra-piano')!;
  return {
    bdoInstrument: d.key,
    bdoSound: Math.max(0, Math.min(d.sounds - 1, sound)),
    instrumentId: d.family,
  };
}
