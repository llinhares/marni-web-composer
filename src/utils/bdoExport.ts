import type { Track, Note, SongContext, EffectorSettings, InstrumentType } from '@/types';

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

export const FULL_BDO_INSTRUMENTS: Record<string, number> = {
  'Beginner Guitar': 0x00, 'Beginner Flute': 0x01, 'Beginner Recorder': 0x02, 'Hand Drum': 0x04,
  'Cymbals': 0x05, 'Beginner Harp': 0x06, 'Beginner Piano': 0x07, 'Beginner Violin': 0x08,
  'Florchestra Acoustic Guitar': 0x0a, 'Florchestra Flute': 0x0b, 'Drum Set': 0x0d,
  'Marnibass': 0x0e, 'Florchestra Contrabass': 0x0f, 'Florchestra Harp': 0x10,
  'Florchestra Piano': 0x11, 'Florchestra Violin': 0x12, 'Handpan': 0x13,
  'Marnian Wavy Planet': 0x14, 'Marnian Illusion Tree': 0x18, 'Marnian Secret Note': 0x1c,
  'Marnian Sandwich': 0x20, 'Guitar Silver Wave': 0x24, 'Guitar Highway': 0x25,
  'Guitar Hexe Glam': 0x26, 'Florchestra Clarinet': 0x27, 'Florchestra Horn': 0x28,
};

export const BDO_PERCUSSION_IDS = [0x04, 0x05, 0x0d];

export function getDefaultBdoInstrument(baseType: InstrumentType): string {
  switch (baseType) {
    case 'Tamborim': return 'Hand Drum';
    case 'Kit de Bateria': return 'Drum Set';
    case 'Pratos': return 'Cymbals';
    case 'Handpan': return 'Handpan';
    case 'Grand Piano': return 'Florchestra Piano';
    case 'Violão Acústico': return 'Florchestra Acoustic Guitar';
    case 'Contrabaixo': return 'Florchestra Contrabass';
    case 'Harpa': return 'Florchestra Harp';
    case 'Violino': return 'Florchestra Violin';
    case 'Flauta Transversal': return 'Florchestra Flute';
    case 'Clarinete': return 'Florchestra Clarinet';
    case 'Trompa': return 'Florchestra Horn';
    case 'Guitarra Silver Wave': return 'Guitar Silver Wave';
    case 'Guitarra Highway': return 'Guitar Highway';
    case 'Guitarra Hexe Glam': return 'Guitar Hexe Glam';
    case 'Marnibass': return 'Marnibass';
    case 'Marnian Wavy Planet': return 'Marnian Wavy Planet';
    case 'Marnian Illusion Tree': return 'Marnian Illusion Tree';
    case 'Marnian Secret Note': return 'Marnian Secret Note';
    case 'Marnian Sandwich': return 'Marnian Sandwich';
    case 'Piano de Iniciante': return 'Beginner Piano';
    case 'Violão de Iniciante': return 'Beginner Guitar';
    case 'Harpa de Iniciante': return 'Beginner Harp';
    case 'Violino de Iniciante': return 'Beginner Violin';
    case 'Flauta de Iniciante': return 'Beginner Flute';
    case 'Flauta Doce de Iniciante': return 'Beginner Recorder';
    default: return 'Florchestra Piano';
  }
}

const DRUM_NAME_TO_BDO: Record<string, number> = {
  'Kck': 48, 'SnrSide': 51, 'SnrHit': 50, 'RimShot': 51, 'SnrFlam': 50,
  'Tom1': 53, 'HihatC': 54, 'Tom2': 55, 'HatPdl': 56, 'Tom3': 57,
  'HihatO': 58, 'Tom4': 59, 'Tom5': 60, 'CymCrsh': 61, 'CymRide': 62,
  'SnrRollS': 50, 'SnrRollL': 50
};

const GM_NUM_TO_BDO: Record<number, number> = {
  35: 48, 36: 48, 37: 51, 38: 50, 39: 50, 40: 50,
  41: 53, 42: 54, 43: 55, 44: 56, 45: 57, 46: 58,
  47: 59, 48: 60, 49: 61, 50: 60, 51: 62, 52: 61,
  53: 62, 54: 61, 55: 61, 56: 51, 57: 61, 58: 51, 59: 62
};

export function resolveDrumPitch(pitch: string | number): number {
  if (typeof pitch === 'string') {
    if (DRUM_NAME_TO_BDO[pitch] !== undefined) return DRUM_NAME_TO_BDO[pitch];
    const parsed = parseInt(pitch, 10);
    if (!isNaN(parsed)) {
      if (parsed >= 48 && parsed <= 64) return parsed;
      if (GM_NUM_TO_BDO[parsed]) return GM_NUM_TO_BDO[parsed];
      return 48;
    }
    try {
      const idx = getPitchIndex(pitch);
      if (GM_NUM_TO_BDO[idx]) return GM_NUM_TO_BDO[idx];
      if (idx >= 48 && idx <= 64) return idx;
    } catch {
      // ignore
    }
  } else if (typeof pitch === 'number') {
    if (pitch >= 48 && pitch <= 64) return pitch;
    if (GM_NUM_TO_BDO[pitch]) return GM_NUM_TO_BDO[pitch];
  }
  return 48;
}

export interface ExportOptions {
  charName: string; ownerId: number; transpose: number;
  velMode: 'layered' | 'stepped' | 'rescale' | 'floor' | 'off';
  velStepBase: number; velStepStep: number;
  velRescaleMin: number; velRescaleMax: number; velFloorVal: number;
  instrumentOverrides: Record<string, string>; 
  velocityScales: Record<string, number>;      
  effector: EffectorSettings;                 
  maxChunkNotes?: number;
}

const BDO_VERSION = 9;
const HEADER_SIZE = 0x150;
const BDO_NOTE_MIN = 24;
const BDO_NOTE_MAX = 108;

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

function clampNotes(notes: Note[], transpose: number): Note[] {
  return notes.map(n => {
    let p = getPitchIndex(n.pitch) + transpose;
    if (p < BDO_NOTE_MIN) p = p + 12 * Math.floor((BDO_NOTE_MIN - p + 11) / 12);
    else if (p > BDO_NOTE_MAX) p = p - 12 * Math.floor((p - BDO_NOTE_MAX + 11) / 12);
    p = Math.max(BDO_NOTE_MIN, Math.min(BDO_NOTE_MAX, p));
    return { ...n, pitch: p.toString() }; 
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

export function exportToBdo(tracks: Track[], song: SongContext, options: ExportOptions): Blob {
  const mergedNotesByInst: Record<number, { notes: Note[], volume: number }> = {};
  
  tracks.forEach(t => {
    if (t.notes.length === 0 || t.isMuted) return; 
    
    const finalInstName = options.instrumentOverrides[t.id] || getDefaultBdoInstrument(t.instrument);
    const instId = FULL_BDO_INSTRUMENTS[finalInstName] ?? FULL_BDO_INSTRUMENTS['Florchestra Piano'];
    const isPerc = BDO_PERCUSSION_IDS.includes(instId);
    
    const msFactor = 60000 / (song.bpm * 480);
    const scaleFactor = (options.velocityScales[t.id] ?? 100) / 100;
    
    let processedNotes = t.notes.map(n => {
      let finalPitch = n.pitch;
      if (isPerc) {
        finalPitch = resolveDrumPitch(n.pitch).toString();
      }
      return {
        ...n,
        pitch: finalPitch,
        startTick: n.startTick * msFactor, 
        durationTicks: Math.max(60, n.durationTicks * msFactor), // Ensure minimum duration floor against ghost notes
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity * scaleFactor)))
      };
    });
    
    if (!isPerc) processedNotes = clampNotes(processedNotes, options.transpose);
    processedNotes = processVelocity(processedNotes, options);
    
    if (!mergedNotesByInst[instId]) {
      mergedNotesByInst[instId] = { notes: [], volume: t.volume ?? 70 };
    }
    mergedNotesByInst[instId].notes.push(...processedNotes);
  });

  const processedGroups: { instId: number, volume: number, tracks: Note[][] }[] = [];
  
  Object.entries(mergedNotesByInst).forEach(([idStr, groupData]) => {
    const instId = parseInt(idStr);
    groupData.notes.sort((a, b) => a.startTick - b.startTick);
    
    const chunks: Note[][] = [];
    const chunkLimit = options.maxChunkNotes || 730;
    for (let i = 0; i < groupData.notes.length; i += chunkLimit) {
      chunks.push(groupData.notes.slice(i, i + chunkLimit));
    }
    processedGroups.push({ instId, volume: groupData.volume, tracks: chunks });
  });

  if (processedGroups.length === 0) {
    processedGroups.push({ instId: FULL_BDO_INSTRUMENTS['Florchestra Piano'], volume: 70, tracks: [] });
  }

  const totalNoteCount = Object.values(mergedNotesByInst).reduce((acc, g) => acc + g.notes.length, 0);
  const estimatedBufferSize = Math.max(16384, HEADER_SIZE + 4096 + (totalNoteCount * 28));
  const buffer = new ArrayBuffer(estimatedBufferSize); 
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, options.ownerId, true); offset += 4;
  view.setUint32(offset, 0, true); offset += 4;
  
  const charNameBuf = encodeNameUTF16LE(options.charName);
  new Uint8Array(buffer, offset, 62).set(charNameBuf); offset += 62;
  new Uint8Array(buffer, offset, 62).set(charNameBuf); offset += 62;
  
  view.setUint16(offset, song.bpm, true); offset += 2;
  view.setUint16(offset, song.timeSignature[0], true); offset += 2;

  const instTag = processedGroups.map(g => g.instId).join(',');
  for (let i = 0; i < instTag.length; i++) {
    view.setUint8(offset++, instTag.charCodeAt(i));
  }
  
  offset = HEADER_SIZE; 

  processedGroups.forEach((group, gIndex) => {
    const isFirstGroup = (gIndex === 0);
    const trackCount = group.tracks.length + 1; 
    const isPercGroup = BDO_PERCUSSION_IDS.includes(group.instId);
    
    if (isFirstGroup) {
      view.setUint8(offset++, 0x00);
      view.setUint16(offset, processedGroups.length, true); offset += 2;
    }
    view.setUint16(offset, trackCount, true); offset += 2;

    const writeTrack = (notes: Note[]) => {
      const dataSize = 2 + 8 + 2 + notes.length * 20;
      const vol127 = Math.min(127, Math.max(1, Math.round((group.volume ?? 70) * 1.27)));
      const trackMarker = group.instId | (vol127 << 8); 
      
      view.setUint16(offset, dataSize, true); offset += 2;
      view.setUint16(offset, trackMarker, true); offset += 2;
      
      view.setUint8(offset++, 0); 
      view.setUint8(offset++, options.effector.reverbTime); 
      view.setUint8(offset++, 0); 
      view.setUint8(offset++, options.effector.delayFeedback); 
      view.setUint8(offset++, 0); 
      view.setUint8(offset++, options.effector.chorusFeedback); 
      view.setUint8(offset++, options.effector.chorusDepth); 
      view.setUint8(offset++, options.effector.chorusFreq); 
      
      view.setUint16(offset, notes.length, true); offset += 2;

      notes.forEach(n => {
        const p = isPercGroup 
          ? resolveDrumPitch(n.pitch) 
          : (typeof n.pitch === 'string' ? parseInt(n.pitch, 10) : n.pitch); 
        
        view.setUint8(offset++, p & 0x7F);
        view.setUint8(offset++, isPercGroup ? 99 : 0);
        view.setUint8(offset++, n.velocity & 0x7F);
        view.setUint8(offset++, n.velocity & 0x7F);
        view.setFloat64(offset, n.startTick, true); offset += 8;
        view.setFloat64(offset, n.durationTicks, true); offset += 8;
      });
    };

    group.tracks.forEach(chunk => writeTrack(chunk));
    writeTrack([]); 
  });

  const remainder = offset % 8;
  if (remainder > 0) offset += (8 - remainder); 

  const plaintext = new Uint8Array(buffer, 0, offset);
  const ciphertext = encryptIce(plaintext);

  const finalBuffer = new ArrayBuffer(4 + ciphertext.length);
  const finalView = new DataView(finalBuffer);
  finalView.setUint32(0, BDO_VERSION, true);
  new Uint8Array(finalBuffer, 4).set(ciphertext);

  return new Blob([finalBuffer], { type: 'application/octet-stream' });
}