/**
 * Standard MIDI File (SMF format 0 and 1) decoder.
 *
 * Built to keep files made in professional DAWs intact:
 * - every channel/program combination becomes its own track (a track that switches from piano to
 *   strings, or a format 0 file with all parts on one track, is split the way it sounds);
 * - tempo changes are honoured: notes keep their real timing, re-expressed in the main tempo;
 * - channel 10 drums are converted to the Black Desert drum kit keys;
 * - each part gets the closest Black Desert instrument (General MIDI program, then the track name);
 * - the sustain pedal is kept on piano notes (the game pedal) and lengthens notes elsewhere;
 * - track volume (CC7) becomes the track volume.
 */

import type { Track, Note, TimeSignature } from '../types/music.ts';
import { BDO_INSTRUMENTS, TICKS_PER_BEAT } from '../types/music.ts';
import { detectGameInstrument } from '../utils/instrumentDetection.ts';
import { gameInstrumentFields, getBdoInstrument, gmDrumToKit, bdoInstrumentLabel } from '../bdo/bdoInstruments.ts';
import { newId } from '../utils/ids.ts';

export interface DecodedMidiSong {
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  tracks: Track[];
}

interface RawNote {
  pitch: number;
  startTick: number; // file ticks
  endTick: number;
  velocity: number;
  channel: number;
  program: number | undefined; // program active on the channel when the note started
  pedal: boolean; // sustain pedal down at note-on
  pedalEndTick: number; // pedal release after the note-off (for non-piano instruments)
}

interface RawTrack {
  name: string;
  notes: RawNote[];
  volumes: Map<number, number>; // channel -> first CC7 value
}

const SUPPORTED_TS: TimeSignature[] = ['4/4', '3/4', '6/8', '2/4', '12/8'];

export function parseStandardMidiFile(data: Uint8Array | ArrayBuffer, fileName?: string): DecodedMidiSong {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let offset = 0;

  const readString = (len: number) => {
    let str = '';
    for (let i = 0; i < len && offset < bytes.length; i++) str += String.fromCharCode(bytes[offset++]);
    return str;
  };
  const readUint32 = () => {
    if (offset + 4 > bytes.length) return 0;
    const val = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    offset += 4;
    return val;
  };
  const readUint16 = () => {
    if (offset + 2 > bytes.length) return 0;
    const val = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    return val;
  };
  const readVarLength = () => {
    let val = 0;
    while (offset < bytes.length) {
      const b = bytes[offset++];
      val = (val << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return val;
  };
  // Track names are usually Latin-1/UTF-8; decode UTF-8 when valid
  const decodeText = (raw: Uint8Array) => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      return Array.from(raw, (c) => String.fromCharCode(c)).join('');
    }
  };

  if (bytes.length < 14) throw new Error('Arquivo MIDI inválido: tamanho menor que o cabeçalho.');
  const headerId = readString(4);
  if (headerId !== 'MThd') throw new Error(`Arquivo não é um MIDI padrão válido (cabeçalho: ${headerId})`);

  const headerLen = readUint32();
  const format = readUint16();
  const numTracks = readUint16();
  const division = readUint16();
  if (headerLen > 6) offset += headerLen - 6;
  const ppq = (division & 0x8000) === 0 && division > 0 ? division : 480;

  let songTitle = '';
  let timeSig: TimeSignature = '4/4';
  let timeSigSet = false;
  const tempos: Array<{ tick: number; usPerQuarter: number }> = [];
  const rawTracks: RawTrack[] = [];

  for (let t = 0; t < numTracks && offset < bytes.length; t++) {
    const chunkId = readString(4);
    if (chunkId !== 'MTrk') {
      if (offset + 4 <= bytes.length) {
        offset += readUint32();
        t--;
        continue;
      }
      break;
    }
    const trackLen = readUint32();
    const trackEnd = offset + trackLen;

    let tick = 0;
    let runningStatus = 0;
    let trackName = '';
    let instrumentName = '';
    const programs = new Map<number, number>();
    const pedalDown = new Map<number, boolean>();
    const volumes = new Map<number, number>();
    const active = new Map<string, Array<{ start: number; velocity: number; program: number | undefined; pedal: boolean }>>();
    const pendingPedal = new Map<number, RawNote[]>(); // notes released while the pedal is down
    const notes: RawNote[] = [];

    const closeNote = (channel: number, pitch: number) => {
      const key = `${channel}-${pitch}`;
      const stack = active.get(key);
      const start = stack?.shift(); // first in, first out: overlapping repeats close in order
      if (!start) return;
      if (stack && stack.length === 0) active.delete(key);
      const note: RawNote = {
        pitch,
        startTick: start.start,
        endTick: Math.max(start.start + 1, tick),
        velocity: start.velocity,
        channel,
        program: start.program,
        pedal: start.pedal,
        pedalEndTick: tick,
      };
      notes.push(note);
      if (pedalDown.get(channel)) {
        const list = pendingPedal.get(channel) ?? [];
        list.push(note);
        pendingPedal.set(channel, list);
      }
    };

    while (offset < trackEnd && offset < bytes.length) {
      tick += readVarLength();
      let status = bytes[offset];
      if (status >= 0x80) {
        offset++;
        if (status < 0xf0) runningStatus = status;
      } else {
        status = runningStatus;
      }
      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (type === 0x80) {
        const pitch = bytes[offset++];
        offset++;
        closeNote(channel, pitch);
      } else if (type === 0x90) {
        const pitch = bytes[offset++];
        const velocity = bytes[offset++];
        if (velocity === 0) {
          closeNote(channel, pitch);
        } else {
          const key = `${channel}-${pitch}`;
          const stack = active.get(key) ?? [];
          stack.push({ start: tick, velocity, program: programs.get(channel), pedal: Boolean(pedalDown.get(channel)) });
          active.set(key, stack);
        }
      } else if (type === 0xa0) {
        offset += 2;
      } else if (type === 0xb0) {
        const controller = bytes[offset++];
        const value = bytes[offset++];
        if (controller === 64) {
          const down = value >= 64;
          if (!down && pedalDown.get(channel)) {
            for (const n of pendingPedal.get(channel) ?? []) n.pedalEndTick = tick;
            pendingPedal.delete(channel);
          }
          pedalDown.set(channel, down);
        } else if (controller === 7 && !volumes.has(channel)) {
          volumes.set(channel, value);
        }
      } else if (type === 0xc0) {
        programs.set(channel, bytes[offset++]);
      } else if (type === 0xd0) {
        offset++;
      } else if (type === 0xe0) {
        offset += 2;
      } else if (status === 0xff) {
        const metaType = bytes[offset++];
        const metaLen = readVarLength();
        const metaData = bytes.subarray(offset, offset + metaLen);
        offset += metaLen;
        if (metaType === 0x03) {
          trackName = decodeText(metaData).trim();
        } else if (metaType === 0x04) {
          instrumentName = decodeText(metaData).trim();
        } else if (metaType === 0x51 && metaLen === 3) {
          const us = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
          if (us > 0) tempos.push({ tick, usPerQuarter: us });
        } else if (metaType === 0x58 && metaLen >= 2 && !timeSigSet) {
          const ts = `${metaData[0]}/${Math.pow(2, metaData[1])}` as TimeSignature;
          if (SUPPORTED_TS.includes(ts)) timeSig = ts;
          timeSigSet = true;
        } else if (metaType === 0x2f) {
          break;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        offset += readVarLength();
      } else {
        offset++;
      }
    }

    // Notes still sounding at the end of the track
    for (const [key, stack] of active) {
      const [channel, pitch] = key.split('-').map(Number);
      for (const s of stack) {
        notes.push({
          pitch,
          startTick: s.start,
          endTick: Math.max(s.start + ppq / 4, tick),
          velocity: s.velocity,
          channel,
          program: s.program,
          pedal: s.pedal,
          pedalEndTick: tick,
        });
      }
    }
    for (const list of pendingPedal.values()) for (const n of list) n.pedalEndTick = Math.max(n.pedalEndTick, tick);

    offset = trackEnd;
    // In format 1 the first track (tempo map, no notes) names the song; a track with notes names a part
    if (t === 0 && notes.length === 0 && trackName) songTitle = trackName;
    rawTracks.push({ name: trackName || instrumentName, notes, volumes });
  }

  // Tempo map: file ticks -> seconds, re-expressed in the main tempo (the one lasting longest)
  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0 || tempos[0].tick > 0) tempos.unshift({ tick: 0, usPerQuarter: 500000 });
  const segments: Array<{ tick: number; sec: number; usPerQuarter: number }> = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    if (i > 0) sec += ((tempos[i].tick - tempos[i - 1].tick) / ppq) * (tempos[i - 1].usPerQuarter / 1e6);
    if (segments.length && segments[segments.length - 1].tick === tempos[i].tick) segments.pop();
    segments.push({ tick: tempos[i].tick, sec, usPerQuarter: tempos[i].usPerQuarter });
  }
  const lastTick = Math.max(1, ...rawTracks.flatMap((rt) => rt.notes.map((n) => n.endTick)));
  const lengthByTempo = new Map<number, number>();
  segments.forEach((s, i) => {
    const end = i + 1 < segments.length ? segments[i + 1].tick : Math.max(lastTick, s.tick);
    lengthByTempo.set(s.usPerQuarter, (lengthByTempo.get(s.usPerQuarter) ?? 0) + Math.max(0, end - s.tick) * s.usPerQuarter);
  });
  const mainTempo = [...lengthByTempo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 500000;
  const bpm = Math.max(20, Math.min(300, Math.round(60000000 / mainTempo)));
  const singleTempo = segments.every((s) => s.usPerQuarter === segments[0].usPerQuarter);

  const toProjectTick = (fileTick: number): number => {
    if (singleTempo) return Math.round((fileTick * TICKS_PER_BEAT) / ppq); // exact grid
    let i = segments.length - 1;
    while (i > 0 && segments[i].tick > fileTick) i--;
    const s = segments[i];
    const seconds = s.sec + ((fileTick - s.tick) / ppq) * (s.usPerQuarter / 1e6);
    return Math.round((seconds * bpm * TICKS_PER_BEAT) / 60);
  };

  // Parts: one per (track, channel, program). Parts doubled note for note (a General MIDI trick to
  // sound louder) are kept once.
  const resultTracks: Track[] = [];
  const seenParts = new Set<string>();
  rawTracks.forEach((rt) => {
    if (rt.notes.length === 0) return;
    const parts = new Map<string, RawNote[]>();
    for (const n of rt.notes) {
      const key = n.channel === 9 ? '9' : `${n.channel}:${n.program ?? -1}`;
      const list = parts.get(key);
      if (list) list.push(n);
      else parts.set(key, [n]);
    }
    const multiPart = parts.size > 1;

    for (const [, partNotes] of parts) {
      const { channel, program } = partNotes[0];
      const fingerprint = `${channel === 9 ? 'drums' : program ?? -1}|${partNotes
        .map((n) => `${n.pitch}:${n.startTick}:${n.endTick}`)
        .sort()
        .join(',')}`;
      if (seenParts.has(fingerprint)) continue;
      seenParts.add(fingerprint);
      const key = detectGameInstrument({ name: rt.name, fileName, program, channel, notes: partNotes });
      const game = getBdoInstrument(key)!;
      const fields = gameInstrumentFields(key);
      const family = BDO_INSTRUMENTS.find((i) => i.id === fields.instrumentId);
      const isPianoPedal = game.family === 'grand-piano';
      const trackId = newId('track');
      const label = bdoInstrumentLabel(game);
      const baseName = rt.name.trim();
      const name = baseName
        ? multiPart
          ? `${baseName} – ${channel === 9 ? 'Bateria' : label}`
          : baseName
        : channel === 9
          ? 'Bateria'
          : `${label}${multiPart || format === 0 ? ` (canal ${channel + 1})` : ''}`;

      const notes: Note[] = partNotes
        .map((n, i): Note => {
          const start = toProjectTick(n.startTick);
          // Non-piano instruments: the pedal holds the note until it is released
          const endFile = !isPianoPedal && n.pedal ? Math.max(n.endTick, n.pedalEndTick) : n.endTick;
          const end = toProjectTick(endFile);
          return {
            id: `note-m-${trackId}-${i}`,
            trackId,
            pitch: game.drumKit ? gmDrumToKit(n.pitch) : Math.max(12, Math.min(119, n.pitch)),
            startTick: Math.max(0, start),
            durationTicks: Math.max(game.percussion ? 60 : 15, end - start),
            velocity: Math.max(1, Math.min(127, n.velocity)),
            // Piano: the pedal is the game's pedal technique, note by note
            ...(isPianoPedal ? { sustain: n.pedal } : {}),
          };
        })
        .sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

      const cc7 = rt.volumes.get(channel);
      resultTracks.push({
        id: trackId,
        name,
        ...fields,
        color: family?.color || '#d4a373',
        volume: cc7 !== undefined ? Math.round((cc7 / 127) * 100) : family?.defaultVolume || 75,
        pan: 0,
        isMuted: false,
        isSolo: false,
        auxSend: true,
        sustainPedal: isPianoPedal && notes.some((n) => n.sustain),
        notes,
      });
    }
  });

  return {
    title: songTitle.trim() || (fileName ? fileName.replace(/\.[^/.]+$/, '') : '') || 'Partitura MIDI Importada',
    bpm,
    timeSignature: timeSig,
    tracks: resultTracks,
  };
}
