/**
 * Playback scheduling helpers (pure, unit-tested).
 *
 * The scheduler asks, every ~20 ms, "which notes start inside [fromTick, toTick)?". Scanning every
 * note of every track each time is O(total notes); with notes sorted by start tick a binary search
 * finds the window in O(log n + notes in window).
 */

import type { Note, Track } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

const sortedCache = new WeakMap<Note[], Note[]>();

/** Notes of a track sorted by start tick. Cached per notes array (track edits create a new array). */
export function sortedByStart(notes: Note[]): Note[] {
  let sorted = sortedCache.get(notes);
  if (!sorted) {
    sorted = notes.slice().sort((a, b) => a.startTick - b.startTick);
    sortedCache.set(notes, sorted);
  }
  return sorted;
}

/** Index of the first note with startTick >= tick. */
export function lowerBoundByStart(sorted: Note[], tick: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].startTick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Notes starting inside [fromTick, toTick), in start order. */
export function notesInWindow(sorted: Note[], fromTick: number, toTick: number): Note[] {
  const out: Note[] = [];
  for (let i = lowerBoundByStart(sorted, fromTick); i < sorted.length && sorted[i].startTick < toTick; i++) {
    out.push(sorted[i]);
  }
  return out;
}

/** Tracks that are audible given mute/solo state. */
export function audibleTracks(tracks: Track[]): Track[] {
  const hasSolo = tracks.some((t) => t.isSolo);
  return tracks.filter((t) => !t.isMuted && (!hasSolo || t.isSolo));
}

/** End tick of the last note across all tracks. */
export function songEndTick(tracks: Track[]): number {
  let max = 0;
  for (const t of tracks) {
    for (const n of t.notes) {
      const end = n.startTick + n.durationTicks;
      if (end > max) max = end;
    }
  }
  return max;
}

/**
 * Tempo-anchored timeline: tick <-> audio-clock conversion around an anchor point.
 * Changing the tempo re-anchors at the current position so playback continues seamlessly.
 */
export interface TimelineAnchor {
  audioTime: number;
  tick: number;
  bpm: number;
}

export const tickAtTime = (a: TimelineAnchor, audioTime: number): number =>
  a.tick + ((audioTime - a.audioTime) * a.bpm * TICKS_PER_BEAT) / 60;

export const timeAtTick = (a: TimelineAnchor, tick: number): number =>
  a.audioTime + ((tick - a.tick) * 60) / (a.bpm * TICKS_PER_BEAT);

export function reanchor(a: TimelineAnchor, audioTime: number, bpm: number): TimelineAnchor {
  return { audioTime, tick: tickAtTime(a, audioTime), bpm };
}
