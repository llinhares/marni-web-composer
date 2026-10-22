/**
 * Per-track channel strip settings and meter helpers (pure).
 */

import type { Track, TrackMixer } from '../types/music.ts';

export const DEFAULT_TRACK_MIXER: TrackMixer = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compressor: false,
  compThreshold: -18,
  compRatio: 4,
};

export const EQ_BANDS = [
  { key: 'eqLow', label: 'Graves', type: 'lowshelf', frequency: 200 },
  { key: 'eqMid', label: 'Médios', type: 'peaking', frequency: 1000 },
  { key: 'eqHigh', label: 'Agudos', type: 'highshelf', frequency: 5000 },
] as const;

export const mixerOf = (track: Track): TrackMixer => ({ ...DEFAULT_TRACK_MIXER, ...(track.mixer ?? {}) });

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Validates mixer values read from a project file. */
export function sanitizeMixer(raw: unknown): TrackMixer | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d;
  return {
    eqLow: num(r.eqLow, 0, -12, 12),
    eqMid: num(r.eqMid, 0, -12, 12),
    eqHigh: num(r.eqHigh, 0, -12, 12),
    compressor: typeof r.compressor === 'boolean' ? r.compressor : false,
    compThreshold: num(r.compThreshold, -18, -60, 0),
    compRatio: num(r.compRatio, 4, 1, 20),
  };
}

/** Linear peak (0..1+) to dBFS. */
export const peakToDb = (peak: number): number => (peak > 1e-6 ? 20 * Math.log10(peak) : -120);

/** dBFS to a 0..1 meter fill (−60 dB = empty, 0 dB = full). */
export const dbToMeter = (db: number): number => clamp((db + 60) / 60, 0, 1);

/** Meter ballistics: instant attack, ~20 dB/s fall. */
export function meterFall(previousDb: number, newDb: number, dtSec: number): number {
  return newDb >= previousDb ? newDb : Math.max(newDb, previousDb - 20 * dtSec);
}
