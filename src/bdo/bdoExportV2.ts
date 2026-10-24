import type { Track, Note, EffectorSettings } from '../types/music.ts';
import {
  BDO_INSTRUMENT_DEFS,
  DRUM_KIT_MAX,
  DRUM_KIT_MIN,
  bdoInstrumentCode,
  bdoInstrumentFromCode,
  gmDrumToKit,
  trackGameInstrument,
  validTechnique,
  type BdoInstrumentDef,
} from './bdoInstruments.ts';

export interface SongContext {
  bpm: number;
  timeSignature: [number, number];
  title: string;
  author?: string;
}

const _KA = new Uint8Array([0xa3, 0x71, 0x8f, 0x92, 0x46, 0xb2, 0xc8, 0x55]);
const _KB = new Uint8Array([0xf2, 0x82, 0x80, 0x83, 0x42, 0x96, 0xa2, 0x55]);
const _SMOD = [[333, 313, 505, 369], [379, 375, 319, 391], [361, 445, 451, 397], [397, 425, 395, 505]];
const _SXOR = [[0x83, 0x85, 0x9B, 0xCD], [0xCC, 0xA7, 0xAD, 0x41], [0x4B, 0x2E, 0xD4, 0x33], [0xEA, 0xCB, 0x2E, 0x04]];
const _PBOX = new Uint32Array([
  0x00000001, 0x00000080, 0x00000400, 0x00002000, 0x00080000, 0x00200000, 0x01000000, 0x40000000,
  0x00000008, 0x00000020, 0x00000100, 0x00004000, 0x00010000, 0x00800000, 0x04000000, 0x20000000,
  0x00000004, 0x00000010, 0x00000200, 0x00008000, 0x00020000, 0x00400000, 0x08000000, 0x10000000,
  0x00000002, 0x00000040, 0x00000800, 0x00001000, 0x00040000, 0x00100000, 0x02000000, 0x80000000
]);
const _KEYROT = [0, 1, 2, 3, 2, 1, 3, 0, 1, 3, 2, 0, 3, 1, 0, 2];
const _sbox = [new Uint32Array(1024), new Uint32Array(1024), new Uint32Array(1024), new Uint32Array(1024)];
function _perm32(x: number): number { let result = 0, i = 0, unsignedX = x >>> 0; while (unsignedX) { if (unsignedX & 1) result |= _PBOX[i]; i++; unsignedX >>>= 1; } return result >>> 0; }
function _gf_mult(a: number, b: number, m: number): number { let result = 0; while (b) { if (b & 1) result ^= a; a <<= 1; b >>= 1; if (a >= 256) a ^= m; } return result; }
function _gf_exp7(b: number, m: number): number { if (b === 0) return 0; let x = _gf_mult(b, b, m); x = _gf_mult(b, x, m); x = _gf_mult(x, x, m); return _gf_mult(b, x, m); }
function _init_sbox() { for (let i = 0; i < 1024; i++) { const col = (i >>> 1) & 0xFF, row = (i & 0x1) | ((i & 0x200) >>> 8); _sbox[0][i] = _perm32(_gf_exp7(col ^ _SXOR[0][row], _SMOD[0][row]) << 24); _sbox[1][i] = _perm32(_gf_exp7(col ^ _SXOR[1][row], _SMOD[1][row]) << 16); _sbox[2][i] = _perm32(_gf_exp7(col ^ _SXOR[2][row], _SMOD[2][row]) << 8); _sbox[3][i] = _perm32(_gf_exp7(col ^ _SXOR[3][row], _SMOD[3][row])); } }
function _build_key_schedule(): number[][] { const key = new Uint8Array(8); for (let i = 0; i < 8; i++) key[i] = _KA[i] ^ _KB[i]; const ks: number[][] = Array(8).fill(0).map(() => [0, 0, 0]); const kb = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) kb[3 - i] = (key[i * 2] << 8) | key[i * 2 + 1]; for (let i = 0; i < 8; i++) { const kr = _KEYROT[i]; for (let j = 0; j < 15; j++) { for (let k = 0; k < 4; k++) { const t = (kr + k) & 3; const kbb = kb[t]; const bit = kbb & 1; ks[i][j % 3] = ((ks[i][j % 3] << 1) | bit) >>> 0; kb[t] = ((kbb >>> 1) | ((bit ^ 1) << 15)) >>> 0; } } } return ks; }
_init_sbox(); const _KS = _build_key_schedule();
function _ice_f(p: number, sk: number[]): number { const tl = (((p >>> 16) & 0x3FF) | (((p >>> 14) | (p << 18)) & 0xFFC00)) >>> 0; const tr = ((p & 0x3FF) | ((p << 2) & 0xFFC00)) >>> 0; const al = (sk[2] & (tl ^ tr)) >>> 0; const ar = (al ^ tr ^ sk[1]) >>> 0; const finalAl = al ^ tl ^ sk[0]; return (_sbox[0][finalAl >>> 10] | _sbox[1][finalAl & 0x3FF] | _sbox[2][ar >>> 10] | _sbox[3][ar & 0x3FF]) >>> 0; }
function _encrypt_block(data: Uint8Array, offset: number): Uint8Array { let l = 0, r = 0; for (let i = 0; i < 4; i++) { const t = 24 - i * 8; l = (l | ((data[offset + i] & 0xFF) << t)) >>> 0; r = (r | ((data[offset + i + 4] & 0xFF) << t)) >>> 0; } for (let i = 0; i < 8; i += 2) { l = (l ^ _ice_f(r, _KS[i])) >>> 0; r = (r ^ _ice_f(l, _KS[i + 1])) >>> 0; } const out = new Uint8Array(8); for (let i = 0; i < 4; i++) { out[3 - i] = r & 0xFF; out[7 - i] = l & 0xFF; r >>>= 8; l >>>= 8; } return out; }
function _decrypt_block(data: Uint8Array, offset: number): Uint8Array { let l = 0, r = 0; for (let i = 0; i < 4; i++) { const t = 24 - i * 8; l = (l | ((data[offset + i] & 0xFF) << t)) >>> 0; r = (r | ((data[offset + i + 4] & 0xFF) << t)) >>> 0; } for (let i = 7; i > 0; i -= 2) { l = (l ^ _ice_f(r, _KS[i])) >>> 0; r = (r ^ _ice_f(l, _KS[i - 1])) >>> 0; } const out = new Uint8Array(8); for (let i = 0; i < 4; i++) { out[3 - i] = r & 0xFF; out[7 - i] = l & 0xFF; r >>>= 8; l >>>= 8; } return out; }
function encryptIce(plaintext: Uint8Array): Uint8Array { const out = new Uint8Array(plaintext.length); let i = 0; while (i + 8 <= plaintext.length) { out.set(_encrypt_block(plaintext, i), i); i += 8; } if (i < plaintext.length) { out.set(plaintext.subarray(i), i); } return out; }
export function decryptOwnerHeader(ciphertext: Uint8Array): Uint8Array { const maxOwnerFileSize = 0x08 << 0x06; if (ciphertext.length > maxOwnerFileSize) { throw new Error("File too large for owner ID extraction. Use a single-note file saved in-game."); } const out = new Uint8Array(ciphertext.length); let i = 0; while (i + 8 <= ciphertext.length) { out.set(_decrypt_block(ciphertext, i), i); i += 8; } if (i < ciphertext.length) out.set(ciphertext.subarray(i), i); return out; }

/** Legacy English instrument names (older export dialogs and tests) -> game instrument code. */
export const FULL_BDO_INSTRUMENTS: Record<string, number> = {
  'Beginner Guitar': 0x00, 'Beginner Flute': 0x01, 'Beginner Recorder': 0x02, 'Hand Drum': 0x04,
  'Cymbals': 0x05, 'Beginner Harp': 0x06, 'Beginner Piano': 0x07, 'Beginner Violin': 0x08,
  'Florchestra Acoustic Guitar': 0x0a, 'Florchestra Flute': 0x0b, 'Drum Set': 0x0d,
  'Marnibass': 0x0e, 'Florchestra Contrabass': 0x0f, 'Florchestra Harp': 0x10,
  'Florchestra Piano': 0x11, 'Florchestra Violin': 0x12, 'Handpan': 0x13,
  'Marnian Wavy Planet': 0x14, 'Marnian Wavy Planet (Wave 2)': 0x15, 'Marnian Wavy Planet (Wave 3)': 0x16, 'Marnian Wavy Planet (Wave 4)': 0x17,
  'Marnian Illusion Tree': 0x18, 'Marnian Illusion Tree (Wave 2)': 0x19, 'Marnian Illusion Tree (Wave 3)': 0x1a, 'Marnian Illusion Tree (Wave 4)': 0x1b,
  'Marnian Secret Note': 0x1c, 'Marnian Secret Note (Wave 2)': 0x1d, 'Marnian Secret Note (Wave 3)': 0x1e, 'Marnian Secret Note (Wave 4)': 0x1f,
  'Marnian Sandwich': 0x20, 'Marnian Sandwich (Wave 2)': 0x21, 'Marnian Sandwich (Wave 3)': 0x22, 'Marnian Sandwich (Wave 4)': 0x23,
  'Guitar Silver Wave': 0x24, 'Guitar Highway': 0x25,
  'Guitar Hexe Glam': 0x26, 'Florchestra Clarinet': 0x27, 'Florchestra Horn': 0x28,
};

/** Codes of the percussion instruments (no pitch transposition, no sustain). */
export const BDO_PERCUSSION_IDS = BDO_INSTRUMENT_DEFS.filter((d) => d.percussion).map((d) => d.code);

/** Game code a track is exported as: the export dialog's choice, else the track's game instrument. */
export function exportCodeForTrack(track: Track, overrides: Record<string, number | string> = {}): number {
  const o = overrides[track.id];
  if (typeof o === 'number' && bdoInstrumentFromCode(o)) return o;
  if (typeof o === 'string' && FULL_BDO_INSTRUMENTS[o] !== undefined) return FULL_BDO_INSTRUMENTS[o];
  const { def, sound } = trackGameInstrument(track);
  return bdoInstrumentCode(def, sound);
}

/** Drum kit key for a note of a drum kit track (old projects stored General MIDI drum notes). */
export function resolveDrumPitch(pitch: number): number {
  return pitch >= DRUM_KIT_MIN && pitch <= DRUM_KIT_MAX ? pitch : gmDrumToKit(pitch);
}

export interface ExportOptions {
  charName: string;
  composerName?: string;
  arrangerName?: string;
  ownerId: number;
  transpose: number;
  velMode: 'layered' | 'stepped' | 'rescale' | 'floor' | 'off';
  velStepBase: number; velStepStep: number;
  velRescaleMin: number; velRescaleMax: number; velFloorVal: number;
  /** Track id -> game instrument code (or a legacy English name). */
  instrumentOverrides: Record<string, number | string>;
  velocityScales: Record<string, number>;
  sustainOverrides?: Record<string, boolean>;
  effector: EffectorSettings;
  maxChunkNotes?: number;
}

const BDO_VERSION = 9;
const HEADER_SIZE = 0x150;
const BDO_NOTE_MIN = 12; // C0 (BDO lowest pitch)
const BDO_NOTE_MAX = 119; // B8 (BDO highest pitch)

function encodeNameUTF16LE(name: string, size: number = 62): Uint8Array {
  const buf = new Uint8Array(size); let offset = 0;
  for (let i = 0; i < name.length && offset < size - 1; i++) {
    const code = name.charCodeAt(i); buf[offset++] = code & 0xFF; buf[offset++] = (code >> 8) & 0xFF;
  }
  return buf;
}

function getPitchIndex(pitchStr: string): number {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = pitchStr.replace(/[0-9-]/g, '');
  const octave = parseInt(pitchStr.replace(/[^0-9-]/g, '')) + 1;
  return octave * 12 + notes.indexOf(note);
}

/** Transposes and moves notes by whole octaves into [min, max] (the instrument's keys in the game). */
function clampNotes(notes: Note[], transpose: number, min = BDO_NOTE_MIN, max = BDO_NOTE_MAX): Note[] {
  return notes.map(n => {
    let p = (typeof n.pitch === 'number' ? n.pitch : getPitchIndex(String(n.pitch))) + transpose;
    while (p < min && p + 12 <= max) p += 12;
    while (p > max && p - 12 >= min) p -= 12;
    p = Math.max(min, Math.min(max, p));
    return { ...n, pitch: p };
  });
}

function processVelocity(notes: Note[], opts: ExportOptions): Note[] {
  if (notes.length === 0 || opts.velMode === 'off') return notes;
  if (opts.velMode === 'rescale') {
    const vels = notes.map(n => n.velocity);
    const minV = Math.min(...vels), maxV = Math.max(...vels);
    if (minV === maxV) return notes.map(n => ({...n, velocity: Math.floor((opts.velRescaleMin + opts.velRescaleMax)/2)}));
    return notes.map(n => ({...n, velocity: Math.round(opts.velRescaleMin + (n.velocity - minV) / (maxV - minV) * (opts.velRescaleMax - opts.velRescaleMin))}));
  }
  if (opts.velMode === 'floor') {
    const minV = Math.min(...notes.map(n => n.velocity));
    if (minV === 0 || minV >= opts.velFloorVal) return notes;
    const ratio = opts.velFloorVal / minV;
    return notes.map(n => ({...n, velocity: Math.min(Math.round(n.velocity * ratio), 127)}));
  }
  if (opts.velMode === 'stepped') {
    const uniqueVels = Array.from(new Set(notes.map(n => n.velocity))).sort((a,b) => a-b);
    const velMap: Record<number, number> = {};
    uniqueVels.forEach((v, i) => velMap[v] = Math.min(opts.velStepBase + i * opts.velStepStep, 127));
    velMap[uniqueVels[uniqueVels.length - 1]] = 127;
    return notes.map(n => ({...n, velocity: velMap[n.velocity] || n.velocity}));
  }
  if (opts.velMode === 'layered') {
    const levels = [80, 90, 100, 121];
    const uniqueVels = Array.from(new Set(notes.map(n => n.velocity))).sort((a,b) => a-b);
    if (uniqueVels.length === 1) return notes.map(n => ({...n, velocity: levels[1]}));
    const velMap: Record<number, number> = {};
    uniqueVels.forEach((v, i) => { const idx = Math.round((i / (uniqueVels.length - 1)) * (levels.length - 1)); velMap[v] = levels[idx]; });
    return notes.map(n => ({...n, velocity: velMap[n.velocity] || n.velocity}));
  }
  return notes;
}

/** Technique byte of a note, as the game stores it. */
export function techniqueByte(note: Note, def: BdoInstrumentDef, trackSustain: boolean): number {
  if (def.techniques.length === 0) return 99; // instrument without techniques (beginner instruments, percussion)
  if (note.technique !== undefined && def.techniques.includes(note.technique)) return note.technique;
  // Piano pedal from the editor's sustain flag; a technique of another instrument falls back to the default
  const pedal = note.sustain !== undefined ? note.sustain : trackSustain;
  return pedal && def.techniques.includes(11) ? 11 : validTechnique(def, undefined);
}

interface ExportNote {
  pitch: number;
  technique: number;
  velocity: number;
  startMs: number;
  durationMs: number;
}

/**
 * Writes the game's music file. One group per instrument code (sorted like the game), notes in blocks
 * of at most 730 followed by an empty block, start/duration in milliseconds.
 */
export function exportToBdo(tracks: Track[], song: SongContext, options: ExportOptions): Blob {
  const msPerTick = 60000 / (song.bpm * 480);
  const groups = new Map<number, { notes: ExportNote[]; volume: number; auxSend: boolean; sources: Array<{ track: Track; notes: Note[] }> }>();

  for (const t of tracks) {
    if (t.notes.length === 0 || t.isMuted) continue;
    const code = exportCodeForTrack(t, options.instrumentOverrides);
    const g = groups.get(code) ?? { notes: [], volume: 0, auxSend: false, sources: [] };
    g.volume = Math.max(g.volume, Math.min(100, Math.max(0, Math.round(t.volume ?? 100))));
    if (t.auxSend !== false) g.auxSend = true;
    g.sources.push({ track: t, notes: t.notes });
    groups.set(code, g);
  }

  for (const [code, g] of groups) {
    const def = bdoInstrumentFromCode(code)!.def;
    for (const { track, notes } of g.sources) {
      // Tracks sharing one game instrument keep their balance through the note velocities
      const balance = g.volume > 0 ? Math.min(1, (track.volume ?? 100) / g.volume) : 1;
      const scale = ((options.velocityScales[track.id] ?? 100) / 100) * balance;
      const isPiano = def.family === 'grand-piano';
      const trackSustain =
        options.sustainOverrides?.[track.id] !== undefined ? options.sustainOverrides[track.id] : Boolean(track.sustainPedal ?? false) && isPiano;
      let prepared: Note[] = notes.map((n) => ({
        ...n,
        pitch: def.drumKit ? resolveDrumPitch(n.pitch) : n.pitch,
        velocity: n.velocity === 0 ? 0 : Math.max(1, Math.min(127, Math.round(n.velocity * scale))),
      }));
      // Keys the game offers for this instrument (the drum kit keeps its pieces)
      if (!def.drumKit) prepared = clampNotes(prepared, def.percussion ? 0 : options.transpose, def.minPitch, def.maxPitch);
      prepared = processVelocity(prepared, options);
      for (const n of prepared) {
        g.notes.push({
          pitch: n.pitch,
          technique: techniqueByte(n, def, trackSustain),
          velocity: n.velocity,
          startMs: n.startTick * msPerTick,
          durationMs: Math.max(1, n.durationTicks) * msPerTick,
        });
      }
    }
  }

  // Same key at the same time on one instrument: keep the longest
  const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const processedGroups = ordered.map(([code, g]) => {
    const unique = new Map<string, ExportNote>();
    for (const n of g.notes) {
      const key = `${n.pitch}-${Math.round(n.startMs * 10)}`;
      const existing = unique.get(key);
      if (!existing || n.durationMs > existing.durationMs) unique.set(key, n);
    }
    const sorted = [...unique.values()].sort((a, b) => a.startMs - b.startMs || a.pitch - b.pitch);
    const chunkLimit = options.maxChunkNotes || 730;
    const chunks: ExportNote[][] = [];
    for (let i = 0; i < sorted.length; i += chunkLimit) chunks.push(sorted.slice(i, i + chunkLimit));
    return { instId: code, volume: g.volume || 100, auxSend: g.auxSend, tracks: chunks };
  });
  if (processedGroups.length === 0) {
    processedGroups.push({ instId: FULL_BDO_INSTRUMENTS['Florchestra Piano'], volume: 100, auxSend: true, tracks: [] });
  }

  const totalNoteCount = processedGroups.reduce((acc, g) => acc + g.tracks.reduce((a, c) => a + c.length, 0), 0);
  const buffer = new ArrayBuffer(Math.max(16384, HEADER_SIZE + 4096 + totalNoteCount * 28));
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, options.ownerId, true);
  offset += 4;
  view.setUint32(offset, 0, true);
  offset += 4;

  // Offset 0x008 (bytes 8..69): composer; offset 0x046 (bytes 70..131): arranger.
  // Original songs use the character name for both; imported/protected songs keep the original composer.
  const compName = (options.composerName || options.charName || song.author || 'Composer').trim();
  const arrName = (options.arrangerName || options.charName || song.author || compName).trim();
  new Uint8Array(buffer, offset, 62).set(encodeNameUTF16LE(compName));
  offset += 62;
  new Uint8Array(buffer, offset, 62).set(encodeNameUTF16LE(arrName));
  offset += 62;

  view.setUint16(offset, song.bpm, true);
  offset += 2;
  view.setUint16(offset, song.timeSignature[0], true);
  offset += 2;

  const instTag = processedGroups.map((g) => g.instId).join(',');
  for (let i = 0; i < instTag.length; i++) view.setUint8(offset++, instTag.charCodeAt(i));

  offset = HEADER_SIZE;

  const fx = options.effector;
  const pct = (v: number | undefined, fallback: number) => Math.min(100, Math.max(0, Math.round(v ?? fallback)));

  processedGroups.forEach((group, gIndex) => {
    if (gIndex === 0) {
      view.setUint8(offset++, 0x00);
      view.setUint16(offset, processedGroups.length, true);
      offset += 2;
    }
    view.setUint16(offset, group.tracks.length + 1, true);
    offset += 2;

    const writeTrack = (notes: ExportNote[]) => {
      view.setUint16(offset, 2 + 8 + 2 + notes.length * 20, true);
      offset += 2;
      // Instrument code (low byte) and volume 0..100 (high byte)
      view.setUint16(offset, (group.instId & 0xff) | ((group.volume & 0xff) << 8), true);
      offset += 2;

      // Effector: reverb send, reverb time, delay send, delay time, chorus send, feedback, depth, rate
      view.setUint8(offset++, group.auxSend && fx?.reverb?.enabled ? pct(fx.reverb.mix, 40) : 0);
      view.setUint8(offset++, pct(fx?.reverb?.time, 20));
      view.setUint8(offset++, group.auxSend && fx?.delay?.enabled ? pct(fx.delay.mix, 30) : 0);
      view.setUint8(offset++, pct(fx?.delay?.feedback ?? fx?.delay?.time, 10));
      view.setUint8(offset++, group.auxSend && fx?.chorus?.enabled ? pct(fx.chorus.mix, 30) : 0);
      view.setUint8(offset++, pct(fx?.chorus?.feedback, 20));
      view.setUint8(offset++, pct(fx?.chorus?.lfoDepth, 30));
      view.setUint8(offset++, pct(fx?.chorus?.lfoFrequency, 20));

      view.setUint16(offset, notes.length, true);
      offset += 2;
      for (const n of notes) {
        // pitch, technique, velocity (twice), start ms (f64), duration ms (f64)
        view.setUint8(offset++, n.pitch & 0x7f);
        view.setUint8(offset++, n.technique & 0xff);
        view.setUint8(offset++, n.velocity & 0x7f);
        view.setUint8(offset++, n.velocity & 0x7f);
        view.setFloat64(offset, n.startMs, true);
        offset += 8;
        view.setFloat64(offset, n.durationMs, true);
        offset += 8;
      }
    };

    group.tracks.forEach((chunk) => writeTrack(chunk));
    writeTrack([]);
  });

  const remainder = offset % 8;
  if (remainder > 0) offset += 8 - remainder;

  const ciphertext = encryptIce(new Uint8Array(buffer, 0, offset));
  const finalBuffer = new ArrayBuffer(4 + ciphertext.length);
  new DataView(finalBuffer).setUint32(0, BDO_VERSION, true);
  new Uint8Array(finalBuffer, 4).set(ciphertext);
  return new Blob([finalBuffer], { type: 'application/octet-stream' });
}
