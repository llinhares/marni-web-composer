import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHsl,
  colorDistance,
  xToPianoPitch,
  fuseAudioAndVisionNotes,
  detectBarsInImageData,
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

  // All audio notes are preserved as the foundational backbone
  assert.equal(result.allNotes.length, 3, 'All audio notes should be preserved without dropping');
  assert.equal(result.rightHandNotes.length, 2, 'Right hand track should have 2 notes (1 matched + 1 split fallback)');
  assert.equal(result.leftHandNotes.length, 1, 'Left hand track should have 1 note');
  assert.equal(result.matchedVisualCount, 2, 'Should have matched 2 visual notes');

  // Verify velocity was inherited from matched audio
  assert.equal(result.rightHandNotes[0].velocity, 110);
  assert.equal(result.leftHandNotes[0].velocity, 85);
});

test('detectBarsInImageData ignores white smoke and detects colorful Synthesia bars', () => {
  const kbWidth = 100;
  // 100 pixels * 4 = 400 bytes
  const lineData = new Uint8ClampedArray(kbWidth * 4);

  // Pixel 0 to 30: White smoke / keys (rgb 255, 255, 255) -> should be IGNORED
  for (let i = 0; i < 30; i++) {
    lineData[i * 4] = 255;
    lineData[i * 4 + 1] = 255;
    lineData[i * 4 + 2] = 255;
    lineData[i * 4 + 3] = 255;
  }

  // Pixel 31 to 50: Black background (rgb 0, 0, 0) -> should be IGNORED
  for (let i = 31; i < 50; i++) {
    lineData[i * 4] = 0;
    lineData[i * 4 + 1] = 0;
    lineData[i * 4 + 2] = 0;
    lineData[i * 4 + 3] = 255;
  }

  // Pixel 50 to 60: Green Right Hand note (rgb 70, 220, 80)
  for (let i = 50; i < 60; i++) {
    lineData[i * 4] = 70;
    lineData[i * 4 + 1] = 220;
    lineData[i * 4 + 2] = 80;
    lineData[i * 4 + 3] = 255;
  }

  // Pixel 70 to 80: Blue Left Hand note (rgb 60, 150, 240)
  for (let i = 70; i < 80; i++) {
    lineData[i * 4] = 60;
    lineData[i * 4 + 1] = 150;
    lineData[i * 4 + 2] = 240;
    lineData[i * 4 + 3] = 255;
  }

  const segments = detectBarsInImageData(lineData, kbWidth, 21, 108);

  // Exactly 2 bars detected: Green and Blue. White smoke was completely filtered out!
  assert.equal(segments.length, 2, 'Should detect only the 2 colorful bars and filter out white smoke');
  assert.equal(segments[0].hand, 'right', 'First segment (Green) should be right hand');
  assert.equal(segments[1].hand, 'left', 'Second segment (Blue) should be left hand');
});
