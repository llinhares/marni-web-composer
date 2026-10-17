/**
 * Pure TypeScript Standard MIDI File (SMF Type 1) Encoder and Decoder
 */

import type { Note, Track, InstrumentId } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

// Variable-length quantity encoder for MIDI
export function writeVarLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];

  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytes;
}

export function writeString(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  return bytes;
}

export function write32Bit(val: number): number[] {
  return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

export function write16Bit(val: number): number[] {
  return [(val >> 8) & 0xff, val & 0xff];
}

export function getGmProgramForInstrument(instId: InstrumentId): number {
  switch (instId) {
    case 'grand-piano':
      return 0; // Acoustic Grand Piano
    case 'flute':
      return 73; // Flute
    case 'violin':
      return 40; // Violin
    case 'percussion':
      return 0; // Standard Drum Kit
    case 'guitar':
      return 24; // Acoustic Guitar (nylon)
    case 'bass':
      return 32; // Acoustic Bass
    case 'harp':
      return 46; // Orchestral Harp
    case 'trumpet':
      return 56; // Trumpet
    case 'cello':
      return 42; // Cello
    case 'marnisynth':
      return 80; // Lead 1 (square)
    default:
      return 0;
  }
}

interface RawMidiEvent {
  tick: number;
  type: 'note-on' | 'note-off' | 'meta-tempo' | 'meta-track-name' | 'meta-time-sig' | 'program-change';
  channel: number;
  pitch?: number;
  velocity?: number;
  program?: number;
  tempoMicros?: number;
  text?: string;
}

export function createStandardMidiFile(
  tracks: Track[],
  bpm: number = 120,
  ticksPerQuarter: number = TICKS_PER_BEAT
): Uint8Array {
  const fileBytes: number[] = [];

  // 1. Header chunk: "MThd"
  fileBytes.push(...writeString('MThd'));
  fileBytes.push(...write32Bit(6)); // Header length = 6
  fileBytes.push(...write16Bit(1)); // Format 1 (multiple tracks, synchronous)
  fileBytes.push(...write16Bit(tracks.length + 1)); // Number of tracks (+1 for tempo map track)
  fileBytes.push(...write16Bit(ticksPerQuarter));

  // 2. Track 0: Tempo and conductor track
  const tempoTrackBytes: number[] = [];
  // Meta: Track Name
  tempoTrackBytes.push(...writeVarLength(0));
  tempoTrackBytes.push(0xff, 0x03);
  const nameBytes = writeString('Tempo & Master');
  tempoTrackBytes.push(nameBytes.length, ...nameBytes);

  // Meta: Set Tempo (microsecs per quarter note = 60,000,000 / BPM)
  const microsecondsPerBeat = Math.round(60000000 / Math.max(20, bpm));
  tempoTrackBytes.push(...writeVarLength(0));
  tempoTrackBytes.push(0xff, 0x51, 0x03);
  tempoTrackBytes.push(
    (microsecondsPerBeat >> 16) & 0xff,
    (microsecondsPerBeat >> 8) & 0xff,
    microsecondsPerBeat & 0xff
  );

  // Meta: Time Signature (4/4 default, 24 MIDI clocks/click, 8 32nd notes per quarter)
  tempoTrackBytes.push(...writeVarLength(0));
  tempoTrackBytes.push(0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  // End of Track
  tempoTrackBytes.push(...writeVarLength(0));
  tempoTrackBytes.push(0xff, 0x2f, 0x00);

  // Write Track 0 header & data
  fileBytes.push(...writeString('MTrk'));
  fileBytes.push(...write32Bit(tempoTrackBytes.length));
  fileBytes.push(...tempoTrackBytes);

  // 3. User Tracks: Melodic channels (0..8, 10..15), percussion strictly on channel 9 (GM Channel 10)
  const melodicChannels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let melodicIndex = 0;

  tracks.forEach((track) => {
    const isPercussion = track.instrumentId === 'percussion';
    const channel = isPercussion
      ? 9
      : melodicChannels[melodicIndex++ % melodicChannels.length];

    const events: RawMidiEvent[] = [];

    // Track name event at tick 0
    events.push({
      tick: 0,
      type: 'meta-track-name',
      channel,
      text: track.name,
    });

    // Program change event at tick 0 to announce General MIDI instrument
    events.push({
      tick: 0,
      type: 'program-change',
      channel,
      program: getGmProgramForInstrument(track.instrumentId),
    });

    // Convert notes to Note On / Note Off events
    track.notes.forEach((note) => {
      events.push({
        tick: note.startTick,
        type: 'note-on',
        channel,
        pitch: Math.max(0, Math.min(127, note.pitch)),
        velocity: Math.max(1, Math.min(127, note.velocity || 90)),
      });

      events.push({
        tick: note.startTick + note.durationTicks,
        type: 'note-off',
        channel,
        pitch: Math.max(0, Math.min(127, note.pitch)),
        velocity: 0,
      });
    });

    // Sort events by tick (Meta & Program-change first, then Note-off before Note-on if same tick)
    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      const getPriority = (type: string) => {
        if (type === 'meta-track-name') return 0;
        if (type === 'program-change') return 1;
        if (type === 'note-off') return 2;
        if (type === 'note-on') return 3;
        return 4;
      };
      return getPriority(a.type) - getPriority(b.type);
    });

    const trackBytes: number[] = [];
    let lastTick = 0;

    for (const ev of events) {
      const delta = Math.max(0, ev.tick - lastTick);
      lastTick = ev.tick;

      trackBytes.push(...writeVarLength(delta));

      if (ev.type === 'meta-track-name' && ev.text) {
        trackBytes.push(0xff, 0x03);
        const tBytes = writeString(ev.text);
        trackBytes.push(tBytes.length, ...tBytes);
      } else if (ev.type === 'program-change' && ev.program !== undefined) {
        trackBytes.push(0xc0 | (channel & 0x0f), ev.program & 0x7f);
      } else if (ev.type === 'note-on') {
        trackBytes.push(0x90 | (channel & 0x0f), ev.pitch!, ev.velocity!);
      } else if (ev.type === 'note-off') {
        trackBytes.push(0x80 | (channel & 0x0f), ev.pitch!, 0);
      }
    }

    // End of Track event
    trackBytes.push(...writeVarLength(0));
    trackBytes.push(0xff, 0x2f, 0x00);

    fileBytes.push(...writeString('MTrk'));
    fileBytes.push(...write32Bit(trackBytes.length));
    fileBytes.push(...trackBytes);
  });

  return new Uint8Array(fileBytes);
}

/**
 * Downloads a Uint8Array as a file
 */
export function triggerFileDownload(
  data: Uint8Array | Blob | string,
  filename: string,
  mimeType: string
) {
  const blob =
    data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
