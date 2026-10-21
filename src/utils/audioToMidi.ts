import type { Note } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';
import { pitchToFrequency } from './musicMath.ts';

export interface AudioToMidiOptions {
  bpm?: number;
  sensitivity?: number; // 0.1 to 1.0 (default 0.5)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  minDurationSec?: number; // default 0.08s
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
export function estimateBpmFromAudioBuffer(audioBuffer: AudioBuffer): number {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const hopSize = Math.floor(sampleRate / 100); // 10ms hop
  const numFrames = Math.floor(channelData.length / hopSize);

  if (numFrames < 200) return 120; // Default if audio is too short

  // Energy envelope
  const envelope = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const start = i * hopSize;
    const end = Math.min(channelData.length, start + hopSize);
    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    envelope[i] = Math.sqrt(sum / (end - start));
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
 * Pure client-side polyphonic audio-to-MIDI transcription using Short-Time Fourier Transform (STFT),
 * peak interpolation, harmonic suppression, and energy-tracking.
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
    onProgress,
  } = options;

  const durationSeconds = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  onProgress?.(0.1, 'Estimando andamento (BPM)...');
  const detectedBpm = options.bpm || estimateBpmFromAudioBuffer(audioBuffer);

  onProgress?.(0.2, 'Analisando frequências e transientes...');

  // Pre-calculate target frequencies for piano pitches
  const pitchFrequencies = new Map<number, number>();
  for (let p = minPitch; p <= maxPitch; p++) {
    pitchFrequencies.set(p, pitchToFrequency(p));
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

  // Target energy threshold based on sensitivity (higher sensitivity = lower threshold)
  const baseThreshold = 0.015 * Math.pow(1 - sensitivity * 0.7, 2);

  interface ActiveNoteCandidate {
    pitch: number;
    startFrame: number;
    lastFrame: number;
    peakEnergy: number;
    totalEnergy: number;
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

  // Real/Imaginary arrays for simplified DFT around target frequencies
  // Instead of full N^2 DFT or heavy FFT, calculate Goertzel / discrete bins for standard 88 piano pitches!
  // This is order of magnitude faster and yields exact musical note binning.
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

  for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
    if (frameIdx % 50 === 0 && onProgress) {
      const p = 0.2 + 0.6 * (frameIdx / numFrames);
      onProgress(p, `Processando áudio (${Math.round((frameIdx / numFrames) * 100)}%)...`);
      // Yield to UI thread periodically
      await new Promise((r) => setTimeout(r, 0));
    }

    const startSample = frameIdx * hopSize;
    const energies = new Map<number, number>();

    // Compute energy for each target pitch bin using Goertzel algorithm
    for (const bin of pitchBins) {
      let q0 = 0;
      let q1 = 0;
      let q2 = 0;
      const coeff = 2 * bin.cosW;

      for (let i = 0; i < fftSize; i++) {
        const x = channelData[startSample + i] * window[i];
        q0 = x + coeff * q1 - q2;
        q2 = q1;
        q1 = q0;
      }

      const real = q1 - q2 * bin.cosW;
      const imag = q2 * bin.sinW;
      const mag = Math.sqrt(real * real + imag * imag) / fftSize;
      energies.set(bin.pitch, mag);
    }

    // Harmonic suppression: if fundamental pitch P has strong energy, attenuate 2P (+12 semitones) and 3P (+19 semitones)
    for (let p = minPitch; p <= maxPitch; p++) {
      const fundamental = energies.get(p) || 0;
      if (fundamental > baseThreshold * 1.5) {
        // Octave overtone (2nd harmonic: +12 semitones)
        const octavePitch = p + 12;
        if (octavePitch <= maxPitch) {
          const octaveEnergy = energies.get(octavePitch) || 0;
          energies.set(octavePitch, Math.max(0, octaveEnergy - fundamental * 0.45));
        }

        // 3rd harmonic (+19 semitones)
        const fifthPitch = p + 19;
        if (fifthPitch <= maxPitch) {
          const fifthEnergy = energies.get(fifthPitch) || 0;
          energies.set(fifthPitch, Math.max(0, fifthEnergy - fundamental * 0.35));
        }
      }
    }

    // Check which pitches are active in this frame
    const currentActivePitches = new Set<number>();
    for (let p = minPitch; p <= maxPitch; p++) {
      const energy = energies.get(p) || 0;
      if (energy > baseThreshold) {
        currentActivePitches.add(p);

        if (!activeNotes.has(p)) {
          // New note onset
          activeNotes.set(p, {
            pitch: p,
            startFrame: frameIdx,
            lastFrame: frameIdx,
            peakEnergy: energy,
            totalEnergy: energy,
            frameCount: 1,
          });
        } else {
          // Sustained note
          const existing = activeNotes.get(p)!;
          existing.lastFrame = frameIdx;
          existing.frameCount++;
          existing.totalEnergy += energy;
          if (energy > existing.peakEnergy) {
            existing.peakEnergy = energy;
          }
        }
      }
    }

    // Check for released notes (absent in this frame)
    for (const [p, candidate] of activeNotes.entries()) {
      if (!currentActivePitches.has(p)) {
        // Note ended
        const durationSec = (candidate.lastFrame - candidate.startFrame + 1) * timePerFrame;
        if (durationSec >= minDurationSec) {
          const normVel = Math.min(127, Math.max(25, Math.round(Math.pow(candidate.peakEnergy / 0.15, 0.4) * 127)));
          finalizedNotes.push({
            pitch: candidate.pitch,
            startSec: candidate.startFrame * timePerFrame,
            durationSec,
            velocity: normVel,
          });
        }
        activeNotes.delete(p);
      }
    }
  }

  // Flush remaining active notes
  for (const candidate of activeNotes.values()) {
    const durationSec = (candidate.lastFrame - candidate.startFrame + 1) * timePerFrame;
    if (durationSec >= minDurationSec) {
      const normVel = Math.min(127, Math.max(25, Math.round(Math.pow(candidate.peakEnergy / 0.15, 0.4) * 127)));
      finalizedNotes.push({
        pitch: candidate.pitch,
        startSec: candidate.startFrame * timePerFrame,
        durationSec,
        velocity: normVel,
      });
    }
  }

  onProgress?.(0.9, 'Convertendo notas para ticks da partitura...');

  // Convert seconds to ticks based on detected BPM
  // 1 beat = 480 ticks. 1 second = (BPM / 60) beats = (BPM * 480) / 60 ticks = BPM * 8 ticks.
  const ticksPerSecond = (detectedBpm * TICKS_PER_BEAT) / 60;

  const notes: Note[] = finalizedNotes.map((n, idx) => {
    const startTick = Math.round(n.startSec * ticksPerSecond);
    const durationTicks = Math.max(60, Math.round(n.durationSec * ticksPerSecond));
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
