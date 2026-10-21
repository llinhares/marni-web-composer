import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateBpmFromAudioBuffer,
  transcribeAudioBufferToNotes,
} from './audioToMidi.ts';

// Helper to create a synthetic AudioBuffer-like mock
function createMockAudioBuffer(durationSec: number, sampleRate = 22050, sineFreq?: number): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const channelData = new Float32Array(length);

  if (sineFreq) {
    for (let i = 0; i < length; i++) {
      channelData[i] = Math.sin((2 * Math.PI * sineFreq * i) / sampleRate) * 0.7;
    }
  }

  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels: 1,
    getChannelData: () => channelData,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

test('estimateBpmFromAudioBuffer returns realistic BPM between 60 and 220', () => {
  const mockBuffer = createMockAudioBuffer(5, 22050, 440);
  const bpm = estimateBpmFromAudioBuffer(mockBuffer);
  assert.ok(bpm >= 60 && bpm <= 220, `BPM should be between 60 and 220, got ${bpm}`);
});

test('transcribeAudioBufferToNotes detects pitch for A4 (440Hz sine wave)', async () => {
  // 1 second of 440 Hz (MIDI pitch 69 / A4)
  const mockBuffer = createMockAudioBuffer(1.0, 22050, 440);
  const result = await transcribeAudioBufferToNotes(mockBuffer, {
    bpm: 120,
    sensitivity: 0.8,
  });

  assert.ok(result.notes.length > 0, 'Should detect at least one note');
  const hasA4 = result.notes.some((n) => n.pitch === 69);
  assert.ok(hasA4, `Should detect MIDI pitch 69 (A4 440Hz), detected pitches: ${result.notes.map((n) => n.pitch)}`);
});

test('transcribeAudioBufferToNotes returns empty array for silent audio buffer', async () => {
  const mockBuffer = createMockAudioBuffer(1.0, 22050); // all zeros
  const result = await transcribeAudioBufferToNotes(mockBuffer, {
    bpm: 120,
  });

  assert.equal(result.notes.length, 0, 'Silent buffer should have 0 notes');
});
