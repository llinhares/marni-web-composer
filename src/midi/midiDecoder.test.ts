import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStandardMidiFile } from './midiDecoder.ts';
import { createStandardMidiFile } from './midiEncoder.ts';
import type { Track } from '../types/music.ts';

test('parseStandardMidiFile correctly decodes SMF Format 1 multi-track file', () => {
  const originalTracks: Track[] = [
    {
      id: 't-piano',
      name: 'Grand Piano Solo',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 80,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes: [
        { id: 'n1', trackId: 't-piano', pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 }, // C4
        { id: 'n2', trackId: 't-piano', pitch: 64, startTick: 480, durationTicks: 960, velocity: 100 }, // E4
      ],
    },
    {
      id: 't-drums',
      name: 'Bateria BDO',
      instrumentId: 'percussion',
      color: '#81b29a',
      volume: 85,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: false,
      notes: [
        { id: 'nd1', trackId: 't-drums', pitch: 48, startTick: 0, durationTicks: 240, velocity: 110 }, // Kick
        { id: 'nd2', trackId: 't-drums', pitch: 50, startTick: 480, durationTicks: 240, velocity: 105 }, // Snare
      ],
    },
  ];

  const midiBytes = createStandardMidiFile(originalTracks, 135, 480);
  assert.ok(midiBytes.length > 50);

  const decoded = parseStandardMidiFile(midiBytes);

  assert.equal(decoded.bpm, 135);
  assert.equal(decoded.tracks.length, 2);

  // Check track 1 (piano)
  const pianoTrack = decoded.tracks[0];
  assert.equal(pianoTrack.instrumentId, 'grand-piano');
  assert.equal(pianoTrack.notes.length, 2);
  assert.equal(pianoTrack.notes[0].pitch, 60);
  assert.equal(pianoTrack.notes[0].startTick, 0);
  assert.equal(pianoTrack.notes[0].durationTicks, 480);
  assert.equal(pianoTrack.notes[1].pitch, 64);
  assert.equal(pianoTrack.notes[1].startTick, 480);
  assert.equal(pianoTrack.notes[1].durationTicks, 960);

  // Check track 2 (drums mapped to percussion via channel 9)
  const drumTrack = decoded.tracks[1];
  assert.equal(drumTrack.instrumentId, 'percussion');
  assert.equal(drumTrack.notes.length, 2);
  assert.equal(drumTrack.notes[0].pitch, 48);
  assert.equal(drumTrack.notes[1].pitch, 50);
});

test('parseStandardMidiFile handles Format 0 single track multi-channel split', () => {
  // Construct a minimal valid Format 0 MIDI file in bytes
  // Header: MThd, length 6, format 0, 1 track, 480 PPQ
  const bytes: number[] = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  ];

  // Track chunk: MTrk
  const trackEvents: number[] = [
    // Delta 0, Tempo meta event (120 BPM = 500,000 micros)
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    // Delta 0, Channel 0 Note On: pitch 60, vel 90
    0x00, 0x90, 0x3c, 0x5a,
    // Delta 0, Channel 9 Note On (Drum): GM bass drum 36, vel 100
    0x00, 0x99, 0x24, 0x64,
    // Delta 480 (0x83, 0x60 in VLQ), Note Off Channel 0: pitch 60, vel 0
    0x83, 0x60, 0x80, 0x3c, 0x00,
    // Delta 0, Note Off Channel 9: pitch 36, vel 0
    0x00, 0x89, 0x24, 0x00,
    // Delta 0, End of Track
    0x00, 0xff, 0x2f, 0x00,
  ];

  bytes.push(0x4d, 0x54, 0x72, 0x6b);
  bytes.push(
    (trackEvents.length >> 24) & 0xff,
    (trackEvents.length >> 16) & 0xff,
    (trackEvents.length >> 8) & 0xff,
    trackEvents.length & 0xff
  );
  bytes.push(...trackEvents);

  const decoded = parseStandardMidiFile(new Uint8Array(bytes));
  assert.equal(decoded.bpm, 120);
  assert.equal(decoded.tracks.length, 2);

  const melTrack = decoded.tracks.find((t) => t.instrumentId !== 'percussion');
  const dTrack = decoded.tracks.find((t) => t.instrumentId === 'percussion');

  assert.ok(melTrack);
  assert.ok(dTrack);
  assert.equal(melTrack.notes[0].pitch, 60);
  assert.equal(dTrack.notes[0].pitch, 48, 'GM bass drum lands on the kit kick (Kck)');
  assert.equal(dTrack.bdoInstrument, 'florchestra-drum-set');
});

test('parseStandardMidiFile automatically detects instrument from fileName', () => {
  const singleTrack: Track[] = [
    {
      id: 't-unknown',
      name: 'Track 1',
      instrumentId: 'grand-piano',
      color: '#d4a373',
      volume: 80,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes: [
        { id: 'n1', trackId: 't-unknown', pitch: 36, startTick: 0, durationTicks: 480, velocity: 90 },
      ],
    },
  ];

  const midiBytes = createStandardMidiFile(singleTrack, 120, 480);
  const decodedBass = parseStandardMidiFile(midiBytes, '02_Acoustic_Bass.mid');
  assert.equal(decodedBass.tracks[0].instrumentId, 'bass');

  const decodedFlute = parseStandardMidiFile(midiBytes, 'Flute_Melody.mid');
  assert.equal(decodedFlute.tracks[0].instrumentId, 'flute');
});

// Minimal SMF builder: events are [deltaTicks, ...bytes]
function smf(format: number, tracks: number[][][], ppq = 480): Uint8Array {
  const vlq = (v: number) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const bytes = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, (ppq >> 8) & 0xff, ppq & 0xff];
  for (const events of tracks) {
    const data: number[] = [];
    for (const [delta, ...ev] of events) data.push(...vlq(delta), ...ev);
    data.push(0, 0xff, 0x2f, 0);
    bytes.push(0x4d, 0x54, 0x72, 0x6b, (data.length >> 24) & 0xff, (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff, ...data);
  }
  return new Uint8Array(bytes);
}
const tempo = (bpm: number) => {
  const us = Math.round(60000000 / bpm);
  return [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
};

test('tempo changes keep the real timing, expressed in the main tempo', () => {
  // 4 quarter notes at 120 BPM (2 s), then 4 at 60 BPM (4 s): 60 BPM lasts longest
  const notes: number[][] = [];
  for (let i = 0; i < 8; i++) notes.push([i === 0 ? 0 : 0, 0x90, 60, 90], [480, 0x80, 60, 0]);
  const conductor = [[0, ...tempo(120)], [1920, ...tempo(60)]];
  const d = parseStandardMidiFile(smf(1, [conductor, notes]));
  assert.equal(d.bpm, 60);
  const starts = d.tracks[0].notes.map((n) => n.startTick);
  // First half: 0.5 s apart = half a beat at 60 BPM; second half: one beat apart
  assert.deepEqual(starts, [0, 240, 480, 720, 960, 1440, 1920, 2400]);
});

test('a program change in the middle of a track starts a new part with its own instrument', () => {
  const events = [
    [0, 0xc0, 0], // piano
    [0, 0x90, 60, 90],
    [480, 0x80, 60, 0],
    [0, 0xc0, 40], // violin
    [0, 0x90, 67, 90],
    [480, 0x80, 67, 0],
  ];
  const d = parseStandardMidiFile(smf(0, [events]));
  assert.deepEqual(
    d.tracks.map((t) => [t.bdoInstrument, t.notes.length]),
    [
      ['florchestra-piano', 1],
      ['florchestra-violin', 1],
    ]
  );
});

test('channel 10 drums land on the drum kit pieces', () => {
  const events = [36, 38, 42, 46, 49, 51].flatMap((p) => [
    [0, 0x99, p, 100],
    [120, 0x89, p, 0],
  ]);
  const d = parseStandardMidiFile(smf(0, [events]));
  assert.equal(d.tracks[0].bdoInstrument, 'florchestra-drum-set');
  // Kck, SnrHit, HihatC, HihatO, CymCrsh, CymRide
  assert.deepEqual(
    d.tracks[0].notes.map((n) => n.pitch),
    [48, 50, 54, 58, 61, 62]
  );
});

test('the sustain pedal is the piano pedal technique, and holds notes on other instruments', () => {
  const pedal = (channel: number, program: number) => [
    [0, 0xc0 | channel, program],
    [0, 0xb0 | channel, 64, 127],
    [0, 0x90 | channel, 60, 90],
    [240, 0x80 | channel, 60, 0],
    [720, 0xb0 | channel, 64, 0],
  ];
  const piano = parseStandardMidiFile(smf(0, [pedal(0, 0)])).tracks[0];
  assert.equal(piano.notes[0].sustain, true);
  assert.equal(piano.notes[0].durationTicks, 240);

  const strings = parseStandardMidiFile(smf(0, [pedal(1, 48)])).tracks[0];
  assert.equal(strings.notes[0].durationTicks, 960, 'held until the pedal is lifted');
  assert.equal(strings.notes[0].sustain, undefined);
});
