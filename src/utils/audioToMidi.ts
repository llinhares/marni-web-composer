import type { Note } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';
import { pitchToFrequency } from './musicMath.ts';

export interface AudioToMidiOptions {
  bpm?: number;
  sensitivity?: number; // 0.1 to 1.0 (default 0.5)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  minDurationSec?: number; // default 0.08s
  startTime?: number; // Crop start in seconds (trims intro)
  endTime?: number; // Crop end in seconds (trims outro)
  onProgress?: (progress: number, stage: string) => void;
}

export interface AudioTranscriptionResult {
  notes: Note[];
  detectedBpm: number;
  durationSeconds: number;
}

/**
 * Extracts and decodes raw AudioBuffer from any audio or video File (e.g. MP4, WEBM, MP3, WAV).
 */
export async function extractAudioBufferFromFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Navegador não suporta Web Audio API.');
  }

  const audioCtx = new AudioContextClass();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Estimate BPM using spectral flux onset novelty curve and autocorrelation.
 */
export function estimateBpmFromAudioBuffer(audioBuffer: AudioBuffer, startTime = 0, endTime?: number): number {
  const sampleRate = audioBuffer.sampleRate;
  const fullChannelData = audioBuffer.getChannelData(0);

  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = endTime && endTime > 0
    ? Math.min(fullChannelData.length, Math.floor(endTime * sampleRate))
    : fullChannelData.length;

  const channelData = fullChannelData.subarray(startSample, endSample);
  const hopSize = Math.floor(sampleRate / 100); // 10ms hop
  const numFrames = Math.floor(channelData.length / hopSize);

  if (numFrames < 200) return 120; // Default if audio segment is too short

  // Energy envelope
  const envelope = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const start = i * hopSize;
    const end = Math.min(channelData.length, start + hopSize);
    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    envelope[i] = Math.sqrt(sum / Math.max(1, end - start));
  }

  // First difference (spectral/energy flux)
  const flux = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    const diff = envelope[i] - envelope[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // Autocorrelation over BPM range 70 to 180 (hops per beat = (60 / BPM) / 0.010 = 6000 / BPM)
  const minLag = Math.floor(6000 / 180); // ~33 hops (180 BPM)
  const maxLag = Math.floor(6000 / 70);  // ~85 hops (70 BPM)
  let bestLag = 50; // default ~120 BPM
  let maxCorr = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const count = numFrames - lag;
    for (let i = 0; i < count; i++) {
      corr += flux[i] * flux[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }

  const detectedBpm = Math.round(6000 / bestLag);
  return Math.max(60, Math.min(220, detectedBpm));
}

/**
 * Pure client-side polyphonic audio-to-MIDI transcription using Goertzel spectral bins,
 * frequency-dependent loudness weighting, adaptive noise floor, peak-picking, onset surge detection,
 * and harmonic suppression.
 */
export async function transcribeAudioBufferToNotes(
  audioBuffer: AudioBuffer,
  options: AudioToMidiOptions = {}
): Promise<AudioTranscriptionResult> {
  const {
    sensitivity = 0.5,
    minPitch = 21,
    maxPitch = 108,
    minDurationSec = 0.08,
    startTime = 0,
    endTime,
    onProgress,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const fullChannelData = audioBuffer.getChannelData(0);

  // Subarray to support trimming intro / outro
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = endTime && endTime > 0
    ? Math.min(fullChannelData.length, Math.floor(endTime * sampleRate))
    : fullChannelData.length;

  const channelData = fullChannelData.subarray(startSample, endSample);
  const durationSeconds = channelData.length / sampleRate;

  onProgress?.(0.1, 'Estimando andamento (BPM)...');
  const detectedBpm = options.bpm || estimateBpmFromAudioBuffer(audioBuffer, startTime, endTime);

  onProgress?.(0.2, 'Analisando frequências e transientes...');

  // Pre-calculate target frequencies and frequency weighting for piano pitches
  const pitchFrequencies = new Map<number, number>();
  const pitchWeights = new Map<number, number>();
  for (let p = minPitch; p <= maxPitch; p++) {
    const freq = pitchToFrequency(p);
    pitchFrequencies.set(p, freq);
    // Weight treble slightly relative to heavy bass to balance sensitivity
    const weight = Math.min(2.2, Math.max(0.65, Math.pow(freq / 261.63, 0.28)));
    pitchWeights.set(p, weight);
  }

  const fftSize = 4096;
  const hopSize = 1024;
  const numFrames = Math.floor((channelData.length - fftSize) / hopSize);

  if (numFrames <= 0) {
    return { notes: [], detectedBpm, durationSeconds };
  }

  // Precompute Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Base threshold scaled by sensitivity
  const baseThreshold = 0.016 * Math.pow(1 - sensitivity * 0.6, 2);

  interface ActiveNoteCandidate {
    pitch: number;
    startFrame: number;
    lastFrame: number;
    peakEnergy: number;
    frameCount: number;
  }

  const activeNotes = new Map<number, ActiveNoteCandidate>();
  const finalizedNotes: {
    pitch: number;
    startSec: number;
    durationSec: number;
    velocity: number;
  }[] = [];

  const timePerFrame = hopSize / sampleRate;

  // Goertzel bins for piano pitches
  const pitchBins: { pitch: number; freq: number; k: number; omega: number; cosW: number; sinW: number }[] = [];
  for (let p = minPitch; p <= maxPitch; p++) {
    const freq = pitchFrequencies.get(p)!;
    const k = Math.round((freq * fftSize) / sampleRate);
    const omega = (2 * Math.PI * k) / fftSize;
    pitchBins.push({
      pitch: p,
      freq,
      k,
      omega,
      cosW: Math.cos(omega),
      sinW: Math.sin(omega),
    });
  }

  let prevEnergies = new Map<number, number>();

  for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
    if (frameIdx % 40 === 0 && onProgress) {
      const p = 0.2 + 0.6 * (frameIdx / numFrames);
      onProgress(p, `Processando áudio (${Math.round((frameIdx / numFrames) * 100)}%)...`);
      await new Promise((r) => setTimeout(r, 0));
    }

    const startPos = frameIdx * hopSize;
    const energies = new Map<number, number>();
    let totalFrameEnergy = 0;

    // 1. Compute magnitude for each pitch using Goertzel algorithm
    for (const bin of pitchBins) {
      let q0 = 0;
      let q1 = 0;
      let q2 = 0;
      const coeff = 2 * bin.cosW;

      for (let i = 0; i < fftSize; i++) {
        const x = channelData[startPos + i] * window[i];
        q0 = x + coeff * q1 - q2;
        q2 = q1;
        q1 = q0;
      }

      const real = q1 - q2 * bin.cosW;
      const imag = q2 * bin.sinW;
      const rawMag = Math.sqrt(real * real + imag * imag) / fftSize;
      const weight = pitchWeights.get(bin.pitch) || 1.0;
      const weightedMag = rawMag * weight;

      energies.set(bin.pitch, weightedMag);
      totalFrameEnergy += weightedMag;
    }

    const avgFrameEnergy = totalFrameEnergy / pitchBins.length;

    // 2. Multi-order Harmonic suppression: attenuate octave (2P, +12), fifth (3P, +19), double octave (4P, +24)
    for (let p = minPitch; p <= maxPitch; p++) {
      const fundamental = energies.get(p) || 0;
      if (fundamental > baseThreshold * 1.4) {
        // Octave (2nd harmonic)
        const p12 = p + 12;
        if (p12 <= maxPitch) {
          const e = energies.get(p12) || 0;
          energies.set(p12, Math.max(0, e - fundamental * 0.52));
        }

        // Octave + Fifth (3rd harmonic)
        const p19 = p + 19;
        if (p19 <= maxPitch) {
          const e = energies.get(p19) || 0;
          energies.set(p19, Math.max(0, e - fundamental * 0.35));
        }

        // Double Octave (4th harmonic)
        const p24 = p + 24;
        if (p24 <= maxPitch) {
          const e = energies.get(p24) || 0;
          energies.set(p24, Math.max(0, e - fundamental * 0.25));
        }
      }
    }

    // 3. Peak picking and onset surge detection:
    // A pitch is only active if it is a LOCAL PEAK compared to adjacent semitones!
    const currentActivePitches = new Set<number>();

    for (let p = minPitch; p <= maxPitch; p++) {
      const energy = energies.get(p) || 0;
      const prevEnergy = prevEnergies.get(p) || 0;
      const leftEnergy = energies.get(p - 1) || 0;
      const rightEnergy = energies.get(p + 1) || 0;

      // Must be above adaptive noise floor AND higher than adjacent pitches (local peak!)
      const isPeak = energy > leftEnergy * 1.15 && energy > rightEnergy * 1.15;
      const isAboveNoise = energy > Math.max(baseThreshold, avgFrameEnergy * 1.35);
      const isSurge = energy - prevEnergy > baseThreshold * 0.45;

      if (isAboveNoise && (isPeak || activeNotes.has(p))) {
        if (!activeNotes.has(p)) {
          // Trigger onset only if it's a prominent peak or sudden energy surge
          if (isPeak || isSurge) {
            currentActivePitches.add(p);
            activeNotes.set(p, {
              pitch: p,
              startFrame: frameIdx,
              lastFrame: frameIdx,
              peakEnergy: energy,
              frameCount: 1,
            });
          }
        } else {
          // Note continuing: check if not decayed below 35% of peak
          const candidate = activeNotes.get(p)!;
          const isDecayed = energy < candidate.peakEnergy * 0.35;
          const isTooLong = (frameIdx - candidate.startFrame) * timePerFrame > 3.2; // Max 3.2s per piano note

          if (!isDecayed && !isTooLong) {
            currentActivePitches.add(p);
            candidate.lastFrame = frameIdx;
            candidate.frameCount++;
            if (energy > candidate.peakEnergy) {
              candidate.peakEnergy = energy;
            }
          }
        }
      }
    }

    // 4. Release notes that are no longer active
    for (const [p, candidate] of activeNotes.entries()) {
      if (!currentActivePitches.has(p)) {
        const durationSec = (candidate.lastFrame - candidate.startFrame + 1) * timePerFrame;
        if (durationSec >= minDurationSec) {
          const normVel = Math.min(127, Math.max(35, Math.round(Math.pow(candidate.peakEnergy / 0.12, 0.4) * 127)));
          finalizedNotes.push({
            pitch: candidate.pitch,
            startSec: candidate.startFrame * timePerFrame,
            durationSec: Math.min(3.5, durationSec),
            velocity: normVel,
          });
        }
        activeNotes.delete(p);
      }
    }

    prevEnergies = energies;
  }

  // Flush remaining notes
  for (const candidate of activeNotes.values()) {
    const durationSec = (candidate.lastFrame - candidate.startFrame + 1) * timePerFrame;
    if (durationSec >= minDurationSec) {
      const normVel = Math.min(127, Math.max(35, Math.round(Math.pow(candidate.peakEnergy / 0.12, 0.4) * 127)));
      finalizedNotes.push({
        pitch: candidate.pitch,
        startSec: candidate.startFrame * timePerFrame,
        durationSec: Math.min(2.5, durationSec),
        velocity: normVel,
      });
    }
  }

  onProgress?.(0.9, 'Convertendo notas para ticks da partitura...');

  const ticksPerSecond = (detectedBpm * TICKS_PER_BEAT) / 60;

  const notes: Note[] = finalizedNotes.map((n, idx) => {
    const startTick = Math.round(n.startSec * ticksPerSecond);
    const durationTicks = Math.max(60, Math.min(480 * 6, Math.round(n.durationSec * ticksPerSecond)));
    return {
      id: `audio-note-${Date.now()}-${idx}-${Math.random()}`,
      trackId: '',
      pitch: n.pitch,
      startTick,
      durationTicks,
      velocity: n.velocity,
      selected: false,
    };
  });

  // Sort notes chronologically
  notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

  onProgress?.(1.0, 'Transcrição concluída!');

  return {
    notes,
    detectedBpm,
    durationSeconds,
  };
}
