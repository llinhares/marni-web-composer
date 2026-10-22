/**
 * High-Resolution Lossless Audio Exporter (WAV)
 * Renders offline through the same AudioEngine as live playback (sampled instruments, mix and
 * effects), so the exported file sounds exactly like the editor.
 */

import type { EffectorSettings, Track } from '../types/music.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { triggerFileDownload } from '../midi/midiEncoder.ts';

export function renderMultitrackAudio(
  tracks: Track[],
  bpm: number,
  effector: EffectorSettings,
  sampleRate: number = 48000
): Promise<AudioBuffer> {
  return AudioEngine.renderOffline(tracks, bpm, effector, sampleRate);
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
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
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
  effector: EffectorSettings,
  filename = 'marni-composition.wav',
  bitDepth: 16 | 24 = 24
) {
  const sampleRate = bitDepth === 24 ? 48000 : 44100;
  const renderedBuffer = await renderMultitrackAudio(tracks, bpm, effector, sampleRate);
  const wavBytes = audioBufferToWav(renderedBuffer, bitDepth);
  triggerFileDownload(wavBytes, filename, 'audio/wav');
}
