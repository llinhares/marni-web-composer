import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHsl,
  colorDistance,
  xToPianoPitch,
  fuseAudioAndVisionNotes,
} from './videoScanner.ts';
import type { VisualNoteEvent } from './videoScanner.ts';
import type { Note } from '../types/music.ts';

test('rgbToHsl converts primary and secondary colors correctly', () => {
  const red = rgbToHsl(255, 0, 0);
  assert.equal(red.h, 0);
  assert.equal(red.s, 100);

  const green = rgbToHsl(0, 255, 0);
  assert.equal(green.h, 120);

  const blue = rgbToHsl(0, 0, 255);
  assert.equal(blue.h, 240);
});

test('colorDistance calculates Euclidean color distance accurately', () => {
  const c1 = { r: 0, g: 0, b: 0 };
  const c2 = { r: 100, g: 0, b: 0 };
  assert.equal(colorDistance(c1, c2), 100);

  const same = colorDistance(c1, c1);
  assert.equal(same, 0);
});

test('xToPianoPitch maps horizontal coordinates to 88 piano keys', () => {
  const keyboardWidth = 1000;
  // Leftmost edge -> Pitch 21 (A0)
  assert.equal(xToPianoPitch(0, keyboardWidth), 21);
  // Rightmost edge -> Pitch 108 (C8)
  assert.equal(xToPianoPitch(1000, keyboardWidth), 108);
  // Middle C (Pitch 60) is approximately at index (60 - 21) = 39 out of 88 keys (~44%)
  const middleX = Math.floor(keyboardWidth * (39.5 / 88));
  assert.equal(xToPianoPitch(middleX, keyboardWidth), 60);
});

test('fuseAudioAndVisionNotes merges velocity and separates right and left hands', () => {
  const visualNotes: VisualNoteEvent[] = [
    {
      pitch: 72, // C5
      startSec: 0.5,
      endSec: 1.0,
      hand: 'right',
      color: { r: 0, g: 255, b: 100 },
    },
    {
      pitch: 48, // C3
      startSec: 0.5,
      endSec: 1.5,
      hand: 'left',
      color: { r: 50, g: 100, b: 255 },
    },
  ];

  const audioNotes: Note[] = [
    {
      id: 'a1',
      trackId: '',
      pitch: 72,
      startTick: 480, // 0.5s at 120 BPM
      durationTicks: 480,
      velocity: 110,
    },
    {
      id: 'a2',
      trackId: '',
      pitch: 48,
      startTick: 480,
      durationTicks: 960,
      velocity: 85,
    },
    {
      id: 'a-phantom', // Overtone harmonic with no visual bar
      trackId: '',
      pitch: 84,
      startTick: 480,
      durationTicks: 480,
      velocity: 40,
    },
  ];

  const result = fuseAudioAndVisionNotes(audioNotes, visualNotes, 120);

  assert.equal(result.allNotes.length, 2, 'Should only produce 2 fused notes from visual ground truth');
  assert.equal(result.rightHandNotes.length, 1, 'Right hand track should have 1 note');
  assert.equal(result.leftHandNotes.length, 1, 'Left hand track should have 1 note');

  // Verify velocity was inherited from matched audio
  assert.equal(result.rightHandNotes[0].velocity, 110);
  assert.equal(result.leftHandNotes[0].velocity, 85);

  // Verify phantom overtone harmonic was suppressed
  assert.equal(result.suppressedHarmonicsCount, 1);
});
