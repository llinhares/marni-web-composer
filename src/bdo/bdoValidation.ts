/**
 * Pre-export validation for Black Desert Online.
 *
 * The exporter silently adapts a song to what the game accepts (octave-folds notes outside C0–B8,
 * remaps drum pitches, drops duplicate notes, skips muted tracks, merges tracks that share an in-game
 * instrument). This module reports all of that before exporting, checks the rank limits, and offers
 * one-click fixes that apply the same changes to the project so the user hears what the game plays.
 */

import type { Note, TimeSignature, Track } from '../types/music.ts';
import { BDO_GRADE_LIMITS, BDO_INSTRUMENTS, TICKS_PER_BEAT } from '../types/music.ts';
import { BDO_PERCUSSION_IDS, FULL_BDO_INSTRUMENTS, getDefaultBdoInstrument, resolveDrumPitch } from './bdoExportV2.ts';

export const BDO_PITCH_MIN = 12; // C0
export const BDO_PITCH_MAX = 119; // B8
export const BDO_GRADES = ['F', 'D', 'C', 'B', 'A', 'S'] as const;
export type BdoGradeId = (typeof BDO_GRADES)[number];

export type BdoFixKind = 'fold-bdo-range' | 'fold-instrument-range' | 'map-drums' | 'remove-duplicates' | 'use-grade';
export type BdoIssueSeverity = 'error' | 'warning' | 'info';

export interface BdoIssue {
  id: string;
  severity: BdoIssueSeverity;
  title: string;
  detail: string;
  count: number;
  fix?: { kind: BdoFixKind; label: string; grade?: BdoGradeId };
}

export interface BdoValidationResult {
  issues: BdoIssue[];
  exportedNotes: number; // notes that will be written (after skipping muted tracks and dropping duplicates)
  bars: number;
  minGrade: BdoGradeId | null; // lowest rank that fits the song (null = no rank fits)
  canExport: boolean; // no errors
}

export interface BdoValidationOptions {
  grade: BdoGradeId;
  timeSignature: TimeSignature;
  instrumentOverrides?: Record<string, string>; // track id -> in-game instrument name (export dialog)
  /** Owner ID loaded from the user's character file (undefined = not checked). */
  ownerId?: number;
  /** Character/family name written as composer (undefined = not checked). */
  author?: string;
}

/** In-game instrument name a track is exported as (same rule as exportToBdo). */
export function bdoInstrumentName(track: Track, overrides: Record<string, string> = {}): string {
  return overrides[track.id] || getDefaultBdoInstrument(track.instrumentId || track.name);
}

export function isBdoPercussionTrack(track: Track, overrides: Record<string, string> = {}): boolean {
  const id = FULL_BDO_INSTRUMENTS[bdoInstrumentName(track, overrides)] ?? FULL_BDO_INSTRUMENTS['Florchestra Piano'];
  return BDO_PERCUSSION_IDS.includes(id);
}

/** Beats per bar for a time signature, in quarter notes (6/8 = 3 quarters). */
export function quartersPerBar(ts: TimeSignature): number {
  const [num, den] = ts.split('/').map(Number);
  return (num * 4) / den;
}

/** Numerator/denominator pair written to the BDO header. */
export function timeSignatureParts(ts: TimeSignature): [number, number] {
  const [num, den] = ts.split('/').map(Number);
  return [num || 4, den || 4];
}

/** Recommended (playable) range of an instrument as defined in the app's instrument table. */
export function instrumentRange(track: Track): { min: number; max: number } {
  const info = BDO_INSTRUMENTS.find((i) => i.id === track.instrumentId);
  return { min: info?.minPitch ?? BDO_PITCH_MIN, max: info?.maxPitch ?? BDO_PITCH_MAX };
}

/** Moves a pitch by whole octaves into [min, max] (keeps the pitch class). */
export function foldIntoRange(pitch: number, min: number, max: number): number {
  let p = pitch;
  while (p < min && p + 12 <= max) p += 12;
  while (p > max && p - 12 >= min) p -= 12;
  return Math.max(min, Math.min(max, p));
}

const isNativeDrumPitch = (p: number) => p >= 48 && p <= 64;
const drumIsMappable = (p: number) => isNativeDrumPitch(p) || resolveDrumPitch(p) !== 48 || p === 35 || p === 36;

const GRADE_NAMES = (g: BdoGradeId) => `Rank ${g}`;
/** "1 nota será movida" / "3 notas serão movidas" */
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function duplicateKeys(tracks: Track[], overrides: Record<string, string>): Map<string, { trackId: string; note: Note }[]> {
  const groups = new Map<string, { trackId: string; note: Note }[]>();
  for (const t of tracks) {
    if (t.isMuted) continue;
    const inst = bdoInstrumentName(t, overrides);
    for (const n of t.notes) {
      const key = `${inst}|${n.pitch}|${Math.round(n.startTick)}`;
      const list = groups.get(key);
      if (list) list.push({ trackId: t.id, note: n });
      else groups.set(key, [{ trackId: t.id, note: n }]);
    }
  }
  return groups;
}

export function validateForBdo(tracks: Track[], opts: BdoValidationOptions): BdoValidationResult {
  const overrides = opts.instrumentOverrides ?? {};
  const issues: BdoIssue[] = [];
  const exported = tracks.filter((t) => !t.isMuted && t.notes.length > 0);

  // Duplicates are dropped by the exporter (same in-game instrument, pitch and start)
  const dupGroups = duplicateKeys(tracks, overrides);
  let duplicates = 0;
  dupGroups.forEach((list) => (duplicates += list.length - 1));
  const exportedNotes = exported.reduce((acc, t) => acc + t.notes.length, 0) - duplicates;

  let songEnd = 0;
  for (const t of exported) for (const n of t.notes) songEnd = Math.max(songEnd, n.startTick + n.durationTicks);
  const ticksPerBar = quartersPerBar(opts.timeSignature) * TICKS_PER_BEAT;
  const bars = songEnd > 0 ? Math.ceil(songEnd / ticksPerBar) : 0;

  const fits = (g: BdoGradeId) => exportedNotes <= BDO_GRADE_LIMITS[g].maxNotes && bars <= BDO_GRADE_LIMITS[g].maxBars;
  const minGrade = BDO_GRADES.find(fits) ?? null;
  const limits = BDO_GRADE_LIMITS[opts.grade];
  const gradeFix = minGrade && minGrade !== opts.grade && !fits(opts.grade)
    ? { kind: 'use-grade' as const, label: `Usar ${GRADE_NAMES(minGrade)}`, grade: minGrade }
    : undefined;

  if (exportedNotes === 0) {
    issues.push({
      id: 'empty',
      severity: 'error',
      title: 'Nada para exportar',
      detail: 'Não há notas em faixas audíveis (faixas mutadas não são exportadas).',
      count: 0,
    });
  }

  if (exportedNotes > limits.maxNotes) {
    issues.push({
      id: 'grade-notes',
      severity: 'error',
      title: `Notas acima do limite do ${GRADE_NAMES(opts.grade)}`,
      detail: `${exportedNotes} notas para um limite de ${limits.maxNotes}.${
        minGrade ? '' : ` Nenhum rank comporta esta música: remova ${exportedNotes - BDO_GRADE_LIMITS.S.maxNotes} notas.`
      }`,
      count: exportedNotes - limits.maxNotes,
      fix: gradeFix,
    });
  }

  if (bars > limits.maxBars) {
    issues.push({
      id: 'grade-bars',
      severity: 'error',
      title: `Compassos acima do limite do ${GRADE_NAMES(opts.grade)}`,
      detail: `${bars} compassos (${opts.timeSignature}) para um limite de ${limits.maxBars}.${
        minGrade ? '' : ` Nenhum rank comporta esta duração: encurte ${bars - BDO_GRADE_LIMITS.S.maxBars} compassos.`
      }`,
      count: bars - limits.maxBars,
      fix: gradeFix,
    });
  }

  let outsideBdo = 0;
  let outsideInstrument = 0;
  let drumsRemapped = 0;
  let drumsToKick = 0;
  for (const t of exported) {
    if (isBdoPercussionTrack(t, overrides)) {
      for (const n of t.notes) {
        if (isNativeDrumPitch(n.pitch)) continue;
        if (drumIsMappable(n.pitch)) drumsRemapped++;
        else drumsToKick++;
      }
      continue;
    }
    const range = instrumentRange(t);
    for (const n of t.notes) {
      if (n.pitch < BDO_PITCH_MIN || n.pitch > BDO_PITCH_MAX) outsideBdo++;
      else if (n.pitch < range.min || n.pitch > range.max) outsideInstrument++;
    }
  }

  if (outsideBdo > 0) {
    issues.push({
      id: 'bdo-range',
      severity: 'warning',
      title: 'Notas fora da extensão do jogo (C0–B8)',
      detail: `${pl(outsideBdo, 'nota será movida', 'notas serão movidas')} de oitava na exportação.`,
      count: outsideBdo,
      fix: { kind: 'fold-bdo-range', label: 'Ajustar oitavas agora' },
    });
  }
  if (drumsToKick > 0) {
    issues.push({
      id: 'drums-unknown',
      severity: 'warning',
      title: 'Notas de percussão sem peça equivalente no BDO',
      detail: `${pl(drumsToKick, 'nota viraria', 'notas virariam')} bumbo (Kick) na exportação. Mova para as linhas de bateria do BDO (C3–E4).`,
      count: drumsToKick,
    });
  }
  if (drumsRemapped > 0) {
    issues.push({
      id: 'drums-gm',
      severity: 'warning',
      title: 'Percussão em mapeamento General MIDI',
      detail: `${pl(drumsRemapped, 'nota será convertida', 'notas serão convertidas')} para as peças de bateria do BDO.`,
      count: drumsRemapped,
      fix: { kind: 'map-drums', label: 'Converter agora' },
    });
  }
  if (duplicates > 0) {
    issues.push({
      id: 'duplicates',
      severity: 'warning',
      title: 'Notas duplicadas',
      detail: `${pl(duplicates, 'nota com mesma altura e início no mesmo instrumento do jogo será descartada', 'notas com mesma altura e início no mesmo instrumento do jogo serão descartadas')} (fica a mais longa).`,
      count: duplicates,
      fix: { kind: 'remove-duplicates', label: 'Remover duplicadas' },
    });
  }
  if (outsideInstrument > 0) {
    issues.push({
      id: 'instrument-range',
      severity: 'info',
      title: 'Notas fora da extensão recomendada do instrumento',
      detail: `${pl(outsideInstrument, 'nota está', 'notas estão')} fora da extensão definida para o instrumento da faixa.`,
      count: outsideInstrument,
      fix: { kind: 'fold-instrument-range', label: 'Ajustar oitavas' },
    });
  }

  if (opts.ownerId !== undefined && !(opts.ownerId > 0)) {
    issues.push({
      id: 'owner-id',
      severity: 'warning',
      title: 'Nenhum Owner ID carregado',
      detail:
        'Use "Carregar ID BDO" com um arquivo salvo pelo seu personagem (Documentos/Black Desert/Music) para o jogo reconhecer você como dono da partitura.',
      count: 0,
    });
  }
  if (opts.author !== undefined && !opts.author.trim()) {
    issues.push({
      id: 'author',
      severity: 'warning',
      title: 'Sem nome de autor',
      detail: 'Informe o nome do seu personagem ou família: ele aparece como compositor e arranjador no jogo.',
      count: 0,
    });
  }

  const muted = tracks.filter((t) => t.isMuted && t.notes.length > 0);
  if (muted.length > 0) {
    issues.push({
      id: 'muted',
      severity: 'info',
      title: 'Faixas mutadas não serão exportadas',
      detail: muted.map((t) => t.name).join(', '),
      count: muted.length,
    });
  }

  const byInstrument = new Map<string, Track[]>();
  for (const t of exported) {
    const name = bdoInstrumentName(t, overrides);
    byInstrument.set(name, [...(byInstrument.get(name) ?? []), t]);
  }
  byInstrument.forEach((list, name) => {
    if (list.length < 2) return;
    issues.push({
      id: `merge-${name}`,
      severity: 'info',
      title: `${list.length} faixas serão mescladas em ${name}`,
      detail: `${list.map((t) => t.name).join(', ')} — o jogo usa o volume da primeira faixa.`,
      count: list.length,
    });
  });

  const order: Record<BdoIssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, exportedNotes, bars, minGrade, canExport: !issues.some((i) => i.severity === 'error') };
}

/** Applies a fix to the song (returns new track objects; unchanged tracks keep their identity). */
export function applyBdoFix(
  tracks: Track[],
  kind: Exclude<BdoFixKind, 'use-grade'>,
  overrides: Record<string, string> = {}
): Track[] {
  if (kind === 'remove-duplicates') {
    const remove = new Set<Note>();
    duplicateKeys(tracks, overrides).forEach((list) => {
      if (list.length < 2) return;
      const keep = list.reduce((a, b) => (b.note.durationTicks > a.note.durationTicks ? b : a));
      list.forEach((e) => e !== keep && remove.add(e.note));
    });
    if (remove.size === 0) return tracks;
    return tracks.map((t) => (t.notes.some((n) => remove.has(n)) ? { ...t, notes: t.notes.filter((n) => !remove.has(n)) } : t));
  }

  return tracks.map((t) => {
    const perc = isBdoPercussionTrack(t, overrides);
    let changed = false;
    const notes = t.notes.map((n) => {
      let pitch = n.pitch;
      if (kind === 'map-drums' && perc && !isNativeDrumPitch(pitch) && drumIsMappable(pitch)) {
        pitch = resolveDrumPitch(pitch);
      } else if (kind === 'fold-bdo-range' && !perc) {
        pitch = foldIntoRange(pitch, BDO_PITCH_MIN, BDO_PITCH_MAX);
      } else if (kind === 'fold-instrument-range' && !perc) {
        const r = instrumentRange(t);
        pitch = foldIntoRange(pitch, r.min, r.max);
      }
      if (pitch === n.pitch) return n;
      changed = true;
      return { ...n, pitch };
    });
    return changed ? { ...t, notes } : t;
  });
}
