import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHsl,
  colorDistance,
  xToPianoPitch,
  fuseAudioAndVisionNotes,
  detectBarsInImageData,
  detectKeyboardLayoutFromRow,
  shiftLayoutOctave,
  buildNotesFromTape,
  estimateFallSpeed,
} from './videoScanner.ts';
import type { VisualNoteEvent, FrameRecord } from './videoScanner.ts';
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

test('xToPianoPitch accurately maps chromatic notes around Middle C using piano geometry', () => {
  const keyboardWidth = 1000;
  // In an 88-key piano, Middle C (60) is the 24th white key (index 23 out of 52)
  // Center is at (23.5 / 52) * 1000 = ~451.9px
  assert.equal(xToPianoPitch(452, keyboardWidth), 60);

  // C#4 (61) sits right on the boundary between C4 (23) and D4 (24) -> (24 / 52) * 1000 = ~461.5px
  assert.equal(xToPianoPitch(461.5, keyboardWidth), 61);

  // D4 (62) is the 25th white key (index 24) -> (24.5 / 52) * 1000 = ~471.2px
  assert.equal(xToPianoPitch(471, keyboardWidth), 62);
});

test('fuseAudioAndVisionNotes matches with +-1 semitone tolerance when calibration has minor offset', () => {
  const audioNotes: Note[] = [
    {
      id: 'a1',
      trackId: '',
      pitch: 60, // Audio heard Middle C
      startTick: 480,
      durationTicks: 480,
      velocity: 100,
    },
  ];

  // Visual detected pitch 61 due to slight keyboard slider shift
  const visualNotes: VisualNoteEvent[] = [
    {
      pitch: 61,
      startSec: 0.5,
      endSec: 1.0,
      hand: 'right',
      color: { r: 34, g: 197, b: 94 },
    },
  ];

  const result = fuseAudioAndVisionNotes(audioNotes, visualNotes, 120);
  assert.equal(result.allNotes.length, 1);
  assert.equal(result.matchedVisualCount, 1, 'Should match within +-1 semitone tolerance');
  assert.equal(result.rightHandNotes.length, 1, 'Should assign to right hand from visual note');
});

test('detectKeyboardLayoutFromRow accurately identifies 88-key piano keyboard layout from black key patterns', () => {
  const width = 1040;
  const whiteKeyWidth = width / 52; // 20px
  const rowData = new Uint8ClampedArray(width * 4);

  // Initialize with white keys (bright neutral, rgb 240, 240, 240)
  for (let px = 0; px < width; px++) {
    rowData[px * 4] = 240;
    rowData[px * 4 + 1] = 240;
    rowData[px * 4 + 2] = 240;
    rowData[px * 4 + 3] = 255;
  }

  // Paint black keys (dark neutral, rgb 20, 20, 20)
  // An 88-key piano starts at A0. White keys are: A0(0), B0(1), C1(2), D1(3), E1(4), F1(5), G1(6)...
  const blackW = 10;
  for (let b = 1; b < 52; b++) {
    const prevKeyFromC = (b - 1 + 5) % 7;
    const hasBlack = [0, 1, 3, 4, 5].includes(prevKeyFromC);
    if (hasBlack) {
      const centerX = Math.round(b * whiteKeyWidth);
      for (let x = centerX - Math.floor(blackW / 2); x <= centerX + Math.floor(blackW / 2); x++) {
        if (x >= 0 && x < width) {
          rowData[x * 4] = 20;
          rowData[x * 4 + 1] = 20;
          rowData[x * 4 + 2] = 20;
          rowData[x * 4 + 3] = 255;
        }
      }
    }
  }

  const layout = detectKeyboardLayoutFromRow(rowData, width, 0.7);
  assert.ok(layout !== null, 'Should detect valid keyboard layout');
  assert.ok(layout.keys.length >= 80, 'Should detect at least 80 keys');

  // Middle C is MIDI 60 (C4). Check that pitch 60 exists in layout
  const middleC = layout.keys.find((k) => k.pitch === 60);
  assert.ok(middleC !== undefined, 'Middle C (60) should be present in detected layout');
  assert.equal(middleC?.isBlack, false, 'Middle C should be a white key');
});

test('shiftLayoutOctave transposes detected layout pitches by exact octaves', () => {
  const mockLayout = {
    keys: [
      { pitch: 60, isBlack: false, centerRatio: 0.5, widthRatio: 0.02 },
      { pitch: 61, isBlack: true, centerRatio: 0.51, widthRatio: 0.01 },
    ],
    whiteKeyWidthRatio: 0.02,
    blackKeyWidthRatio: 0.01,
    keyboardYRatio: 0.7,
    lowestPitch: 60,
    highestPitch: 61,
    score: 30,
  };

  const shiftedUp = shiftLayoutOctave(mockLayout, 1);
  assert.equal(shiftedUp.keys[0].pitch, 72);
  assert.equal(shiftedUp.keys[1].pitch, 73);
  assert.equal(shiftedUp.lowestPitch, 72);

  const shiftedDown = shiftLayoutOctave(mockLayout, -1);
  assert.equal(shiftedDown.keys[0].pitch, 48);
  assert.equal(shiftedDown.keys[1].pitch, 49);
  assert.equal(shiftedDown.lowestPitch, 48);
});

test('buildNotesFromTape separates rapid repeated notes on the same pitch without merging', () => {
  const frames: FrameRecord[] = [];
  const fallSpeed = 200; // 200 px/s
  const scanY = 150;
  const areaTop = 50;

  // Note 1: reaches scanY at t = 0.5s, ends at t = 0.8s (duration 300ms)
  // Gap of 50ms (from 0.80s to 0.85s)
  // Note 2: reaches scanY at t = 0.85s, ends at t = 1.15s (duration 300ms)
  for (let frameIdx = 0; frameIdx < 60; frameIdx++) {
    const t = 0.1 + frameIdx * 0.033; // 30 fps
    const segments = [];

    const yBot1 = Math.round(scanY - (0.5 - t) * fallSpeed);
    const yTop1 = Math.round(scanY - (0.8 - t) * fallSpeed);
    if (yBot1 >= areaTop && yTop1 <= scanY) {
      segments.push({
        pitch: 60,
        yTop: Math.max(areaTop, yTop1),
        yBottom: Math.min(scanY, yBot1),
        touchesTop: yTop1 < areaTop,
        touchesBottom: yBot1 >= scanY,
        rightVotes: 10,
        leftVotes: 0,
      });
    }

    const yBot2 = Math.round(scanY - (0.85 - t) * fallSpeed);
    const yTop2 = Math.round(scanY - (1.15 - t) * fallSpeed);
    if (yBot2 >= areaTop && yTop2 <= scanY) {
      segments.push({
        pitch: 60,
        yTop: Math.max(areaTop, yTop2),
        yBottom: Math.min(scanY, yBot2),
        touchesTop: yTop2 < areaTop,
        touchesBottom: yBot2 >= scanY,
        rightVotes: 10,
        leftVotes: 0,
      });
    }

    frames.push({ t, segments });
  }

  const notes = buildNotesFromTape(frames, {
    fallSpeed,
    scanY,
    areaTop,
    startTime: 0,
    duration: 2.0,
  });

  assert.equal(notes.length, 2, 'Should detect exactly 2 separate notes, not 1 merged note');
  assert.equal(notes[0].pitch, 60);
  assert.equal(notes[1].pitch, 60);
  assert.ok(Math.abs(notes[0].startSec - 0.5) < 0.05, `Note 1 start time (${notes[0].startSec}) should be ~0.5s`);
  assert.ok(Math.abs(notes[1].startSec - 0.85) < 0.05, `Note 2 start time (${notes[1].startSec}) should be ~0.85s`);
});

test('estimateFallSpeed recovers true bar fall speed from frame displacements', () => {
  const trueSpeed = 240; // 240 px/s
  const frames: FrameRecord[] = [];

  for (let i = 0; i < 30; i++) {
    const t = i * 0.033; // 30 fps
    frames.push({
      t,
      segments: [
        {
          pitch: 60,
          yTop: Math.round(50 + t * trueSpeed),
          yBottom: Math.round(120 + t * trueSpeed),
          touchesTop: false,
          touchesBottom: false,
          rightVotes: 5,
          leftVotes: 0,
        },
      ],
    });
  }

  const speed = estimateFallSpeed(frames, 800);
  assert.ok(speed !== null, 'Fall speed should be estimated');
  assert.ok(Math.abs(speed - trueSpeed) < 6, `Estimated speed (${speed}) should be within +-6 px/s of ${trueSpeed}`);
});
