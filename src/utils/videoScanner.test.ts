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
  analyzeKeyColumns,
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
    topYRatio: 0.65,
    lowestPitch: 60,
    highestPitch: 61,
    keyCount: 2,
    standardSize: null,
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

test('analyzeKeyColumns rejects flame/amber glow and bridges white letters inside bars', () => {
  const width = 600;
  const rows = 100;
  const data = new Uint8ClampedArray(width * rows * 4);

  const mockLayout = {
    keys: [
      { pitch: 48, isBlack: false, centerRatio: 0.2, widthRatio: 0.02 }, // C3 (Blue)
      { pitch: 55, isBlack: false, centerRatio: 0.5, widthRatio: 0.02 }, // G3 (Flame noise)
      { pitch: 60, isBlack: false, centerRatio: 0.7, widthRatio: 0.02 }, // C4 (Green with letter)
    ],
    whiteKeyWidthRatio: 0.02,
    blackKeyWidthRatio: 0.01,
    keyboardYRatio: 0.7,
    topYRatio: 0.65,
    lowestPitch: 48,
    highestPitch: 60,
    keyCount: 3,
    standardSize: null,
    score: 30,
  };

  const setPx = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  const x48 = Math.round(0.2 * width);
  const x55 = Math.round(0.5 * width);
  const x60 = Math.round(0.7 * width);

  // C3 (Pitch 48): Solid blue bar from y = 20 to y = 60
  for (let y = 20; y <= 60; y++) {
    for (let dx = -3; dx <= 3; dx++) setPx(x48 + dx, y, 40, 140, 240);
  }

  // G3 (Pitch 55): Amber/orange flame noise from y = 40 to y = 90 (Hue ~32 deg)
  for (let y = 40; y <= 90; y++) {
    for (let dx = -3; dx <= 3; dx++) setPx(x55 + dx, y, 180, 110, 30);
  }

  // C4 (Pitch 60): Green bar with white letter inside:
  // Green y = 30..45, White letter y = 46..49, Green y = 50..70
  for (let y = 30; y <= 70; y++) {
    const isLetter = y >= 46 && y <= 49;
    for (let dx = -3; dx <= 3; dx++) {
      if (isLetter) setPx(x60 + dx, y, 245, 245, 245);
      else setPx(x60 + dx, y, 50, 200, 40);
    }
  }

  const segments = analyzeKeyColumns(data, width, rows, 0, mockLayout, {
    colorOptions: {
      colorMode: 'two-colors',
      hand1Color: { r: 50, g: 200, b: 40 }, // Green
      hand2Color: { r: 40, g: 140, b: 240 }, // Blue
    },
  });

  const seg48 = segments.filter((s) => s.pitch === 48);
  const seg55 = segments.filter((s) => s.pitch === 55);
  const seg60 = segments.filter((s) => s.pitch === 60);

  // Pitch 48 (Blue) detected cleanly
  assert.equal(seg48.length, 1);
  assert.equal(seg48[0].yTop, 20);
  assert.equal(seg48[0].yBottom, 60);

  // Pitch 55 (Flame glow) REJECTED completely
  assert.equal(seg55.length, 0, 'Flame/amber glow must be rejected as noise');

  // Pitch 60 (Green with white letter) bridged into 1 contiguous segment, NOT split
  assert.equal(seg60.length, 1, 'Note letters must be bridged without splitting the bar');
  assert.equal(seg60[0].yTop, 30);
  assert.equal(seg60[0].yBottom, 70);
});

const makeLaneLayout = () => ({
  // 20px white keys on a 400px frame: C4 30, C#4 41, D4 50, D#4 61, E4 70
  keys: [
    { pitch: 60, isBlack: false, centerRatio: 30 / 400, widthRatio: 20 / 400 },
    { pitch: 61, isBlack: true, centerRatio: 41 / 400, widthRatio: 11 / 400 },
    { pitch: 62, isBlack: false, centerRatio: 50 / 400, widthRatio: 20 / 400 },
    { pitch: 63, isBlack: true, centerRatio: 61 / 400, widthRatio: 11 / 400 },
    { pitch: 64, isBlack: false, centerRatio: 70 / 400, widthRatio: 20 / 400 },
  ],
  whiteKeyWidthRatio: 20 / 400,
  blackKeyWidthRatio: 11 / 400,
  keyboardYRatio: 0.7,
  topYRatio: 0.65,
  lowestPitch: 60,
  highestPitch: 64,
  keyCount: 5,
  standardSize: null,
  score: 30,
});

const paint = (data: Uint8ClampedArray, width: number, x0: number, x1: number, y0: number, y1: number, rgb: number[]) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
};

test('analyzeKeyColumns does not turn note-name letters inside a white bar into black-key notes', () => {
  const width = 400;
  const rows = 40;
  const data = new Uint8ClampedArray(width * rows * 4);
  // D4 bar (white key, full key width) with an outlined white letter on rows 10..14
  paint(data, width, 41, 59, 0, 29, [56, 131, 216]);
  paint(data, width, 46, 54, 10, 14, [10, 20, 40]); // dark letter outline
  paint(data, width, 47, 53, 10, 14, [245, 245, 245]); // letter glyph

  const segments = analyzeKeyColumns(data, width, rows, 0, makeLaneLayout());
  assert.deepEqual(
    segments.map((s) => s.pitch),
    [62],
    'Only the white key D4 must be detected (no phantom C#4/D#4 from letter fragments)'
  );
  assert.equal(segments[0].yTop, 0);
  assert.equal(segments[0].yBottom, 29);
});

test('analyzeKeyColumns keeps two neighbouring black-key bars apart', () => {
  const width = 400;
  const rows = 30;
  const data = new Uint8ClampedArray(width * rows * 4);
  paint(data, width, 36, 46, 0, 19, [56, 131, 216]); // C#4
  paint(data, width, 56, 66, 0, 19, [56, 131, 216]); // D#4

  const pitches = analyzeKeyColumns(data, width, rows, 0, makeLaneLayout())
    .map((s) => s.pitch)
    .sort((a, b) => a - b);
  assert.deepEqual(pitches, [61, 63]);
});

test('analyzeKeyColumns splits repeated notes separated by background but bridges letter rows', () => {
  const width = 400;
  const rows = 60;
  const data = new Uint8ClampedArray(width * rows * 4);
  paint(data, width, 21, 39, 0, 20, [56, 131, 216]); // C4, first note
  paint(data, width, 21, 39, 8, 11, [245, 245, 245]); // letter spanning the full bar width
  paint(data, width, 21, 39, 26, 50, [56, 131, 216]); // C4, repeated note after a 5-row gap

  const segments = analyzeKeyColumns(data, width, rows, 0, makeLaneLayout()).filter((s) => s.pitch === 60);
  assert.equal(segments.length, 2, 'Background gap must split the repeated notes');
  assert.equal(segments[0].yTop, 0);
  assert.equal(segments[0].yBottom, 20);
  assert.equal(segments[1].yTop, 26);
});

test('buildNotesFromTape ignores static smoke seen by only a few frames', () => {
  const frames: FrameRecord[] = [];
  for (let i = 0; i < 40; i++) {
    const t = i * 0.033;
    const segments =
      i < 4
        ? [{ pitch: 70, yTop: 100, yBottom: 110, touchesTop: false, touchesBottom: false, rightVotes: 3, leftVotes: 0 }]
        : [];
    frames.push({ t, segments });
  }
  const notes = buildNotesFromTape(frames, { fallSpeed: 200, scanY: 150, areaTop: 0, startTime: 0, duration: 1.3 });
  assert.equal(notes.length, 0);
});

test('analyzeKeyColumns splits stacked repeated notes joined only by a dim seam', () => {
  const width = 400;
  const rows = 60;
  const data = new Uint8ClampedArray(width * rows * 4);
  // Two purple bars touching through 3 rows of dark purple shading (still coloured, but dim)
  paint(data, width, 21, 39, 0, 20, [160, 110, 240]);
  paint(data, width, 21, 39, 21, 23, [40, 25, 60]);
  paint(data, width, 21, 39, 24, 45, [160, 110, 240]);

  const segments = analyzeKeyColumns(data, width, rows, 0, makeLaneLayout(), { barBrightness: 240 }).filter(
    (s) => s.pitch === 60
  );
  assert.equal(segments.length, 2, 'The dim seam between stacked bars must split them');
});

test('analyzeKeyColumns reads a bar whose colour is not one of the hand colours', () => {
  const width = 400;
  const rows = 30;
  const data = new Uint8ClampedArray(width * rows * 4);
  paint(data, width, 41, 59, 0, 20, [60, 200, 70]); // green bar while the hands are set to blue/purple
  const segments = analyzeKeyColumns(data, width, rows, 0, makeLaneLayout(), {
    colorOptions: {
      colorMode: 'two-colors',
      hand1Color: { r: 168, g: 85, b: 247 },
      hand2Color: { r: 56, g: 131, b: 216 },
      splitPitch: 60,
    },
  });
  assert.deepEqual(
    segments.map((s) => s.pitch),
    [62]
  );
});

test('buildNotesFromTape keeps very short gaps between repeated notes despite a fall-speed error', () => {
  // Three notes separated by 0.04 s gaps on one key; the frames are read with a 4% speed error,
  // which blurs the tape by more than the gaps
  const trueSpeed = 120;
  const usedSpeed = trueSpeed * 1.04;
  const scanY = 330;
  const areaTop = 30;
  const notes = [
    [1.0, 1.29],
    [1.33, 1.58],
    [1.62, 1.85],
  ];
  const frames: FrameRecord[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 30;
    const segments = [];
    for (const [on, off] of notes) {
      const yBottom = scanY - (on - t) * trueSpeed;
      const yTop = scanY - (off - t) * trueSpeed;
      const top = Math.max(areaTop, yTop);
      const bottom = Math.min(scanY, yBottom);
      if (bottom - top < 3) continue;
      segments.push({
        pitch: 64,
        yTop: Math.round(top),
        yBottom: Math.round(bottom),
        touchesTop: yTop <= areaTop,
        touchesBottom: yBottom >= scanY,
        rightVotes: 5,
        leftVotes: 0,
      });
    }
    frames.push({ t, segments });
  }
  const out = buildNotesFromTape(frames, { fallSpeed: usedSpeed, scanY, areaTop, startTime: 0, duration: 4 });
  assert.equal(out.length, 3, `expected 3 notes, got ${out.map((n) => `${n.startSec.toFixed(2)}-${n.endSec.toFixed(2)}`).join(' ')}`);
});
