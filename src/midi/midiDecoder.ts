/**
 * Pure TypeScript Standard MIDI File (SMF Format 0 & 1) Decoder
 * Parses binary MIDI files into Marni Web Composer tracks and notes.
 */

import type { Track, Note, InstrumentId, TimeSignature } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import { detectBdoInstrument } from '../utils/instrumentDetection.ts';

export interface DecodedMidiSong {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  tracks: Track[];
}

export function parseStandardMidiFile(data: Uint8Array | ArrayBuffer, fileName?: string): DecodedMidiSong {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let offset = 0;

  function readString(len: number): string {
    let str = '';
    for (let i = 0; i < len && offset < bytes.length; i++) {
      str += String.fromCharCode(bytes[offset++]);
    }
    return str;
  }

  function readUint32(): number {
    if (offset + 4 > bytes.length) return 0;
    const val =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;
    offset += 4;
    return val;
  }

  function readUint16(): number {
    if (offset + 2 > bytes.length) return 0;
    const val = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    return val;
  }

  function readVarLength(): number {
    let val = 0;
    while (offset < bytes.length) {
      const b = bytes[offset++];
      val = (val << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return val;
  }

  // 1. Validate Header Chunk "MThd"
  if (bytes.length < 14) {
    throw new Error('Arquivo MIDI inválido: tamanho menor que o cabeçalho.');
  }

  const headerId = readString(4);
  if (headerId !== 'MThd') {
    throw new Error(`Arquivo não é um MIDI padrão válido (cabeçalho: ${headerId})`);
  }

  const headerLen = readUint32();
  const format = readUint16(); // 0, 1, or 2
  const numTracks = readUint16();
  const division = readUint16(); // PPQ (ticks per quarter note) or SMPTE

  // Skip any extra header bytes if headerLen > 6
  if (headerLen > 6) {
    offset += headerLen - 6;
  }

  // Determine tick scaling factor to normalize to 480 PPQ
  const ppq = (division & 0x8000) === 0 && division > 0 ? division : 480;
  const tickScale = 480 / ppq;

  let songTitle = '';
  let songBpm = 120;
  let timeSig: TimeSignature = '4/4';

  interface RawParsedTrack {
    name: string;
    channelPrograms: Map<number, number>;
    channelsUsed: Set<number>;
    notes: {
      pitch: number;
      startTick: number;
      durationTicks: number;
      velocity: number;
      channel: number;
      sustain?: boolean;
    }[];
  }

  const parsedTracks: RawParsedTrack[] = [];

  // 2. Parse MTrk Chunks
  for (let t = 0; t < numTracks && offset < bytes.length; t++) {
    const trackId = readString(4);
    if (trackId !== 'MTrk') {
      if (offset + 4 <= bytes.length) {
        const skipLen = readUint32();
        offset += skipLen;
        t--; // don't count skipped chunk
        continue;
      }
      break;
    }

    const trackLen = readUint32();
    const trackEnd = offset + trackLen;

    let currentTick = 0;
    let runningStatus = 0;
    let trackName = '';
    const channelPrograms = new Map<number, number>();
    const channelSustain = new Map<number, boolean>();
    const channelsUsed = new Set<number>();

    // Key: `${channel}-${pitch}` -> { startTick, velocity, sustain }
    const activeNoteStarts = new Map<string, { startTick: number; velocity: number; sustain: boolean }>();
    const completedNotes: RawParsedTrack['notes'] = [];

    while (offset < trackEnd && offset < bytes.length) {
      const delta = readVarLength();
      currentTick += delta;

      let status = bytes[offset];

      if (status >= 0x80) {
        offset++;
        if (status < 0xf0) {
          runningStatus = status;
        }
      } else {
        // Running status applies to voice category (0x80 - 0xEF)
        status = runningStatus;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;

      if (eventType === 0x80) {
        // Note Off
        const pitch = bytes[offset++];
        offset++; // velocity byte
        const key = `${channel}-${pitch}`;
        const start = activeNoteStarts.get(key);
        if (start) {
          const duration = Math.max(30, currentTick - start.startTick);
          completedNotes.push({
            pitch,
            startTick: start.startTick,
            durationTicks: duration,
            velocity: start.velocity,
            channel,
            sustain: start.sustain,
          });
          activeNoteStarts.delete(key);
        }
      } else if (eventType === 0x90) {
        // Note On
        const pitch = bytes[offset++];
        const velocity = bytes[offset++];
        const key = `${channel}-${pitch}`;
        channelsUsed.add(channel);
        const isSustained = Boolean(channelSustain.get(channel));

        if (velocity === 0) {
          // Note On with vel 0 is Note Off
          const start = activeNoteStarts.get(key);
          if (start) {
            const duration = Math.max(30, currentTick - start.startTick);
            completedNotes.push({
              pitch,
              startTick: start.startTick,
              durationTicks: duration,
              velocity: start.velocity,
              channel,
              sustain: start.sustain,
            });
            activeNoteStarts.delete(key);
          }
        } else {
          // If note is already sounding, close previous one
          const prev = activeNoteStarts.get(key);
          if (prev) {
            completedNotes.push({
              pitch,
              startTick: prev.startTick,
              durationTicks: Math.max(30, currentTick - prev.startTick),
              velocity: prev.velocity,
              channel,
              sustain: prev.sustain,
            });
          }
          activeNoteStarts.set(key, { startTick: currentTick, velocity, sustain: isSustained });
        }
      } else if (eventType === 0xa0) {
        // Polyphonic aftertouch (2 bytes)
        offset += 2;
      } else if (eventType === 0xb0) {
        // Control change (2 bytes)
        const controller = bytes[offset++];
        const value = bytes[offset++];
        if (controller === 64) {
          channelSustain.set(channel, value >= 64);
        }
      } else if (eventType === 0xc0) {
        // Program change (1 byte)
        const prog = bytes[offset++];
        channelPrograms.set(channel, prog);
        channelsUsed.add(channel);
      } else if (eventType === 0xd0) {
        // Channel aftertouch (1 byte)
        offset++;
      } else if (eventType === 0xe0) {
        // Pitch wheel (2 bytes)
        offset += 2;
      } else if (status === 0xff) {
        // Meta event
        const metaType = bytes[offset++];
        const metaLen = readVarLength();
        const metaData = bytes.subarray(offset, offset + metaLen);
        offset += metaLen;

        if (metaType === 0x01 || metaType === 0x03 || metaType === 0x04) {
          // Text (0x01), Track Name (0x03), or Instrument Name (0x04)
          let name = '';
          for (let i = 0; i < metaData.length; i++) {
            name += String.fromCharCode(metaData[i]);
          }
          if (t === 0 && !songTitle && metaType !== 0x04) {
            songTitle = name;
          }
          if (!trackName || metaType === 0x03 || metaType === 0x04) {
            trackName = name;
          }
        } else if (metaType === 0x51 && metaLen === 3) {
          // Set Tempo (microsec per quarter note)
          const micros = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
          if (micros > 0) {
            songBpm = Math.round(60000000 / micros);
          }
        } else if (metaType === 0x58 && metaLen >= 2) {
          // Time signature
          const num = metaData[0];
          const den = Math.pow(2, metaData[1]);
          const tsStr = `${num}/${den}`;
          if (
            tsStr === '4/4' ||
            tsStr === '3/4' ||
            tsStr === '6/8' ||
            tsStr === '2/4' ||
            tsStr === '12/8'
          ) {
            timeSig = tsStr as TimeSignature;
          }
        }
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        const sysLen = readVarLength();
        offset += sysLen;
      } else {
        // Non-standard byte, advance to next byte safely
        offset++;
      }
    }

    // Close any dangling notes at track end
    activeNoteStarts.forEach((start, key) => {
      const parts = key.split('-');
      const channel = parseInt(parts[0], 10);
      const pitch = parseInt(parts[1], 10);
      completedNotes.push({
        pitch,
        startTick: start.startTick,
        durationTicks: Math.max(120, currentTick - start.startTick),
        velocity: start.velocity,
        channel,
      });
    });

    offset = trackEnd; // align to end of chunk

    parsedTracks.push({
      name: trackName,
      channelPrograms,
      channelsUsed,
      notes: completedNotes,
    });
  }

  const resultTracks: Track[] = [];

  parsedTracks.forEach((pTrack, idx) => {
    if (pTrack.notes.length === 0) return;

    // Format 0 handling (Single track multi-channel: split by channel)
    if (format === 0 && pTrack.channelsUsed.size > 1) {
      const channelNotes = new Map<number, RawParsedTrack['notes']>();
      pTrack.notes.forEach((n) => {
        if (!channelNotes.has(n.channel)) channelNotes.set(n.channel, []);
        channelNotes.get(n.channel)!.push(n);
      });

      channelNotes.forEach((notes, ch) => {
        const prog = pTrack.channelPrograms.get(ch);
        const instId = detectBdoInstrument({
          name: pTrack.name,
          fileName,
          program: prog,
          channel: ch,
          notes,
        });
        const inst = BDO_INSTRUMENTS.find((i) => i.id === instId);
        const trackId = `track-mid-${idx}-ch${ch}-${Date.now()}`;

        resultTracks.push({
          id: trackId,
          name: ch === 9 ? 'Percussão' : (pTrack.name.trim() || `${inst?.name || 'Instrumento'} (Ch ${ch + 1})`),
          instrumentId: instId,
          color: inst?.color || '#d4a373',
          volume: inst?.defaultVolume || 75,
          pan: 0,
          isMuted: false,
          isSolo: false,
          auxSend: true,
          sustainPedal: instId === 'grand-piano' || notes.some((n) => n.sustain),
          notes: notes.map((n, nIdx) => ({
            id: `note-m-${trackId}-${nIdx}`,
            trackId,
            pitch: Math.max(12, Math.min(119, n.pitch)),
            startTick: Math.round(n.startTick * tickScale),
            durationTicks: Math.max(30, Math.round(n.durationTicks * tickScale)),
            velocity: Math.max(1, Math.min(127, n.velocity)),
            sustain: n.sustain,
          })),
        });
      });
      return;
    }

    // Format 1 handling (Multi-track) or single-channel Format 0
    const isDrums = pTrack.channelsUsed.has(9);
    const firstProg = Array.from(pTrack.channelPrograms.values())[0];
    const instId = detectBdoInstrument({
      name: pTrack.name,
      fileName,
      program: firstProg,
      channel: isDrums ? 9 : 0,
      notes: pTrack.notes,
    });
    const inst = BDO_INSTRUMENTS.find((i) => i.id === instId);

    const trackId = `track-mid-${idx}-${Date.now()}`;
    const name = pTrack.name.trim() || `${inst?.name || 'Faixa'} ${resultTracks.length + 1}`;

    resultTracks.push({
      id: trackId,
      name,
      instrumentId: instId,
      color: inst?.color || '#d4a373',
      volume: inst?.defaultVolume || 75,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      sustainPedal: instId === 'grand-piano' || pTrack.notes.some((n) => n.sustain),
      notes: pTrack.notes.map((n, nIdx) => ({
        id: `note-m-${trackId}-${nIdx}`,
        trackId,
        pitch: Math.max(12, Math.min(119, n.pitch)),
        startTick: Math.round(n.startTick * tickScale),
        durationTicks: Math.max(30, Math.round(n.durationTicks * tickScale)),
        velocity: Math.max(1, Math.min(127, n.velocity)),
        sustain: n.sustain,
      })),
    });
  });

  return {
    title: songTitle.trim() || 'Partitura MIDI Importada',
    bpm: songBpm,
    timeSignature: timeSig,
    tracks: resultTracks,
  };
}
