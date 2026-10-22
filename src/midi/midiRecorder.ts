/**
 * MIDI performance recorder (pure: ticks in, notes out).
 *
 * Collects note-on/off events stamped with the engine's playback tick and turns them into notes.
 * Sustain pedal (CC64) keeps released notes sounding until the pedal is lifted; notes held by the
 * pedal are flagged `sustain` (BDO stores a per-note sustain flag).
 */

import type { Note } from '../types/music.ts';

export interface RecordedNoteEvent {
  pitch: number;
  startTick: number;
  endTick: number;
  velocity: number;
  sustain: boolean;
}

export interface MidiRecorder {
  noteOn(pitch: number, velocity: number, tick: number): void;
  noteOff(pitch: number, tick: number): RecordedNoteEvent | null;
  sustainPedal(down: boolean, tick: number): RecordedNoteEvent[];
  /** Closes every note still open (stop pressed) and returns all recorded notes. */
  finish(tick: number): RecordedNoteEvent[];
}

const MIN_DURATION = 15; // ticks: a tap still produces an audible note

export function createMidiRecorder(startTick: number): MidiRecorder {
  const held = new Map<number, { startTick: number; velocity: number }>();
  const pedalHeld = new Map<number, { startTick: number; velocity: number }>();
  const done: RecordedNoteEvent[] = [];
  let pedalDown = false;

  const close = (pitch: number, open: { startTick: number; velocity: number }, tick: number, sustain: boolean) => {
    const ev: RecordedNoteEvent = {
      pitch,
      startTick: open.startTick,
      endTick: Math.max(open.startTick + MIN_DURATION, tick),
      velocity: open.velocity,
      sustain,
    };
    done.push(ev);
    return ev;
  };

  return {
    noteOn(pitch, velocity, tick) {
      // Notes played during the count-in land on the first beat
      const start = Math.max(startTick, Math.round(tick));
      const prevHeld = held.get(pitch) ?? pedalHeld.get(pitch);
      if (prevHeld) {
        close(pitch, prevHeld, start, pedalHeld.has(pitch));
        pedalHeld.delete(pitch);
      }
      held.set(pitch, { startTick: start, velocity: Math.max(1, Math.min(127, velocity)) });
    },
    noteOff(pitch, tick) {
      const open = held.get(pitch);
      if (!open) return null;
      held.delete(pitch);
      if (pedalDown) {
        pedalHeld.set(pitch, open);
        return null;
      }
      return close(pitch, open, Math.round(tick), false);
    },
    sustainPedal(down, tick) {
      pedalDown = down;
      if (down) return [];
      const closed = [...pedalHeld].map(([pitch, open]) => close(pitch, open, Math.round(tick), true));
      pedalHeld.clear();
      return closed;
    },
    finish(tick) {
      held.forEach((open, pitch) => close(pitch, open, Math.round(tick), false));
      pedalHeld.forEach((open, pitch) => close(pitch, open, Math.round(tick), true));
      held.clear();
      pedalHeld.clear();
      return done.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
    },
  };
}

export function recordedToNotes(events: RecordedNoteEvent[], trackId: string, makeId: () => string): Note[] {
  return events.map((e) => ({
    id: makeId(),
    trackId,
    pitch: e.pitch,
    startTick: e.startTick,
    durationTicks: e.endTick - e.startTick,
    velocity: e.velocity,
    ...(e.sustain ? { sustain: true } : {}),
  }));
}
