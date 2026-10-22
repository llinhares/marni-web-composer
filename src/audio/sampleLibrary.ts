/**
 * Sampled instruments (General MIDI SoundFont "FluidR3_GM").
 *
 * Samples: FluidR3_GM by Frank Wen, pre-rendered to MP3 by the midi-js-soundfonts project
 * (https://github.com/gleitz/midi-js-soundfonts), licensed under Creative Commons Attribution 3.0.
 *
 * Every instrument has one recorded sample per semitone (A0–C8), so notes play at their natural pitch;
 * notes outside that span are re-pitched from the nearest sample. Decoded AudioBuffers are not tied
 * to a context, so the same buffers serve live playback and the offline WAV render.
 * Raw files are kept in Cache Storage, so instruments load instantly (and offline) after the first time.
 */

import type { InstrumentId } from '../types/music.ts';

export const SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
export const SAMPLES_CREDIT = 'Timbres: FluidR3_GM (Frank Wen), CC BY 3.0, via midi-js-soundfonts';
const CACHE_NAME = 'marni-soundfonts-v1';

/** App instrument -> General MIDI SoundFont instrument (null = keep the built-in synthesizer). */
export const INSTRUMENT_SAMPLES: Record<InstrumentId, string | null> = {
  'grand-piano': 'acoustic_grand_piano',
  flute: 'flute',
  violin: 'violin',
  guitar: 'acoustic_guitar_nylon',
  bass: 'acoustic_bass',
  harp: 'orchestral_harp',
  trumpet: 'trumpet',
  cello: 'cello',
  percussion: null, // the BDO drum kit pieces have no General MIDI melodic equivalent
  marnisynth: null, // synthesizer by design
};

/** Instruments whose sound decays naturally (plucked/struck): the sample keeps ringing after note-off. */
export const DECAYING_INSTRUMENTS = new Set<InstrumentId>(['grand-piano', 'guitar', 'bass', 'harp']);

const NOTE_OFFSETS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** "A0" -> 21, "Bb3" -> 58, "C8" -> 108. Returns null for unknown names. */
export function noteNameToMidi(name: string): number | null {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m || NOTE_OFFSETS[m[1]] === undefined) return null;
  return (Number(m[2]) + 1) * 12 + NOTE_OFFSETS[m[1]];
}

/** Extracts { midiPitch -> base64 MP3 } from a midi-js-soundfonts "<instrument>-mp3.js" file. */
export function parseSoundfontScript(text: string): Map<number, string> {
  const samples = new Map<number, string>();
  const re = /"([A-G](?:#|b)?-?\d)"\s*:\s*"data:audio\/[a-z0-9]+;base64,([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pitch = noteNameToMidi(m[1]);
    if (pitch !== null) samples.set(pitch, m[2]);
  }
  return samples;
}

/** Sample to use for a pitch and the playback rate that re-pitches it. */
export function pickSample(pitch: number, available: number[]): { samplePitch: number; rate: number } | null {
  if (available.length === 0) return null;
  let best = available[0];
  for (const p of available) if (Math.abs(p - pitch) < Math.abs(best - pitch)) best = p;
  return { samplePitch: best, rate: Math.pow(2, (pitch - best) / 12) };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export interface SampleSet {
  instrumentId: InstrumentId;
  buffers: Map<number, AudioBuffer>;
  pitches: number[];
}

export type SampleStatus = 'loading' | 'ready' | 'error';

class SampleLibrary {
  private sets = new Map<InstrumentId, SampleSet>();
  private pending = new Map<InstrumentId, Promise<SampleSet | null>>();
  private status = new Map<InstrumentId, SampleStatus>();
  private listeners = new Set<() => void>();
  private decoder: BaseAudioContext | null = null;
  private version = 0;

  /** Loaded sample set, or null while loading / for synthesized instruments. */
  get(instrumentId: InstrumentId): SampleSet | null {
    return this.sets.get(instrumentId) ?? null;
  }

  getStatus(instrumentId: InstrumentId): SampleStatus | 'synth' {
    if (!INSTRUMENT_SAMPLES[instrumentId]) return 'synth';
    return this.status.get(instrumentId) ?? 'loading';
  }

  /** Changes whenever any instrument finishes loading or fails (for useSyncExternalStore). */
  getVersion = () => this.version;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setStatus(id: InstrumentId, s: SampleStatus) {
    this.status.set(id, s);
    this.version++;
    this.listeners.forEach((l) => l());
  }

  load(instrumentId: InstrumentId): Promise<SampleSet | null> {
    const name = INSTRUMENT_SAMPLES[instrumentId];
    if (!name || typeof window === 'undefined') return Promise.resolve(null);
    const loaded = this.sets.get(instrumentId);
    if (loaded) return Promise.resolve(loaded);
    const inFlight = this.pending.get(instrumentId);
    if (inFlight) return inFlight;

    this.setStatus(instrumentId, 'loading');
    const promise = this.fetchAndDecode(instrumentId, name)
      .then((set) => {
        this.sets.set(instrumentId, set);
        this.setStatus(instrumentId, 'ready');
        return set;
      })
      .catch((err) => {
        console.warn(`Timbre ${name} indisponível, usando sintetizador:`, err);
        this.pending.delete(instrumentId); // allow a retry later
        this.setStatus(instrumentId, 'error');
        return null;
      });
    this.pending.set(instrumentId, promise);
    return promise;
  }

  loadAll(instrumentIds: Iterable<InstrumentId>): Promise<void> {
    return Promise.all([...new Set(instrumentIds)].map((id) => this.load(id))).then(() => undefined);
  }

  private async fetchText(url: string): Promise<string> {
    const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME).catch(() => null) : null;
    const cached = cache ? await cache.match(url) : undefined;
    if (cached) return cached.text();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (cache) await cache.put(url, res.clone()).catch(() => undefined);
    return res.text();
  }

  private async fetchAndDecode(instrumentId: InstrumentId, name: string): Promise<SampleSet> {
    const text = await this.fetchText(`${SOUNDFONT_BASE_URL}${name}-mp3.js`);
    const raw = parseSoundfontScript(text);
    if (raw.size === 0) throw new Error('arquivo de timbre vazio');

    // A tiny offline context is enough to decode; buffers are then usable by any context.
    this.decoder ??= new OfflineAudioContext(1, 1, 44100);
    const buffers = new Map<number, AudioBuffer>();
    await Promise.all(
      [...raw].map(async ([pitch, b64]) => {
        try {
          buffers.set(pitch, await this.decoder!.decodeAudioData(base64ToArrayBuffer(b64)));
        } catch {
          // a single broken sample is covered by its neighbours
        }
      })
    );
    if (buffers.size === 0) throw new Error('nenhuma amostra decodificada');
    return { instrumentId, buffers, pitches: [...buffers.keys()].sort((a, b) => a - b) };
  }
}

export const sampleLibrary = new SampleLibrary();
