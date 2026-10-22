/**
 * Note editing operations (pure functions on note arrays).
 * Every operation returns new note objects for the notes it changes and keeps the others as they are.
 */

import type { Note } from '../types/music.ts';

export const EDIT_PITCH_MIN = 12; // C0 (BDO lowest)
export const EDIT_PITCH_MAX = 119; // B8 (BDO highest)

export interface NoteClipboard {
  /** Notes with startTick relative to the earliest copied note. */
  notes: Omit<Note, 'id' | 'trackId'>[];
  spanTicks: number;
}

export function copyNotes(notes: Note[]): NoteClipboard | null {
  if (notes.length === 0) return null;
  const origin = Math.min(...notes.map((n) => n.startTick));
  const end = Math.max(...notes.map((n) => n.startTick + n.durationTicks));
  return {
    notes: notes.map(({ id: _id, trackId: _t, selected: _s, ...rest }) => ({ ...rest, startTick: rest.startTick - origin })),
    spanTicks: end - origin,
  };
}

/** Pasted notes, selected, starting at `atTick`. */
export function pasteNotes(clip: NoteClipboard, atTick: number, trackId: string, makeId: () => string): Note[] {
  return clip.notes.map((n) => ({
    ...n,
    id: makeId(),
    trackId,
    startTick: Math.max(0, Math.round(atTick + n.startTick)),
    selected: true,
  }));
}

/** Moves notes by ticks/semitones; the whole group stops at the timeline start and the pitch limits. */
export function moveNotes(notes: Note[], ids: Set<string>, dTicks: number, dPitch: number): Note[] {
  const moving = notes.filter((n) => ids.has(n.id));
  if (moving.length === 0) return notes;
  const minStart = Math.min(...moving.map((n) => n.startTick));
  const minPitch = Math.min(...moving.map((n) => n.pitch));
  const maxPitch = Math.max(...moving.map((n) => n.pitch));
  const dt = Math.max(-minStart, dTicks);
  const dp = Math.max(EDIT_PITCH_MIN - minPitch, Math.min(EDIT_PITCH_MAX - maxPitch, dPitch));
  if (dt === 0 && dp === 0) return notes;
  return notes.map((n) => (ids.has(n.id) ? { ...n, startTick: n.startTick + dt, pitch: n.pitch + dp } : n));
}

export interface QuantizeOptions {
  gridTicks: number;
  strength?: number; // 0..1 (1 = snap exactly)
  swing?: number; // 0..1: delays every second grid step by up to 2/3 of a step (triplet feel at 1)
  quantizeEnds?: boolean; // also snap note ends (keeps at least one grid step)
}

/** Grid position for a tick, honouring swing on odd steps. */
export function swungGridTick(tick: number, gridTicks: number, swing = 0): number {
  const step = Math.round(tick / gridTicks);
  const base = step * gridTicks;
  return step % 2 !== 0 ? base + (gridTicks * swing) / 3 : base;
}

export function quantizeNotes(notes: Note[], ids: Set<string>, opts: QuantizeOptions): Note[] {
  const { gridTicks, strength = 1, swing = 0, quantizeEnds = false } = opts;
  if (!(gridTicks > 0)) return notes;
  const s = Math.max(0, Math.min(1, strength));
  return notes.map((n) => {
    if (!ids.has(n.id)) return n;
    const target = swungGridTick(n.startTick, gridTicks, swing);
    const start = Math.max(0, Math.round(n.startTick + (target - n.startTick) * s));
    let duration = n.durationTicks;
    if (quantizeEnds) {
      const end = n.startTick + n.durationTicks;
      const targetEnd = Math.max(target + gridTicks, Math.round(end / gridTicks) * gridTicks);
      duration = Math.max(1, Math.round(end + (targetEnd - end) * s) - start);
    }
    return start === n.startTick && duration === n.durationTicks ? n : { ...n, startTick: start, durationTicks: duration };
  });
}

export interface HumanizeOptions {
  timingTicks: number; // max random offset of the start
  velocity: number; // max random velocity change
  random?: () => number; // injectable for tests
}

export function humanizeNotes(notes: Note[], ids: Set<string>, opts: HumanizeOptions): Note[] {
  const rnd = opts.random ?? Math.random;
  const jitter = (amount: number) => Math.round((rnd() * 2 - 1) * amount);
  return notes.map((n) => {
    if (!ids.has(n.id)) return n;
    return {
      ...n,
      startTick: Math.max(0, n.startTick + jitter(opts.timingTicks)),
      velocity: Math.max(1, Math.min(127, n.velocity + jitter(opts.velocity))),
    };
  });
}

/** Bar-aligned range covering the given notes (used to loop a selection). */
export function barRangeOf(notes: Note[], ticksPerBar: number): { start: number; end: number } | null {
  if (notes.length === 0) return null;
  const start = Math.floor(Math.min(...notes.map((n) => n.startTick)) / ticksPerBar) * ticksPerBar;
  const end = Math.ceil(Math.max(...notes.map((n) => n.startTick + n.durationTicks)) / ticksPerBar) * ticksPerBar;
  return { start, end: Math.max(end, start + ticksPerBar) };
}
