/**
 * What one undo step restores, and how two steps are compared (selection is view state and ignored).
 */

import type { EffectorSettings, Note, TimeSignature, Track } from '../types/music.ts';

export interface SessionSnapshot {
  tracks: Track[];
  activeTrackId: string;
  bpm: number;
  timeSignature: TimeSignature;
  effectorSettings: EffectorSettings;
}

const TRACK_FIELDS: (keyof Track)[] = [
  'id',
  'name',
  'instrumentId',
  'color',
  'volume',
  'pan',
  'isMuted',
  'isSolo',
  'auxSend',
  'sustainPedal',
];

function notesEqual(a: Note[], b: Note[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (
      x.id !== y.id ||
      x.pitch !== y.pitch ||
      x.startTick !== y.startTick ||
      x.durationTicks !== y.durationTicks ||
      x.velocity !== y.velocity ||
      x.sustain !== y.sustain
    ) {
      return false;
    }
  }
  return true;
}

export function sessionSnapshotsEqual(a: SessionSnapshot, b: SessionSnapshot): boolean {
  if (
    a.activeTrackId !== b.activeTrackId ||
    a.bpm !== b.bpm ||
    a.timeSignature !== b.timeSignature ||
    JSON.stringify(a.effectorSettings) !== JSON.stringify(b.effectorSettings)
  ) {
    return false;
  }
  if (a.tracks === b.tracks) return true;
  if (a.tracks.length !== b.tracks.length) return false;
  return a.tracks.every((t, i) => {
    const u = b.tracks[i];
    return t === u || (TRACK_FIELDS.every((f) => t[f] === u[f]) && notesEqual(t.notes, u.notes));
  });
}
