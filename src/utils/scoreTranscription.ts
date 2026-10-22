/**
 * Sheet-music transcription, deterministic half.
 *
 * The vision model only reports what is printed on the page, measure by measure: note names with
 * the accidentals that are actually drawn, note values (quarter, eighth...), dots, tuplets, rests,
 * ties, voices, repeats and endings. Everything that is music theory is done here, exactly:
 *  - key signature and the "accidental lasts until the barline" rule (also across ties),
 *  - note onsets by adding up durations voice by voice (no beat arithmetic by the model),
 *  - measure validation (each voice must fill the time signature; pickup bars allowed),
 *  - repeat / volta / D.C. / D.S. / Fine / Coda expansion into playing order.
 */

import type { Note, TimeSignature } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';
import { newId } from './ids.ts';

// ---------------------------------------------------------------------------
// Model output format
// ---------------------------------------------------------------------------

export type DurationCode = 'w' | 'h' | 'q' | '8' | '16' | '32' | '64';

export interface ScoreEvent {
  /** Note names as printed, e.g. ["C4"], ["E4","G#4"] (chord); empty or omitted = rest. */
  notes?: string[];
  rest?: boolean;
  d: DurationCode;
  dots?: number;
  /** Tuplet ratio [actual, normal], e.g. [3, 2] for a triplet. */
  tuplet?: [number, number];
  /** This note is tied to the next note of the same pitch in this voice. */
  tie?: boolean;
  grace?: boolean;
}

export interface ScoreVoice {
  events: ScoreEvent[];
}

export interface ScoreStaff {
  /** 1 = upper staff (right hand), 2 = lower staff (left hand). */
  staff: number;
  clef?: 'treble' | 'bass' | 'alto' | 'tenor';
  voices: ScoreVoice[];
}

export interface ScoreMeasure {
  number: number;
  timeSignature?: string; // only when it changes here
  keyFifths?: number; // only when it changes here
  repeatStart?: boolean;
  repeatEnd?: boolean;
  repeatTimes?: number; // total plays of the repeated section (default 2)
  ending?: number[]; // volta brackets this measure belongs to, e.g. [1] or [1, 2]
  dynamic?: string; // pp, p, mp, mf, f, ff
  segno?: boolean;
  coda?: boolean; // the coda section starts here
  toCoda?: boolean; // "To Coda" sign at the end of this measure
  fine?: boolean;
  jump?: 'dc' | 'dc-al-fine' | 'dc-al-coda' | 'ds' | 'ds-al-fine' | 'ds-al-coda';
  staves: ScoreStaff[];
}

export interface ScoreJson {
  title?: string;
  bpm?: number;
  tempoText?: string;
  timeSignature?: string;
  keyFifths?: number; // +n sharps, -n flats
  measures: ScoreMeasure[];
}

// ---------------------------------------------------------------------------
// Pitch spelling
// ---------------------------------------------------------------------------

const LETTER_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export interface PrintedNote {
  letter: string;
  /** Accidental drawn next to the note (+2 x, +1 #, 0 natural, -1 b, -2 bb) or null when none is printed. */
  accidental: number | null;
  octave: number;
}

/** "C4", "F#5", "Bb3", "Bn4" (printed natural), "Cx4"/"C##4", "Ebb3". */
export function parsePrintedNote(token: string): PrintedNote | null {
  const m = /^\s*([A-Ga-g])(##|x|bb|#|♯|b|♭|n|♮)?(-?\d)\s*$/.exec(token);
  if (!m) return null;
  const acc = m[2];
  const accidental =
    acc === undefined
      ? null
      : acc === '#' || acc === '♯'
        ? 1
        : acc === '##' || acc === 'x'
          ? 2
          : acc === 'b' || acc === '♭'
            ? -1
            : acc === 'bb'
              ? -2
              : 0;
  return { letter: m[1].toUpperCase(), accidental, octave: Number(m[3]) };
}

/** Alteration (-1/0/+1) the key signature gives a letter. */
export function keyAlteration(fifths: number, letter: string): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, Math.min(7, fifths)).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, Math.min(7, -fifths)).includes(letter) ? -1 : 0;
  return 0;
}

export const midiOf = (letter: string, alteration: number, octave: number) =>
  (octave + 1) * 12 + LETTER_STEPS[letter] + alteration;

const KEY_NAMES_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
export function describeKey(fifths: number): string {
  const f = Math.max(-7, Math.min(7, Math.round(fifths)));
  const name = KEY_NAMES_MAJOR[f + 7];
  if (f === 0) return 'Dó maior / Lá menor (sem acidentes)';
  return `${name} maior (${Math.abs(f)} ${f > 0 ? (Math.abs(f) === 1 ? 'sustenido' : 'sustenidos') : Math.abs(f) === 1 ? 'bemol' : 'bemóis'})`;
}

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

const BASE_QUARTERS: Record<DurationCode, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125, '64': 0.0625 };

/** Length of an event in quarter notes (dots and tuplets applied). */
export function eventQuarters(e: ScoreEvent): number {
  if (e.grace) return 0;
  const base = BASE_QUARTERS[e.d] ?? 1;
  const dots = Math.max(0, Math.min(3, e.dots ?? 0));
  let q = base * (2 - 1 / 2 ** dots);
  if (e.tuplet && e.tuplet[0] > 0 && e.tuplet[1] > 0) q *= e.tuplet[1] / e.tuplet[0];
  return q;
}

export function measureQuarters(timeSignature: string): number {
  const [num, den] = timeSignature.split('/').map(Number);
  return num > 0 && den > 0 ? (num * 4) / den : 4;
}

const SUPPORTED_TS: TimeSignature[] = ['4/4', '3/4', '6/8', '2/4', '12/8'];

const DYNAMIC_VELOCITY: Record<string, number> = { ppp: 30, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 124 };

const TEMPO_WORDS: Array<[RegExp, number]> = [
  [/grave/i, 40],
  [/largo/i, 50],
  [/lento/i, 56],
  [/adagio/i, 66],
  [/andante/i, 84],
  [/moderato/i, 108],
  [/allegretto/i, 116],
  [/allegro/i, 132],
  [/vivace/i, 160],
  [/presto/i, 176],
];

export function tempoFrom(bpm: unknown, text: unknown): number {
  if (typeof bpm === 'number' && bpm >= 30 && bpm <= 300) return Math.round(bpm);
  if (typeof text === 'string') {
    const mark = /(\d{2,3})/.exec(text);
    if (mark && Number(mark[1]) >= 30 && Number(mark[1]) <= 300) return Number(mark[1]);
    for (const [re, value] of TEMPO_WORDS) if (re.test(text)) return value;
  }
  return 120;
}

// ---------------------------------------------------------------------------
// Repeats and jumps
// ---------------------------------------------------------------------------

/** Playing order of measure indices (0-based) after repeats, voltas and D.C./D.S. jumps. */
export function expandPlayingOrder(measures: ScoreMeasure[]): number[] {
  const order: number[] = [];
  const n = measures.length;
  let i = 0;
  let pass = 1; // pass number inside the current repeat section
  let sectionStart = 0;
  let jumped = false; // after a D.C./D.S. repeats are played once (standard practice)
  let jumpTarget: 'fine' | 'coda' | null = null;
  const repeatDone = new Set<number>(); // repeat-end measures already completed
  let guard = 0;

  while (i < n && guard++ < n * 20) {
    const m = measures[i];
    if (m.repeatStart && !(jumped && repeatDone.has(i))) {
      if (sectionStart !== i) pass = 1;
      sectionStart = i;
    }

    // Volta brackets: skip measures whose ending does not match this pass
    if (m.ending && m.ending.length > 0 && !m.ending.includes(jumped ? Math.max(...m.ending) : pass)) {
      i++;
      continue;
    }

    order.push(i);

    if (jumped && jumpTarget === 'fine' && m.fine) break;
    if (jumped && jumpTarget === 'coda' && m.toCoda) {
      const codaIdx = measures.findIndex((x, k) => k > i && x.coda);
      if (codaIdx < 0) break;
      i = codaIdx;
      jumpTarget = null;
      continue;
    }

    if (m.repeatEnd && !repeatDone.has(i)) {
      const times = Math.max(2, m.repeatTimes ?? 2);
      if (!jumped && pass < times) {
        pass++;
        i = sectionStart;
        continue;
      }
      repeatDone.add(i);
      pass = 1;
    }

    if (m.jump && !jumped) {
      jumped = true;
      jumpTarget = m.jump.endsWith('fine') ? 'fine' : m.jump.endsWith('coda') ? 'coda' : null;
      pass = 1;
      if (m.jump.startsWith('dc')) {
        i = 0;
      } else {
        const segno = measures.findIndex((x) => x.segno);
        i = segno >= 0 ? segno : 0;
      }
      sectionStart = i;
      continue;
    }
    i++;
  }
  return order;
}

// ---------------------------------------------------------------------------
// Building notes
// ---------------------------------------------------------------------------

export interface ScoreBuildResult {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  keySignature: string;
  notes: Note[];
  rightHandNotes: Note[];
  leftHandNotes: Note[];
  /** Measure numbers whose voices do not add up to the time signature (worth a second look). */
  measuresToReview: number[];
  warnings: string[];
  stats: {
    totalNotes: number;
    rightHandCount: number;
    leftHandCount: number;
    measures: number;
    durationTicks: number;
    highestPitch: number;
    lowestPitch: number;
  };
}

const EPS = 1 / 128;

/** True when every non-empty voice fills the bar (a short bar is accepted only where a pickup is possible). */
export function measureIsValid(m: ScoreMeasure, timeSignature: string, allowShort: boolean): boolean {
  const nominal = measureQuarters(m.timeSignature || timeSignature);
  const totals = m.staves.flatMap((s) => s.voices.map((v) => v.events.reduce((a, e) => a + eventQuarters(e), 0)));
  return !totals.some((t) => t > nominal + EPS || (t < nominal - EPS && !allowShort && t > 0));
}

/** Time signature in force at each measure number. */
export function timeSignatureAt(score: ScoreJson): Map<number, string> {
  const at = new Map<number, string>();
  let ts = score.timeSignature || '4/4';
  for (const m of score.measures) {
    if (m.timeSignature) ts = m.timeSignature;
    at.set(m.number, ts);
  }
  return at;
}

/** Checks every voice of every measure against its time signature (first and last bars may be short). */
export function findInvalidMeasures(score: ScoreJson): number[] {
  const at = timeSignatureAt(score);
  const last = score.measures.length - 1;
  return score.measures
    .filter((m, idx) => !measureIsValid(m, at.get(m.number) ?? '4/4', idx === 0 || idx === last))
    .map((m) => m.number);
}

export function buildScore(score: ScoreJson, targetTrackId: string, opts: { startTickOffset?: number } = {}): ScoreBuildResult {
  if (!score || !Array.isArray(score.measures) || score.measures.length === 0) {
    throw new Error('Nenhum compasso foi reconhecido na partitura.');
  }
  const measures = [...score.measures].sort((a, b) => a.number - b.number);
  const warnings: string[] = [];
  const measuresToReview = findInvalidMeasures({ ...score, measures });

  // Per-measure key, time signature, length and dynamic (in written order)
  let key = Math.max(-7, Math.min(7, Math.round(score.keyFifths ?? 0)));
  let ts = score.timeSignature && /^\d+\/\d+$/.test(score.timeSignature) ? score.timeSignature : '4/4';
  let velocity = 84;
  const info = measures.map((m, idx) => {
    if (typeof m.keyFifths === 'number') key = Math.max(-7, Math.min(7, Math.round(m.keyFifths)));
    if (m.timeSignature && /^\d+\/\d+$/.test(m.timeSignature)) ts = m.timeSignature;
    if (m.dynamic && DYNAMIC_VELOCITY[m.dynamic.toLowerCase()]) velocity = DYNAMIC_VELOCITY[m.dynamic.toLowerCase()];
    const nominal = measureQuarters(ts);
    const longest = Math.max(0, ...m.staves.flatMap((s) => s.voices.map((v) => v.events.reduce((a, e) => a + eventQuarters(e), 0))));
    // A short first bar is a pickup (anacrusis): it lasts only as long as its notes
    const quarters = idx === 0 && longest > 0 && longest < nominal - EPS ? longest : nominal;
    return { key, ts, quarters, velocity };
  });

  const order = expandPlayingOrder(measures);
  const offset = opts.startTickOffset ?? 0;
  const notes: Note[] = [];
  const right: Note[] = [];
  const left: Note[] = [];
  let tick = offset;
  // Open ties per staff/voice and written position: a tied-over note keeps its pitch across the barline
  const openTies = new Map<string, number>();

  for (const idx of order) {
    const m = measures[idx];
    const mi = info[idx];
    for (const staff of m.staves) {
      const hand: 'right' | 'left' = staff.staff >= 2 ? 'left' : 'right';
      // Accidentals last until the barline, per staff and per written position (letter + octave)
      const barAccidentals = new Map<string, number>();
      staff.voices.forEach((voice, voiceIdx) => {
        let q = 0;
        for (const e of voice.events) {
          const len = eventQuarters(e);
          const startTick = Math.round(tick + q * TICKS_PER_BEAT);
          const durTicks = Math.max(1, Math.round(len * TICKS_PER_BEAT));
          if (!e.rest && !e.grace && Array.isArray(e.notes)) {
            for (const token of e.notes) {
              const p = parsePrintedNote(token);
              if (!p) {
                warnings.push(`Compasso ${m.number}: nota ilegível "${token}" ignorada.`);
                continue;
              }
              const pos = `${p.letter}${p.octave}`;
              const tieKey = `${staff.staff}|${voiceIdx}|${pos}`;
              if (p.accidental !== null) barAccidentals.set(pos, p.accidental);
              const tiedPitch = p.accidental === null ? openTies.get(tieKey) : undefined;
              const pitch = tiedPitch ?? midiOf(p.letter, barAccidentals.get(pos) ?? keyAlteration(mi.key, p.letter), p.octave);
              if (e.tie) openTies.set(tieKey, pitch);
              else openTies.delete(tieKey);
              if (pitch < 0 || pitch > 127) continue;

              // Tie continuation: extend the note it is tied from instead of striking again
              const tied = [...(hand === 'left' ? left : right)]
                .reverse()
                .find((n) => n.pitch === pitch && (n as Note & { _tieOpen?: boolean })._tieOpen && n.startTick + n.durationTicks === startTick);
              if (tied) {
                tied.durationTicks += durTicks;
                (tied as Note & { _tieOpen?: boolean })._tieOpen = !!e.tie;
                continue;
              }
              const note: Note & { _tieOpen?: boolean } = {
                id: newId('note'),
                trackId: targetTrackId,
                pitch,
                startTick,
                durationTicks: durTicks,
                velocity: mi.velocity,
                _tieOpen: !!e.tie,
              };
              notes.push(note);
              (hand === 'left' ? left : right).push(note);
            }
          }
          q += len;
        }
      });
    }
    tick += Math.round(mi.quarters * TICKS_PER_BEAT);
  }

  for (const n of notes) delete (n as Note & { _tieOpen?: boolean })._tieOpen;
  if (notes.length === 0) throw new Error('Nenhuma nota musical foi reconhecida na partitura.');
  notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

  const firstTs = info[0]?.ts ?? '4/4';
  const timeSignature = (SUPPORTED_TS.includes(firstTs as TimeSignature) ? firstTs : '4/4') as TimeSignature;
  if (!SUPPORTED_TS.includes(firstTs as TimeSignature)) {
    warnings.push(`Fórmula de compasso ${firstTs} não é suportada pelo editor: as notas estão no tempo certo, mas a grade usa 4/4.`);
  }
  if (new Set(info.map((x) => x.ts)).size > 1) {
    warnings.push('A partitura muda de fórmula de compasso: o tempo das notas está correto, mas a grade usa a primeira fórmula.');
  }
  if (measuresToReview.length > 0) {
    warnings.push(`Revise ${measuresToReview.length === 1 ? 'o compasso' : 'os compassos'} ${measuresToReview.join(', ')}: as durações lidas não fecham com a fórmula de compasso.`);
  }

  const pitches = notes.map((n) => n.pitch);
  const end = Math.max(...notes.map((n) => n.startTick + n.durationTicks));
  return {
    title: (score.title || '').trim() || 'Partitura Importada',
    bpm: tempoFrom(score.bpm, score.tempoText),
    timeSignature,
    keySignature: describeKey(score.keyFifths ?? 0),
    notes,
    rightHandNotes: right.map((n) => ({ ...n })),
    leftHandNotes: left.map((n) => ({ ...n })),
    measuresToReview,
    warnings,
    stats: {
      totalNotes: notes.length,
      rightHandCount: right.length,
      leftHandCount: left.length,
      measures: order.length,
      durationTicks: end - offset,
      highestPitch: Math.max(...pitches),
      lowestPitch: Math.min(...pitches),
    },
  };
}

/** Replaces measures (by number) with re-read versions from a repair pass. */
export function mergeRepairedMeasures(score: ScoreJson, repaired: ScoreMeasure[]): ScoreJson {
  const byNumber = new Map(repaired.map((m) => [m.number, m]));
  return { ...score, measures: score.measures.map((m) => byNumber.get(m.number) ?? m) };
}
