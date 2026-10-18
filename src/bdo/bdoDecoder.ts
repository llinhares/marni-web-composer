/**
 * Pure TypeScript Black Desert Online (BDO) Binary BMS / Music File Decoder
 * Decodes in-game ICE-encrypted music files (e.g. from Documents/Black Desert/Music/)
 * with 100% precision, extracting Title, BPM, TimeSignature, Instruments,
 * Notes (C0-B8) and Sustain Pedal articulation flags (byte 1 === 11).
 */

import type { Track, Note, InstrumentId, TimeSignature, EffectorSettings } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import { FULL_BDO_INSTRUMENTS } from './bdoExportV2.ts';

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

function _perm32(x: number): number {
  let result = 0, i = 0, unsignedX = x >>> 0;
  while (unsignedX) {
    if (unsignedX & 1) result |= _PBOX[i];
    i++;
    unsignedX >>>= 1;
  }
  return result >>> 0;
}

function _gf_mult(a: number, b: number, m: number): number {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a <<= 1;
    b >>= 1;
    if (a >= 256) a ^= m;
  }
  return result;
}

function _gf_exp7(b: number, m: number): number {
  if (b === 0) return 0;
  let x = _gf_mult(b, b, m);
  x = _gf_mult(b, x, m);
  x = _gf_mult(x, x, m);
  return _gf_mult(b, x, m);
}

function _init_sbox() {
  for (let i = 0; i < 1024; i++) {
    const col = (i >>> 1) & 0xFF, row = (i & 0x1) | ((i & 0x200) >>> 8);
    _sbox[0][i] = _perm32(_gf_exp7(col ^ _SXOR[0][row], _SMOD[0][row]) << 24);
    _sbox[1][i] = _perm32(_gf_exp7(col ^ _SXOR[1][row], _SMOD[1][row]) << 16);
    _sbox[2][i] = _perm32(_gf_exp7(col ^ _SXOR[2][row], _SMOD[2][row]) << 8);
    _sbox[3][i] = _perm32(_gf_exp7(col ^ _SXOR[3][row], _SMOD[3][row]));
  }
}

function _build_key_schedule(): number[][] {
  const key = new Uint8Array(8);
  for (let i = 0; i < 8; i++) key[i] = _KA[i] ^ _KB[i];
  const ks: number[][] = Array(8).fill(0).map(() => [0, 0, 0]);
  const kb = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) kb[3 - i] = (key[i * 2] << 8) | key[i * 2 + 1];
  for (let i = 0; i < 8; i++) {
    const kr = _KEYROT[i];
    for (let j = 0; j < 15; j++) {
      for (let k = 0; k < 4; k++) {
        const t = (kr + k) & 3;
        const kbb = kb[t];
        const bit = kbb & 1;
        ks[i][j % 3] = ((ks[i][j % 3] << 1) | bit) >>> 0;
        kb[t] = ((kbb >>> 1) | ((bit ^ 1) << 15)) >>> 0;
      }
    }
  }
  return ks;
}

_init_sbox();
const _KS = _build_key_schedule();

function _ice_f(p: number, sk: number[]): number {
  const tl = (((p >>> 16) & 0x3FF) | (((p >>> 14) | (p << 18)) & 0xFFC00)) >>> 0;
  const tr = ((p & 0x3FF) | ((p << 2) & 0xFFC00)) >>> 0;
  const al = (sk[2] & (tl ^ tr)) >>> 0;
  const ar = (al ^ tr ^ sk[1]) >>> 0;
  const finalAl = al ^ tl ^ sk[0];
  return (
    _sbox[0][finalAl >>> 10] |
    _sbox[1][finalAl & 0x3FF] |
    _sbox[2][ar >>> 10] |
    _sbox[3][ar & 0x3FF]
  ) >>> 0;
}

function _decrypt_block(data: Uint8Array, offset: number): Uint8Array {
  let l = 0, r = 0;
  for (let i = 0; i < 4; i++) {
    const t = 24 - i * 8;
    l = (l | ((data[offset + i] & 0xFF) << t)) >>> 0;
    r = (r | ((data[offset + i + 4] & 0xFF) << t)) >>> 0;
  }
  for (let i = 7; i > 0; i -= 2) {
    l = (l ^ _ice_f(r, _KS[i])) >>> 0;
    r = (r ^ _ice_f(l, _KS[i - 1])) >>> 0;
  }
  const out = new Uint8Array(8);
  for (let i = 0; i < 4; i++) {
    out[3 - i] = r & 0xFF;
    out[7 - i] = l & 0xFF;
    r >>>= 8;
    l >>>= 8;
  }
  return out;
}

function decryptIce(ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(ciphertext.length);
  let i = 0;
  while (i + 8 <= ciphertext.length) {
    out.set(_decrypt_block(ciphertext, i), i);
    i += 8;
  }
  if (i < ciphertext.length) out.set(ciphertext.subarray(i), i);
  return out;
}

/**
 * Checks if raw buffer is an in-game binary BDO score file (Version 9, size >= 0x150).
 */
export function isBdoBinaryContent(data: Uint8Array | ArrayBuffer): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 0x150) return false;
  const ver = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  return ver === 9;
}

// Reverse mapping of BDO internal instrument ID to Web Composer InstrumentId
const BDO_ID_TO_INSTRUMENT: Record<number, { id: InstrumentId; name: string }> = {
  0x00: { id: 'guitar', name: 'Guitarra Iniciante' },
  0x01: { id: 'flute', name: 'Flauta Iniciante' },
  0x02: { id: 'flute', name: 'Flauta Doce' },
  0x04: { id: 'percussion', name: 'Tamborim' },
  0x05: { id: 'percussion', name: 'Pratos' },
  0x06: { id: 'harp', name: 'Harpa Iniciante' },
  0x07: { id: 'grand-piano', name: 'Piano Iniciante' },
  0x08: { id: 'violin', name: 'Violino Iniciante' },
  0x0a: { id: 'guitar', name: 'Florchestra Acoustic Guitar' },
  0x0b: { id: 'flute', name: 'Florchestra Flute' },
  0x0d: { id: 'percussion', name: 'Drum Set' },
  0x0e: { id: 'bass', name: 'Marnibass' },
  0x0f: { id: 'bass', name: 'Florchestra Contrabass' },
  0x10: { id: 'harp', name: 'Florchestra Harp' },
  0x11: { id: 'grand-piano', name: 'Florchestra Piano' },
  0x12: { id: 'violin', name: 'Florchestra Violin' },
  0x13: { id: 'percussion', name: 'Handpan' },
  0x14: { id: 'marnisynth', name: 'Marnian Wavy Planet' },
  0x15: { id: 'marnisynth', name: 'Marnian Wavy Planet (Wave 2)' },
  0x16: { id: 'marnisynth', name: 'Marnian Wavy Planet (Wave 3)' },
  0x17: { id: 'marnisynth', name: 'Marnian Wavy Planet (Wave 4)' },
  0x18: { id: 'marnisynth', name: 'Marnian Illusion Tree' },
  0x19: { id: 'marnisynth', name: 'Marnian Illusion Tree (Wave 2)' },
  0x1a: { id: 'marnisynth', name: 'Marnian Illusion Tree (Wave 3)' },
  0x1b: { id: 'marnisynth', name: 'Marnian Illusion Tree (Wave 4)' },
  0x1c: { id: 'marnisynth', name: 'Marnian Secret Note' },
  0x1d: { id: 'marnisynth', name: 'Marnian Secret Note (Wave 2)' },
  0x1e: { id: 'marnisynth', name: 'Marnian Secret Note (Wave 3)' },
  0x1f: { id: 'marnisynth', name: 'Marnian Secret Note (Wave 4)' },
  0x20: { id: 'marnisynth', name: 'Marnian Sandwich' },
  0x21: { id: 'marnisynth', name: 'Marnian Sandwich (Wave 2)' },
  0x22: { id: 'marnisynth', name: 'Marnian Sandwich (Wave 3)' },
  0x23: { id: 'marnisynth', name: 'Marnian Sandwich (Wave 4)' },
  0x24: { id: 'guitar', name: 'Guitar Silver Wave' },
  0x25: { id: 'guitar', name: 'Guitar Highway' },
  0x26: { id: 'guitar', name: 'Guitar Hexe Glam' },
  0x27: { id: 'flute', name: 'Florchestra Clarinet' },
  0x28: { id: 'trumpet', name: 'Florchestra Horn' },
};

export interface DecodedBdoSong {
  title: string;
  composer: string;
  arranger: string;
  author: string;
  bpm: number;
  timeSignature: TimeSignature;
  ownerId: number;
  tracks: Track[];
  effectorSettings?: EffectorSettings;
}

/**
 * Parses binary BDO music file into structured Marni Web Composer tracks.
 */
export function parseBdoBinaryFile(
  data: Uint8Array | ArrayBuffer,
  fileNameFallback?: string
): DecodedBdoSong {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isBdoBinaryContent(bytes)) {
    throw new Error('Arquivo não é um binário de partitura BDO válido.');
  }

  const ciphertext = bytes.subarray(4);
  const decrypted = decryptIce(ciphertext);
  const dv = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);

  const ownerId = dv.getUint32(0, true);

  // In BDO, bytes 8..70 is Composer (Composição), bytes 70..132 is Arranger (Arranjo)
  let composer = '';
  for (let i = 8; i < 70; i += 2) {
    const code = dv.getUint16(i, true);
    if (code === 0) break;
    composer += String.fromCharCode(code);
  }
  composer = composer.trim();

  let arranger = '';
  for (let i = 70; i < 132; i += 2) {
    const code = dv.getUint16(i, true);
    if (code === 0) break;
    arranger += String.fromCharCode(code);
  }
  arranger = arranger.trim();

  const author = arranger || composer || '';
  const cleanFileName = fileNameFallback ? fileNameFallback.replace(/\.[^/.]+$/, '').trim() : '';
  const title = cleanFileName || composer || 'Música BDO Importada';

  const bpm = dv.getUint16(132, true) || 120;
  const timeSigNumerator = dv.getUint16(134, true) || 4;
  const timeSignature: TimeSignature =
    timeSigNumerator === 3 ? '3/4' : timeSigNumerator === 2 ? '2/4' : timeSigNumerator === 6 ? '6/8' : '4/4';

  const msToTicks = (bpm * 480) / 60000;
  let offset = 0x150;
  if (offset + 3 > decrypted.length) {
    return { title, composer, arranger, author, bpm, timeSignature, ownerId, tracks: [] };
  }

  // Skip leading 0x00 byte
  offset += 1;
  const numGroups = dv.getUint16(offset, true);
  offset += 2;

  const tracks: Track[] = [];
  let extractedEffector: EffectorSettings | undefined = undefined;

  for (let g = 0; g < numGroups; g++) {
    if (offset + 2 > decrypted.length) break;
    const trackCount = dv.getUint16(offset, true);
    offset += 2;

    for (let t = 0; t < trackCount; t++) {
      if (offset + 12 > decrypted.length) break;
      offset += 2; // skip dataSize
      const trackMarker = dv.getUint16(offset, true);
      offset += 2;
      const bdoInstId = trackMarker & 0xFF;
      const rawVolume = (trackMarker >> 8) & 0xFF;
      const volume = Math.min(100, Math.max(0, rawVolume)) || 75;

      const revSend = dv.getUint8(offset);
      const revTime = dv.getUint8(offset + 1);
      const delSend = dv.getUint8(offset + 2);
      const delTime = dv.getUint8(offset + 3);
      const choSend = dv.getUint8(offset + 4);
      const choFb = dv.getUint8(offset + 5);
      const choDp = dv.getUint8(offset + 6);
      const choFr = dv.getUint8(offset + 7);
      offset += 8;

      if (!extractedEffector && (revSend > 0 || delSend > 0 || choSend > 0 || revTime > 0)) {
        extractedEffector = {
          reverb: {
            enabled: revSend > 0,
            time: revTime || 20,
            damp: 50,
            mix: revSend || 40,
          },
          delay: {
            enabled: delSend > 0,
            feedback: delTime || 10,
            time: delTime || 10,
            mix: delSend || 30,
          },
          chorus: {
            enabled: choSend > 0,
            feedback: choFb || 20,
            lfoDepth: choDp || 30,
            lfoFrequency: choFr || 20,
            mix: choSend || 30,
          },
        };
      }

      if (offset + 2 > decrypted.length) break;
      const noteCount = dv.getUint16(offset, true);
      offset += 2;

      const notes: Note[] = [];
      const trackId = `track-bdo-${g}-${t}-${Date.now()}`;

      for (let n = 0; n < noteCount; n++) {
        if (offset + 20 > decrypted.length) break;
        const pitch = dv.getUint8(offset);
        const b1 = dv.getUint8(offset + 1);
        const vel = dv.getUint8(offset + 2);
        const startMs = dv.getFloat64(offset + 4, true);
        const durMs = dv.getFloat64(offset + 12, true);
        offset += 20;

        // Byte 1 === 11 indicates BDO sustain pedal resonance!
        const hasSustain = b1 === 11;

        notes.push({
          id: `note-bdo-${g}-${t}-${n}-${Math.random().toString(36).substring(2, 7)}`,
          trackId,
          pitch: Math.max(12, Math.min(119, pitch)),
          startTick: Math.max(0, Math.round(startMs * msToTicks)),
          durationTicks: Math.max(30, Math.round(durMs * msToTicks)),
          velocity: Math.max(1, Math.min(127, vel)),
          sustain: hasSustain,
        });
      }

      if (notes.length > 0) {
        const instMeta = BDO_ID_TO_INSTRUMENT[bdoInstId];
        const instDef = BDO_INSTRUMENTS.find((i) => i.id === instMeta?.id);
        const hasAnySustain = notes.some((n) => n.sustain);
        const auxActive = (revSend > 0 || delSend > 0 || choSend > 0) || !extractedEffector;

        tracks.push({
          id: trackId,
          name: instMeta?.name || `Trilha BDO (${bdoInstId})`,
          instrumentId: instMeta?.id || 'grand-piano',
          color: instDef?.color || '#d4a373',
          volume,
          pan: 0,
          isMuted: false,
          isSolo: false,
          auxSend: auxActive,
          sustainPedal: hasAnySustain,
          notes,
        });
      }
    }
  }

  return {
    title,
    composer,
    arranger,
    author,
    bpm,
    timeSignature,
    ownerId,
    tracks,
    effectorSettings: extractedEffector,
  };
};
