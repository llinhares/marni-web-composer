/**
 * Marni Web Composer - Project file format (.marni)
 *
 * A .marni file is UTF-8 JSON holding everything needed to restore a session exactly:
 * tracks and notes, tempo/meter, editor settings, effects and BDO metadata.
 * The same structure is stored by the IndexedDB autosave.
 */

import type {
  EffectorSettings,
  GridSnap,
  InstrumentId,
  Note,
  TimeSignature,
  Track,
} from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';

export const PROJECT_FORMAT = 'marni-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.marni';
export const PROJECT_MIME = 'application/vnd.marni.project+json';

export type BdoGrade = 'F' | 'D' | 'C' | 'B' | 'A' | 'S';

/** Editable session state captured in a project. */
export interface ProjectState {
  title: string;
  author: string;
  bpm: number;
  timeSignature: TimeSignature;
  gridSnap: GridSnap;
  accidentals: 'sharp' | 'flat';
  scaleType: string;
  bdoGrade: BdoGrade;
  bdoOwnerId: number;
  effectorSettings: EffectorSettings;
  tracks: Track[];
  activeTrackId: string;
  bdoProtection: {
    isProtected: boolean;
    author: string;
    composer: string;
    arranger: string;
    ownerId: number | null;
  };
}

export interface ProjectFile extends ProjectState {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string; // ISO timestamp
  app: string;
}

const TIME_SIGNATURES: TimeSignature[] = ['4/4', '3/4', '6/8', '2/4', '12/8'];
const GRID_SNAPS: GridSnap[] = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64', '1/4T', '1/8T', '1/16T', 'off'];
const GRADES: BdoGrade[] = ['F', 'D', 'C', 'B', 'A', 'S'];

export const DEFAULT_EFFECTOR_SETTINGS: EffectorSettings = {
  reverb: { enabled: true, time: 65, damp: 40, mix: 45 },
  delay: { enabled: false, feedback: 35, time: 40, mix: 30 },
  chorus: { enabled: false, feedback: 20, lfoDepth: 40, lfoFrequency: 35, mix: 35 },
};

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

/** Strips view-only state (selection) so it never reaches the saved file or the undo comparisons. */
function cleanTracks(tracks: Track[]): Track[] {
  return tracks.map((t) => ({
    ...t,
    notes: t.notes.map(({ selected: _selected, ...n }) => ({ ...n, trackId: t.id })),
  }));
}

export function createProjectFile(state: ProjectState, now: Date = new Date()): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    app: 'Marni Web Composer',
    ...state,
    tracks: cleanTracks(state.tracks),
  };
}

export function serializeProject(state: ProjectState, now?: Date): string {
  return JSON.stringify(createProjectFile(state, now), null, 1);
}

/**
 * Stable fingerprint of the musical/session content (ignores selection and save time).
 * Used to know whether there are unsaved changes.
 */
/** JSON with object keys sorted at every level, so property order never changes the output. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function projectSignature(state: ProjectState): string {
  // Explicit field list: file-only fields (format, savedAt...) and key order never affect it
  return canonicalJson([
    state.title,
    state.author,
    state.bpm,
    state.timeSignature,
    state.gridSnap,
    state.accidentals,
    state.scaleType,
    state.bdoGrade,
    state.bdoOwnerId,
    state.activeTrackId,
    state.effectorSettings,
    state.bdoProtection,
    cleanTracks(state.tracks),
  ]);
}

export function isProjectFileContent(text: string): boolean {
  const head = text.slice(0, 400);
  return head.trimStart().startsWith('{') && head.includes(`"${PROJECT_FORMAT}"`);
}

// ---------------------------------------------------------------------------
// Parsing / validation
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

function parseEffector(raw: unknown): EffectorSettings {
  const d = DEFAULT_EFFECTOR_SETTINGS;
  const r = (raw ?? {}) as Partial<Record<keyof EffectorSettings, Record<string, unknown>>>;
  const rv = r.reverb ?? {};
  const dl = r.delay ?? {};
  const ch = r.chorus ?? {};
  return {
    reverb: {
      enabled: bool(rv.enabled, d.reverb.enabled),
      time: num(rv.time, d.reverb.time, 0, 100),
      damp: num(rv.damp, d.reverb.damp, 0, 100),
      mix: num(rv.mix, d.reverb.mix, 0, 100),
    },
    delay: {
      enabled: bool(dl.enabled, d.delay.enabled),
      feedback: num(dl.feedback, d.delay.feedback, 0, 100),
      time: num(dl.time, d.delay.time, 0, 100),
      mix: num(dl.mix, d.delay.mix, 0, 100),
    },
    chorus: {
      enabled: bool(ch.enabled, d.chorus.enabled),
      feedback: num(ch.feedback, d.chorus.feedback, 0, 100),
      lfoDepth: num(ch.lfoDepth, d.chorus.lfoDepth, 0, 100),
      lfoFrequency: num(ch.lfoFrequency, d.chorus.lfoFrequency, 0, 100),
      mix: num(ch.mix, d.chorus.mix, 0, 100),
    },
  };
}

function parseTrack(raw: unknown, index: number, usedIds: Set<string>): Track {
  const t = (raw ?? {}) as Record<string, unknown>;
  let id = str(t.id, '') || `track-${index + 1}`;
  while (usedIds.has(id)) id = `${id}-${index}`;
  usedIds.add(id);

  const instrumentId = oneOf(
    t.instrumentId,
    BDO_INSTRUMENTS.map((i) => i.id),
    'grand-piano'
  ) as InstrumentId;
  const inst = BDO_INSTRUMENTS.find((i) => i.id === instrumentId);

  const rawNotes = Array.isArray(t.notes) ? t.notes : [];
  const notes: Note[] = [];
  rawNotes.forEach((rn, ni) => {
    const n = (rn ?? {}) as Record<string, unknown>;
    const pitch = num(n.pitch, NaN, 0, 127);
    const startTick = num(n.startTick, NaN, 0);
    const durationTicks = num(n.durationTicks, NaN, 1);
    if (!Number.isFinite(pitch) || !Number.isFinite(startTick) || !Number.isFinite(durationTicks)) return;
    const note: Note = {
      id: str(n.id, '') || `${id}-n${ni}`,
      trackId: id,
      pitch: Math.round(pitch),
      startTick: Math.round(startTick),
      durationTicks: Math.round(durationTicks),
      velocity: Math.round(num(n.velocity, 95, 1, 127)),
    };
    if (typeof n.sustain === 'boolean') note.sustain = n.sustain;
    notes.push(note);
  });

  const track: Track = {
    id,
    name: str(t.name, inst?.name ?? `Faixa ${index + 1}`),
    instrumentId,
    color: str(t.color, inst?.color ?? '#d4a373'),
    volume: num(t.volume, inst?.defaultVolume ?? 75, 0, 100),
    pan: num(t.pan, 0, -1, 1),
    isMuted: bool(t.isMuted, false),
    isSolo: bool(t.isSolo, false),
    auxSend: bool(t.auxSend, true),
    notes,
  };
  if (typeof t.sustainPedal === 'boolean') track.sustainPedal = t.sustainPedal;
  return track;
}

/**
 * Parses and validates a .marni file. Unknown or invalid fields fall back to defaults so files from
 * older/newer versions still open; a file without tracks or of another format is rejected.
 */
export function parseProjectFile(text: string): ProjectFile {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('O arquivo de projeto está corrompido (JSON inválido).');
  }
  if (!raw || typeof raw !== 'object' || raw.format !== PROJECT_FORMAT) {
    throw new ProjectFormatError('Este arquivo não é um projeto do Marni Web Composer.');
  }
  const version = num(raw.version, 1);
  if (version > PROJECT_VERSION) {
    throw new ProjectFormatError(
      `Este projeto foi salvo por uma versão mais nova do Marni (formato v${version}). Atualize a página.`
    );
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) {
    throw new ProjectFormatError('O projeto não contém nenhuma faixa.');
  }

  const usedIds = new Set<string>();
  const tracks = raw.tracks.map((t, i) => parseTrack(t, i, usedIds));
  const activeTrackId = tracks.some((t) => t.id === raw.activeTrackId) ? String(raw.activeTrackId) : tracks[0].id;
  const prot = (raw.bdoProtection ?? {}) as Record<string, unknown>;

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: str(raw.savedAt, new Date(0).toISOString()),
    app: str(raw.app, 'Marni Web Composer'),
    title: str(raw.title, 'Sem título'),
    author: str(raw.author, ''),
    bpm: num(raw.bpm, 120, 20, 400),
    timeSignature: oneOf(raw.timeSignature, TIME_SIGNATURES, '4/4'),
    gridSnap: oneOf(raw.gridSnap, GRID_SNAPS, '1/4'),
    accidentals: oneOf(raw.accidentals, ['sharp', 'flat'] as const, 'sharp'),
    scaleType: str(raw.scaleType, 'chromatic'),
    bdoGrade: oneOf(raw.bdoGrade, GRADES, 'S'),
    bdoOwnerId: Math.round(num(raw.bdoOwnerId, 0, 0)),
    effectorSettings: parseEffector(raw.effectorSettings),
    tracks,
    activeTrackId,
    bdoProtection: {
      isProtected: bool(prot.isProtected, false),
      author: str(prot.author, ''),
      composer: str(prot.composer, ''),
      arranger: str(prot.arranger, ''),
      ownerId: typeof prot.ownerId === 'number' ? prot.ownerId : null,
    },
  };
}

/** File name for a project title: "Minha Música" -> "minha_musica.marni". */
export function projectFileName(title: string): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'projeto_marni';
  return `${base}${PROJECT_EXTENSION}`;
}
