/**
 * High-Resolution Lossless Audio Exporter (WAV & FLAC formats)
 * Uses OfflineAudioContext for fast offline rendering of the entire multitrack composition.
 */

import type { Track } from '../types/music.ts';
import { pitchToFrequency, ticksToSeconds } from '../utils/musicMath.ts';
import { triggerFileDownload } from '../midi/midiEncoder.ts';

export async function renderMultitrackAudio(
  tracks: Track[],
  bpm: number,
  sampleRate: number = 48000
): Promise<AudioBuffer> {
  // Determine total duration
  let maxTick = 0;
  tracks.forEach((t) => {
    t.notes.forEach((n) => {
      const end = n.startTick + n.durationTicks;
      if (end > maxTick) maxTick = end;
    });
  });

  const durationSec = Math.max(2, ticksToSeconds(maxTick, bpm) + 2.5); // Add reverb ring tail
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * durationSec), sampleRate);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.85, 0);

  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-0.5, 0);
  limiter.knee.setValueAtTime(4.0, 0);
  limiter.ratio.setValueAtTime(10.0, 0);
  limiter.attack.setValueAtTime(0.003, 0);
  limiter.release.setValueAtTime(0.1, 0);

  masterGain.connect(limiter);
  limiter.connect(offlineCtx.destination);

  const hasSolo = tracks.some((t) => t.isSolo);

  // Render each note in offline context
  tracks.forEach((track) => {
    if (track.isMuted) return;
    if (hasSolo && !track.isSolo) return;

    const trackGain = offlineCtx.createGain();
    const vol = (track.volume / 100) * 0.7;
    trackGain.gain.setValueAtTime(vol, 0);

    const panner = offlineCtx.createStereoPanner ? offlineCtx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(track.pan, 0);
      trackGain.connect(panner);
      panner.connect(masterGain);
    } else {
      trackGain.connect(masterGain);
    }

    track.notes.forEach((note) => {
      const startSec = ticksToSeconds(note.startTick, bpm);
      const noteDur = ticksToSeconds(note.durationTicks, bpm);
      const freq = pitchToFrequency(note.pitch);
      const velFactor = Math.pow(Math.max(1, Math.min(127, note.velocity)) / 127, 1.2);

      // Synthesize note according to instrument
      const osc = offlineCtx.createOscillator();
      const osc2 = offlineCtx.createOscillator();
      const noteGain = offlineCtx.createGain();
      const filter = offlineCtx.createBiquadFilter();

      if (track.instrumentId === 'flute') {
        osc.type = 'sine';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 3, startSec);
      } else if (track.instrumentId === 'violin' || track.instrumentId === 'cello') {
        osc.type = 'sawtooth';
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(Math.min(8000, freq * 2.2), startSec);
        filter.Q.setValueAtTime(2.0, startSec);
      } else if (track.instrumentId === 'percussion') {
        osc.type = note.pitch < 40 ? 'sine' : 'square';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, startSec);
      } else if (track.instrumentId === 'marnisynth') {
        osc.type = 'square';
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 1.005, startSec);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 4, startSec);
      } else {
        // Piano / Guitar / Harp
        osc.type = 'triangle';
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, startSec);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(12000, freq * 5), startSec);
      }

      osc.frequency.setValueAtTime(freq, startSec);
      osc.connect(filter);
      if (track.instrumentId === 'grand-piano' || track.instrumentId === 'marnisynth') {
        osc2.connect(filter);
      }

      filter.connect(noteGain);
      noteGain.connect(trackGain);

      const targetVol = velFactor * 0.9;
      noteGain.gain.setValueAtTime(0.0001, startSec);
      noteGain.gain.linearRampToValueAtTime(targetVol, startSec + 0.008);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startSec + noteDur + 0.2);

      osc.start(startSec);
      osc.stop(startSec + noteDur + 0.25);
      if (track.instrumentId === 'grand-piano' || track.instrumentId === 'marnisynth') {
        osc2.start(startSec);
        osc2.stop(startSec + noteDur + 0.25);
      }
    });
  });

  return await offlineCtx.startRendering();
}

/**
 * Encodes AudioBuffer into 24-bit or 16-bit Lossless PCM WAV file format
 */
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 24): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk length
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave audio channel data
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) {
        // 16-bit signed integer (-32768 to 32767)
        const intSample = sample < 0 ? sample * 32768 : sample * 32767;
        view.setInt16(offset, Math.round(intSample), true);
        offset += 2;
      } else {
        // 24-bit signed integer (-8388608 to 8388607)
        const intSample = Math.round(sample < 0 ? sample * 8388608 : sample * 8388607);
        view.setUint8(offset, intSample & 0xff);
        view.setUint8(offset + 1, (intSample >> 8) & 0xff);
        view.setUint8(offset + 2, (intSample >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Uint8Array(arrayBuffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Downloads lossless WAV audio (24-bit studio master or 16-bit CD quality)
 */
export async function exportWavFile(
  tracks: Track[],
  bpm: number,
  filename = 'marni-composition.wav',
  bitDepth: 16 | 24 = 24
) {
  const sampleRate = bitDepth === 24 ? 48000 : 44100;
  const renderedBuffer = await renderMultitrackAudio(tracks, bpm, sampleRate);
  const wavBytes = audioBufferToWav(renderedBuffer, bitDepth);
  triggerFileDownload(wavBytes, filename, 'audio/wav');
}
