import type { Note } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

export type RGB = { r: number; g: number; b: number };

export interface VisualNoteEvent {
  pitch: number;
  startSec: number;
  endSec: number;
  hand: 'right' | 'left';
  color: RGB;
}

export interface DetectedBarSegment {
  centerX: number;
  width: number;
  pitch: number;
  color: RGB;
  hand: 'right' | 'left';
}

export interface ColorOptions {
  colorMode?: 'two-colors' | 'single-color' | 'auto';
  hand1Color?: RGB;
  hand2Color?: RGB;
  splitPitch?: number;
}

/** A key that currently has a bar touching the reading line (used for the live preview). */
export interface KeyHit {
  pitch: number;
  hand: 'right' | 'left';
  centerRatio: number; // 0..1 of the full video width
}

export interface VideoScanOptions {
  scanlineYRatio?: number; // 0.0 to 1.0 - bottom of the note-reading area (just above key glow/smoke)
  minPitch?: number; // fallback mode only
  maxPitch?: number; // fallback mode only
  keyboardXStartRatio?: number; // fallback mode only (no keyboard detected)
  keyboardXEndRatio?: number; // fallback mode only (no keyboard detected)
  brightnessThreshold?: number;
  minSaturation?: number;
  fps?: number; // sampling fps for the stepped-seek fallback
  startTime?: number; // Crop start in seconds
  endTime?: number; // Crop end in seconds
  colorMode?: 'two-colors' | 'single-color' | 'auto';
  hand1Color?: RGB; // Right hand target color
  hand2Color?: RGB; // Left hand target color
  splitPitch?: number; // Pitch used to split hands when colors are ambiguous / single-color
  keyboardLayout?: KeyboardLayout | null; // Pre-detected keyboard (unshifted). Auto-detected when omitted.
  octaveShift?: number; // Octave correction applied on top of the detected keyboard
  playbackRate?: number; // Accelerated playback rate used while scanning (default 4x)
  onProgress?: (progress: number, stage: string) => void;
  onFrameDetections?: (hits: KeyHit[], currentTime: number) => void;
}

export interface VideoScanResult {
  visualNotes: VisualNoteEvent[];
  dominantColors: {
    rightHand: RGB;
    leftHand: RGB;
  };
  totalFramesScanned: number;
  keyboardLayout: KeyboardLayout | null; // detected (unshifted) layout
  sampleFps: number; // analysed frames per second of media
  fallSpeedPxPerSec: number | null; // estimated bar fall speed (working-canvas px/s)
  method: 'tape' | 'scanline';
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/**
 * Converts Hex string (#22c55e) to RGB object.
 */
export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  if (isNaN(bigint)) return { r: 34, g: 197, b: 94 };
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

/**
 * Converts RGB numbers to Hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts RGB to HSL for color clustering and hand separation.
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Shortest angular distance (0-180) between two hues (0-360).
 */
export function hueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Calculates Euclidean color distance between two RGB colors.
 */
export function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ---------------------------------------------------------------------------
// Legacy fixed geometry (used only when the keyboard cannot be detected)
// ---------------------------------------------------------------------------

export interface PianoKeyInfo {
  pitch: number;
  isBlack: boolean;
  center: number;
}

/**
 * Pre-computed geometric layout of a standard 88-key piano keyboard (A0 to C8).
 * White keys are uniformly spaced (1/52 width each), and black keys are positioned
 * at the boundaries between adjacent white keys.
 */
export const PIANO_88_KEYS: PianoKeyInfo[] = (() => {
  const keys: PianoKeyInfo[] = [];
  const W_w = 1.0 / 52;
  let whiteIndex = 0;

  for (let p = 21; p <= 108; p++) {
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    let center: number;
    if (!isBlack) {
      center = (whiteIndex + 0.5) * W_w;
      whiteIndex++;
    } else {
      center = whiteIndex * W_w;
    }
    keys.push({ pitch: p, isBlack, center });
  }
  return keys;
})();

/**
 * Maps a horizontal pixel coordinate along the keyboard span to a standard piano MIDI pitch (21 to 108)
 * assuming the keyboard is a full 88-key piano spanning [0, keyboardWidth].
 */
export function xToPianoPitch(
  x: number,
  keyboardWidth: number,
  minPitch = 21,
  maxPitch = 108
): number {
  if (keyboardWidth <= 0) return minPitch;
  const ratio = Math.max(0, Math.min(1, x / keyboardWidth));

  let closestPitch = minPitch;
  let minDiff = Infinity;

  for (let i = 0; i < PIANO_88_KEYS.length; i++) {
    const key = PIANO_88_KEYS[i];
    if (key.pitch < minPitch || key.pitch > maxPitch) continue;
    const diff = Math.abs(ratio - key.center);
    if (diff < minDiff) {
      minDiff = diff;
      closestPitch = key.pitch;
    }
  }

  return closestPitch;
}

// ---------------------------------------------------------------------------
// Keyboard detection (reads the real keyboard drawn in the video)
// ---------------------------------------------------------------------------

export interface KeyboardKey {
  pitch: number;
  isBlack: boolean;
  centerRatio: number; // 0..1 of the full frame width
  widthRatio: number;
}

export interface KeyboardLayout {
  keys: KeyboardKey[];
  whiteKeyWidthRatio: number;
  blackKeyWidthRatio: number;
  keyboardYRatio: number; // row (0..1 of frame height) where the black keys were measured
  lowestPitch: number;
  highestPitch: number;
  score: number; // number of black keys that fit the piano pattern
}

const WHITE_KEY_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
// Boundaries (counted in white keys from a C) that hold a black key: C#, D#, F#, G#, A#
const BLACK_KEY_BOUNDARIES = new Set([1, 2, 4, 5, 6]);
const mod7 = (v: number) => ((v % 7) + 7) % 7;

/** White-key index (C0 = 0, D0 = 1 ... C4 = 28) to MIDI pitch. */
export function whiteIndexToPitch(whiteIndex: number): number {
  const octave = Math.floor(whiteIndex / 7);
  return 12 * (octave + 1) + WHITE_KEY_SEMITONES[mod7(whiteIndex)];
}

function percentileOf(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Detects the piano keyboard from a single pixel row crossing the black keys.
 * Black keys are located as dark neutral runs; the 2-3-2-3 grouping of their spacing
 * reveals exactly which keys are C#/D# and F#/G#/A#, so every key position comes from
 * the video itself (works for 88, 76, 61, 49-key or cropped/zoomed keyboards).
 */
export function detectKeyboardLayoutFromRow(
  rowData: Uint8ClampedArray,
  width: number,
  keyboardYRatio = 0
): KeyboardLayout | null {
  if (width < 120) return null;

  const lum = new Float32Array(width);
  const neutral = new Uint8Array(width);
  for (let px = 0; px < width; px++) {
    const i = px * 4;
    const r = rowData[i];
    const g = rowData[i + 1];
    const b = rowData[i + 2];
    lum[px] = 0.299 * r + 0.587 * g + 0.114 * b;
    neutral[px] = Math.max(r, g, b) - Math.min(r, g, b) < 60 ? 1 : 0;
  }

  const sortedLum = Float32Array.from(lum).sort();
  const p10 = percentileOf(sortedLum, 0.1);
  const p90 = percentileOf(sortedLum, 0.9);
  if (p90 - p10 < 80 || p90 < 150) return null;
  const threshold = (p10 + p90) / 2;

  // Dark neutral runs (pressed keys are colored, so they are excluded and treated as "missing")
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let px = 0; px <= width; px++) {
    const dark = px < width && lum[px] < threshold && neutral[px] === 1;
    if (dark) {
      if (runStart < 0) runStart = px;
    } else if (runStart >= 0) {
      runs.push({ start: runStart, end: px });
      runStart = -1;
    }
  }

  const widths = runs
    .map((r) => r.end - r.start)
    .filter((w) => w >= 3)
    .sort((a, b) => a - b);
  if (widths.length < 8) return null;
  const blackW = percentileOf(widths, 0.5);

  const candidates = runs.filter((r) => {
    const w = r.end - r.start;
    return w >= Math.max(2, blackW * 0.5) && w <= blackW * 1.6;
  });
  if (candidates.length < 8) return null;

  const centers = candidates.map((r) => (r.start + r.end) / 2);
  const gaps: number[] = [];
  for (let i = 0; i < centers.length - 1; i++) gaps.push(centers[i + 1] - centers[i]);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  // 3 of every 5 gaps are one white key wide (C#-D#, F#-G#, G#-A#)
  const unitGuess = percentileOf(sortedGaps, 0.3);
  if (unitGuess < blackW * 1.15) return null;

  const units = gaps.map((g) => Math.max(1, Math.round(g / unitGuess)));
  const unitEstimate = gaps.reduce((s, g) => s + g, 0) / units.reduce((s, u) => s + u, 0);

  const boundaries = [0];
  for (const u of units) boundaries.push(boundaries[boundaries.length - 1] + u);

  let bestShift = 0;
  let bestAligned = -1;
  for (let k = 0; k < 7; k++) {
    let aligned = 0;
    for (const b of boundaries) if (BLACK_KEY_BOUNDARIES.has(mod7(b + k))) aligned++;
    if (aligned > bestAligned) {
      bestAligned = aligned;
      bestShift = k;
    }
  }
  if (bestAligned < 8 || bestAligned / centers.length < 0.8) return null;

  // Least-squares fit: x = origin + whiteW * boundaryIndex
  let n = 0;
  let sB = 0;
  let sX = 0;
  let sBB = 0;
  let sBX = 0;
  boundaries.forEach((b, i) => {
    const B = b + bestShift;
    if (!BLACK_KEY_BOUNDARIES.has(mod7(B))) return;
    const x = centers[i];
    n++;
    sB += B;
    sX += x;
    sBB += B * B;
    sBX += B * x;
  });
  const denom = n * sBB - sB * sB;
  if (n < 8 || denom === 0) return null;
  const whiteW = (n * sBX - sB * sX) / denom;
  const origin = (sX - whiteW * sB) / n;
  if (!(whiteW > 0) || Math.abs(whiteW - unitEstimate) / unitEstimate > 0.2) return null;

  let residual = 0;
  boundaries.forEach((b, i) => {
    const B = b + bestShift;
    if (BLACK_KEY_BOUNDARIES.has(mod7(B))) residual += Math.abs(centers[i] - (origin + whiteW * B));
  });
  residual /= n;
  if (residual > whiteW * 0.25) return null;

  // Visible white keys
  const jMin = Math.ceil(-origin / whiteW - 0.3);
  const jMax = Math.floor((width - origin) / whiteW + 0.3) - 1;
  if (jMax - jMin + 1 < 14) return null;

  // Absolute octave: center the keyboard around E4/F4 (true for 88, 76, 61 and 49-key boards).
  // The user can still correct it with the octave shift control.
  const centerJ = (jMin + jMax) / 2;
  let octaveOffset = Math.round((30.5 - centerJ) / 7);
  while (jMin + 7 * octaveOffset < 0) octaveOffset++;
  while (jMax + 7 * octaveOffset > 67) octaveOffset--;

  // Map each black key pitch to its measured candidate center (or fitted line)
  const blackKeyX = new Map<number, number>();
  for (let B = jMin + 1; B <= jMax; B++) {
    if (!BLACK_KEY_BOUNDARIES.has(mod7(B))) continue;
    const pitch = whiteIndexToPitch(B - 1 + 7 * octaveOffset) + 1;
    if (pitch < 21 || pitch > 108) continue;
    const fittedX = origin + whiteW * B;
    let bestDist = whiteW * 0.35;
    let chosenX = fittedX;
    for (const cx of centers) {
      const d = Math.abs(cx - fittedX);
      if (d < bestDist) {
        bestDist = d;
        chosenX = cx;
      }
    }
    blackKeyX.set(pitch, chosenX);
  }

  // Generate 88 waterfall lane centers (pitches 21 to 108)
  const keys: KeyboardKey[] = [];
  for (let p = 21; p <= 108; p++) {
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    let cx = 0;
    if (isBlack) {
      cx = blackKeyX.get(p) ?? (origin + whiteW * ((p % 12) + 7 * Math.floor((p - 12) / 12)));
    } else {
      const note = p % 12;
      switch (note) {
        case 0: cx = (blackKeyX.get(p + 1) ?? 0) - 0.55 * whiteW; break;
        case 2: cx = ((blackKeyX.get(p - 1) ?? 0) + (blackKeyX.get(p + 1) ?? 0)) / 2; break;
        case 4: cx = (blackKeyX.get(p - 1) ?? 0) + 0.55 * whiteW; break;
        case 5: cx = (blackKeyX.get(p + 1) ?? 0) - 0.55 * whiteW; break;
        case 7: cx = ((blackKeyX.get(p - 1) ?? 0) + (blackKeyX.get(p + 1) ?? 0)) / 2; break;
        case 9:
          if (p === 21) cx = (blackKeyX.get(22) ?? 0) - 0.55 * whiteW;
          else cx = ((blackKeyX.get(p - 1) ?? 0) + (blackKeyX.get(p + 1) ?? 0)) / 2;
          break;
        case 11:
          if (p === 23) cx = (blackKeyX.get(22) ?? 0) + 0.55 * whiteW;
          else cx = (blackKeyX.get(p - 1) ?? 0) + 0.55 * whiteW;
          break;
      }
      if (p === 108) cx = (blackKeyX.get(106) ?? 0) + 1.1 * whiteW;
    }
    keys.push({
      pitch: p,
      isBlack,
      centerRatio: cx / width,
      widthRatio: (isBlack ? blackW : whiteW) / width,
    });
  }

  return {
    keys,
    whiteKeyWidthRatio: whiteW / width,
    blackKeyWidthRatio: blackW / width,
    keyboardYRatio,
    lowestPitch: 21,
    highestPitch: 108,
    score: bestAligned,
  };
}

/**
 * Searches the rows below `minYRatio` of a video frame for the piano keyboard and returns the best layout.
 */
export function detectKeyboardLayoutInFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  minYRatio = 0.4
): KeyboardLayout | null {
  ctx.drawImage(source, 0, 0, width, height);
  const startY = Math.max(0, Math.min(height - 1, Math.floor(height * minYRatio)));
  const rows = height - startY;
  if (rows <= 0) return null;

  const data = ctx.getImageData(0, startY, width, rows).data;
  const step = Math.max(1, Math.round(height * 0.006));
  let best: KeyboardLayout | null = null;

  for (let y = 0; y < rows; y += step) {
    const row = data.subarray(y * width * 4, (y + 1) * width * 4);
    const layout = detectKeyboardLayoutFromRow(row, width, (startY + y) / height);
    if (layout && (!best || layout.score > best.score)) best = layout;
  }
  return best;
}

/**
 * Checks that the detected keyboard is still on screen in a frame, using the pixel row where its
 * black keys were measured: black keys must be dark, white keys bright, pressed keys colored.
 * Intros, outros, title cards and scene cuts fail the check and are not read as notes.
 */
export function keyboardRowMatches(rowData: Uint8ClampedArray, width: number, layout: KeyboardLayout): boolean {
  const samples: Array<{ isBlack: boolean; lum: number; lit: boolean }> = [];
  for (const key of layout.keys) {
    const x = Math.round(key.centerRatio * width);
    if (x < 0 || x >= width) continue;
    const i = x * 4;
    const r = rowData[i];
    const g = rowData[i + 1];
    const b = rowData[i + 2];
    const maxC = Math.max(r, g, b);
    const sat = maxC > 0 ? (maxC - Math.min(r, g, b)) / maxC : 0;
    samples.push({ isBlack: key.isBlack, lum: 0.299 * r + 0.587 * g + 0.114 * b, lit: sat > 0.3 && maxC > 80 });
  }
  if (samples.length < 12) return false;

  const lit = samples.filter((s) => s.lit).length;
  if (lit > samples.length * 0.4) return false; // colored screen, not a keyboard with a few keys pressed

  const median = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted.length ? sorted[sorted.length >> 1] : 0;
  };
  const whiteLum = median(samples.filter((s) => !s.isBlack && !s.lit).map((s) => s.lum));
  const blackLum = median(samples.filter((s) => s.isBlack && !s.lit).map((s) => s.lum));
  // Key glow can lift black keys to mid grey, so the test is relative to this frame's contrast
  if (whiteLum - blackLum < 40) return false;
  const threshold = (whiteLum + blackLum) / 2;

  let matching = 0;
  for (const s of samples) {
    if (s.lit || (s.isBlack ? s.lum < threshold : s.lum >= threshold)) matching++;
  }
  return matching >= samples.length * 0.8;
}

/** Transposes a detected layout by whole octaves. */
export function shiftLayoutOctave(layout: KeyboardLayout, octaves: number): KeyboardLayout {
  if (!octaves) return layout;
  const delta = 12 * octaves;
  return {
    ...layout,
    keys: layout.keys.map((k) => ({ ...k, pitch: k.pitch + delta })),
    lowestPitch: layout.lowestPitch + delta,
    highestPitch: layout.highestPitch + delta,
  };
}

// ---------------------------------------------------------------------------
// Pixel classification
// ---------------------------------------------------------------------------

const PIXEL_DARK = 0;
const PIXEL_BRIGHT = 1; // white / grey: note-name letters, smoke, highlights (bridgeable)
const PIXEL_NOTE = 2;

interface PixelClassifier {
  minSat: number;
  minBright: number;
  h1: number | null;
  h2: number | null;
}

function makePixelClassifier(
  minSaturation: number,
  brightnessThreshold: number,
  colorOptions?: ColorOptions
): PixelClassifier {
  return {
    minSat: Math.min(minSaturation, 0.22),
    minBright: Math.min(brightnessThreshold, 40),
    h1: colorOptions?.hand1Color
      ? rgbToHsl(colorOptions.hand1Color.r, colorOptions.hand1Color.g, colorOptions.hand1Color.b).h
      : null,
    h2:
      colorOptions?.colorMode !== 'single-color' && colorOptions?.hand2Color
        ? rgbToHsl(colorOptions.hand2Color.r, colorOptions.hand2Color.g, colorOptions.hand2Color.b).h
        : null,
  };
}

function classifyPixel(r: number, g: number, b: number, c: PixelClassifier): number {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const delta = maxC - minC;
  const sat = maxC > 0 ? delta / maxC : 0;

  if (delta < 16 || sat < 0.16 || (r > 225 && g > 225 && b > 225)) {
    return maxC >= 140 ? PIXEL_BRIGHT : PIXEL_DARK;
  }
  if (maxC < c.minBright) return PIXEL_DARK;

  const h = rgbToHsl(r, g, b).h;

  if (c.h1 !== null || c.h2 !== null) {
    const matchH1 = c.h1 !== null && hueDistance(h, c.h1) <= 38;
    const matchH2 = c.h2 !== null && hueDistance(h, c.h2) <= 38;
    if (matchH1 || matchH2) {
      return PIXEL_NOTE;
    }
    const isTargetFlame =
      (c.h1 !== null && c.h1 >= 15 && c.h1 <= 60) || (c.h2 !== null && c.h2 >= 15 && c.h2 <= 60);
    if (!isTargetFlame && h >= 18 && h <= 55) {
      return PIXEL_DARK;
    }
    return maxC >= 140 ? PIXEL_BRIGHT : PIXEL_DARK;
  }

  if (h >= 18 && h <= 55) {
    return PIXEL_DARK;
  }
  if (sat >= c.minSat && delta >= 20) return PIXEL_NOTE;
  return maxC >= 140 ? PIXEL_BRIGHT : PIXEL_DARK;
}

// ---------------------------------------------------------------------------
// Hand classification
// ---------------------------------------------------------------------------

/**
 * Classifies whether a detected color is Right Hand or Left Hand based on user colors (Hue + RGB),
 * color mode, or pitch split fallback.
 */
export function classifyHand(
  r: number,
  g: number,
  b: number,
  pitch: number,
  options: ColorOptions = {}
): 'right' | 'left' {
  const {
    colorMode = 'two-colors',
    hand1Color = { r: 34, g: 197, b: 94 }, // Green
    hand2Color = { r: 56, g: 189, b: 248 }, // Blue
    splitPitch = 60,
  } = options;

  if (colorMode === 'single-color') {
    return pitch >= splitPitch ? 'right' : 'left';
  }

  // Hue first (invariant to 3D highlights and key-hit glow)
  const pixHsl = rgbToHsl(r, g, b);
  const h1Hsl = rgbToHsl(hand1Color.r, hand1Color.g, hand1Color.b);
  const h2Hsl = rgbToHsl(hand2Color.r, hand2Color.g, hand2Color.b);

  const hDist1 = hueDistance(pixHsl.h, h1Hsl.h);
  const hDist2 = hueDistance(pixHsl.h, h2Hsl.h);

  if (Math.abs(hDist1 - hDist2) >= 10) {
    return hDist1 <= hDist2 ? 'right' : 'left';
  }

  // Tie-breaker using Euclidean RGB distance
  const d1 = colorDistance({ r, g, b }, hand1Color);
  const d2 = colorDistance({ r, g, b }, hand2Color);

  if (Math.abs(d1 - d2) < 20) {
    return pitch >= splitPitch ? 'right' : 'left';
  }

  return d1 <= d2 ? 'right' : 'left';
}

function voteHand(right: number, left: number, pitch: number, splitPitch: number): 'right' | 'left' {
  if (right > left) return 'right';
  if (left > right) return 'left';
  return pitch >= splitPitch ? 'right' : 'left';
}

// ---------------------------------------------------------------------------
// Legacy single-line detection (fallback when no keyboard is visible)
// ---------------------------------------------------------------------------

/**
 * Collapses a 2D strip (kbWidth x stripHeight) into one line by keeping, per column,
 * the most chromatic pixel (skips white note-name letters and smoke).
 */
export function collapseStripToBestLine(
  stripData: Uint8ClampedArray,
  kbWidth: number,
  stripHeight: number
): Uint8ClampedArray {
  if (stripHeight <= 1) return stripData;

  const outLine = new Uint8ClampedArray(kbWidth * 4);
  const stepY = Math.max(1, Math.floor(stripHeight / 6));

  for (let px = 0; px < kbWidth; px++) {
    let bestScore = -1;
    let bestR = 0;
    let bestG = 0;
    let bestB = 0;

    for (let row = 0; row < stripHeight; row += stepY) {
      const idx = (row * kbWidth + px) * 4;
      const r = stripData[idx];
      const g = stripData[idx + 1];
      const b = stripData[idx + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const delta = maxC - minC;

      const isWhiteTextOrSmoke = (r > 210 && g > 210 && b > 210) || delta < 14;
      const sat = maxC > 0 ? delta / maxC : 0;
      const score = isWhiteTextOrSmoke ? delta * 0.05 : delta * (0.4 + sat);

      if (score > bestScore) {
        bestScore = score;
        bestR = r;
        bestG = g;
        bestB = b;
      }
    }

    const outIdx = px * 4;
    outLine[outIdx] = bestR;
    outLine[outIdx + 1] = bestG;
    outLine[outIdx + 2] = bestB;
    outLine[outIdx + 3] = 255;
  }

  return outLine;
}

/**
 * Scans a horizontal line of image data across the keyboard, grouping adjacent colorful
 * pixels into bar segments mapped with the fixed 88-key geometry.
 */
export function detectBarsInImageData(
  lineData: Uint8ClampedArray,
  kbWidth: number,
  minPitch = 21,
  maxPitch = 108,
  minSaturation = 0.2,
  brightnessThreshold = 38,
  colorOptions?: ColorOptions
): DetectedBarSegment[] {
  const segments: DetectedBarSegment[] = [];

  const h1Hsl = colorOptions?.hand1Color
    ? rgbToHsl(colorOptions.hand1Color.r, colorOptions.hand1Color.g, colorOptions.hand1Color.b)
    : null;
  const h2Hsl =
    colorOptions?.colorMode !== 'single-color' && colorOptions?.hand2Color
      ? rgbToHsl(colorOptions.hand2Color.r, colorOptions.hand2Color.g, colorOptions.hand2Color.b)
      : null;

  const effectiveMinSat = Math.min(minSaturation, 0.22);
  const effectiveMinBright = Math.min(brightnessThreshold, 40);

  let inSegment = false;
  let segmentStartX = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let pixelCount = 0;
  let gapCount = 0;

  const minBarWidth = Math.max(2, Math.floor(kbWidth / 240));
  const whiteKeyWidth = kbWidth / 52;
  const maxSingleBarWidth = Math.max(14, whiteKeyWidth * 1.45);

  const flushSegment = (endX: number) => {
    const segWidth = endX - segmentStartX;
    if (pixelCount >= minBarWidth && segWidth >= minBarWidth) {
      const avgR = Math.round(rSum / pixelCount);
      const avgG = Math.round(gSum / pixelCount);
      const avgB = Math.round(bSum / pixelCount);

      if (segWidth > maxSingleBarWidth && whiteKeyWidth >= 6) {
        const numKeys = Math.max(2, Math.round(segWidth / whiteKeyWidth));
        const subWidth = segWidth / numKeys;
        for (let k = 0; k < numKeys; k++) {
          const subCenterX = segmentStartX + (k + 0.5) * subWidth;
          const pitch = xToPianoPitch(subCenterX, kbWidth, minPitch, maxPitch);
          const hand = classifyHand(avgR, avgG, avgB, pitch, colorOptions);
          segments.push({
            centerX: subCenterX,
            width: Math.round(subWidth),
            pitch,
            color: { r: avgR, g: avgG, b: avgB },
            hand,
          });
        }
      } else {
        const centerX = segmentStartX + segWidth / 2;
        const pitch = xToPianoPitch(centerX, kbWidth, minPitch, maxPitch);
        const hand = classifyHand(avgR, avgG, avgB, pitch, colorOptions);
        segments.push({
          centerX,
          width: segWidth,
          pitch,
          color: { r: avgR, g: avgG, b: avgB },
          hand,
        });
      }
    }
    inSegment = false;
    pixelCount = 0;
    gapCount = 0;
  };

  for (let px = 0; px < kbWidth; px++) {
    const idx = px * 4;
    const r = lineData[idx];
    const g = lineData[idx + 1];
    const b = lineData[idx + 2];

    const brightness = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const delta = brightness - minC;
    const saturation = brightness > 0 ? delta / brightness : 0;

    const isWhiteOrGrey = delta < 16 || saturation < 0.15 || (r > 222 && g > 222 && b > 222);

    let matchesTargetColor = false;
    if (!isWhiteOrGrey && brightness >= effectiveMinBright) {
      const pixHsl = rgbToHsl(r, g, b);
      if (h1Hsl && colorOptions?.hand1Color) {
        const hDist1 = hueDistance(pixHsl.h, h1Hsl.h);
        const d1 = colorDistance({ r, g, b }, colorOptions.hand1Color);
        if (hDist1 <= 45 || d1 < 85) matchesTargetColor = true;
      }
      if (!matchesTargetColor && h2Hsl && colorOptions?.hand2Color) {
        const hDist2 = hueDistance(pixHsl.h, h2Hsl.h);
        const d2 = colorDistance({ r, g, b }, colorOptions.hand2Color);
        if (hDist2 <= 45 || d2 < 85) matchesTargetColor = true;
      }
    }

    const isNotePixel =
      !isWhiteOrGrey &&
      brightness >= effectiveMinBright &&
      (matchesTargetColor || (saturation >= effectiveMinSat && delta >= 20));

    if (isNotePixel) {
      if (!inSegment) {
        inSegment = true;
        segmentStartX = px;
        rSum = r;
        gSum = g;
        bSum = b;
        pixelCount = 1;
        gapCount = 0;
      } else {
        const prevHsl = rgbToHsl(
          Math.round(rSum / pixelCount),
          Math.round(gSum / pixelCount),
          Math.round(bSum / pixelCount)
        );
        const curHsl = rgbToHsl(r, g, b);

        if (hueDistance(prevHsl.h, curHsl.h) > 55) {
          flushSegment(px - gapCount);
          inSegment = true;
          segmentStartX = px;
          rSum = r;
          gSum = g;
          bSum = b;
          pixelCount = 1;
          gapCount = 0;
        } else {
          rSum += r;
          gSum += g;
          bSum += b;
          pixelCount++;
          gapCount = 0;
        }
      }
    } else if (inSegment) {
      gapCount++;
      if (gapCount > 2) {
        flushSegment(px - gapCount + 1);
      }
    }
  }

  if (inSegment) {
    flushSegment(kbWidth - gapCount);
  }

  return segments;
}

/**
 * Legacy helper: reads a small strip above scanY inside the manual keyboard bounds and detects bars.
 */
export function detectBarsFromVideoContext(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  options: {
    scanlineYRatio: number;
    keyboardXStartRatio: number;
    keyboardXEndRatio: number;
    minPitch: number;
    maxPitch: number;
    minSaturation: number;
    brightnessThreshold: number;
    colorMode: 'two-colors' | 'single-color' | 'auto';
    hand1Color: RGB;
    hand2Color: RGB;
    splitPitch: number;
  }
): DetectedBarSegment[] {
  ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

  const scanY = Math.max(2, Math.min(canvasHeight - 2, Math.round(canvasHeight * options.scanlineYRatio)));
  const kbStartX = Math.max(0, Math.round(canvasWidth * options.keyboardXStartRatio));
  const kbEndX = Math.min(canvasWidth, Math.round(canvasWidth * options.keyboardXEndRatio));
  const kbWidth = Math.max(10, kbEndX - kbStartX);

  const stripHeight = Math.max(3, Math.round(canvasHeight * 0.008));
  const stripTopY = Math.max(0, scanY - stripHeight + 1);
  const actualStripH = scanY - stripTopY + 1;

  const stripData = ctx.getImageData(kbStartX, stripTopY, kbWidth, actualStripH).data;
  const bestLine = collapseStripToBestLine(stripData, kbWidth, actualStripH);

  return detectBarsInImageData(
    bestLine,
    kbWidth,
    options.minPitch,
    options.maxPitch,
    options.minSaturation,
    options.brightnessThreshold,
    {
      colorMode: options.colorMode,
      hand1Color: options.hand1Color,
      hand2Color: options.hand2Color,
      splitPitch: options.splitPitch,
    }
  );
}

// ---------------------------------------------------------------------------
// Per-key vertical column analysis
// ---------------------------------------------------------------------------

/** A vertical run of bar color found in one key column of one frame (y in working-canvas px). */
export interface KeyColumnSegment {
  pitch: number;
  yTop: number;
  yBottom: number;
  touchesTop: boolean; // bar continues above the reading area (top edge not visible)
  touchesBottom: boolean; // bar is crossing the reading line (bottom edge not visible)
  rightVotes: number;
  leftVotes: number;
}

export interface FrameRecord {
  t: number; // media time of the analysed frame (seconds)
  segments: KeyColumnSegment[];
}

interface Lane {
  pitch: number;
  isBlack: boolean;
  x: number;
}

function nearestLane(lanes: Lane[], x: number): Lane | null {
  if (lanes.length === 0) return null;
  let lo = 0;
  let hi = lanes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lanes[mid].x <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(lanes[lo].x - x) <= Math.abs(lanes[hi].x - x) ? lanes[lo] : lanes[hi];
}

/**
 * Finds every falling bar in the note area and assigns it to a key lane by its horizontal
 * position AND width (white-key bars are about one white key wide, black-key bars are narrower).
 *
 * Per row, colored pixels are grouped into runs. Note-name letters (white glyphs with dark
 * outlines) cut a bar into fragments, so fragments are re-joined only while the joined extent still
 * fits inside a single bar: two neighbouring bars can never be merged, and a letter can never turn a
 * white bar into a phantom black-key note. Runs wider than one bar (touching neighbours) are split.
 *
 * Vertically, rows of the same lane are joined across letter rows (bar content under the lane center)
 * while gaps of plain background always split the bar, preserving repeated notes.
 *
 * `data` holds `rows` image rows starting at `areaTopY`, full frame width.
 */
export function analyzeKeyColumns(
  data: Uint8ClampedArray,
  width: number,
  rows: number,
  areaTopY: number,
  layout: KeyboardLayout,
  opts: {
    minSaturation?: number;
    brightnessThreshold?: number;
    colorOptions?: ColorOptions;
    bridgeRows?: number;
  } = {}
): KeyColumnSegment[] {
  const classifier = makePixelClassifier(opts.minSaturation ?? 0.2, opts.brightnessThreshold ?? 38, opts.colorOptions);
  const bridgeRows = opts.bridgeRows ?? 14;
  const wPx = layout.whiteKeyWidthRatio * width;
  const lanes: Lane[] = layout.keys
    .map((k) => ({ pitch: k.pitch, isBlack: k.isBlack, x: k.centerRatio * width }))
    .filter((l) => l.x >= 0 && l.x < width)
    .sort((a, b) => a.x - b.x);
  const whiteLanes = lanes.filter((l) => !l.isBlack);
  if (lanes.length === 0 || !(wPx > 0)) return [];

  const minRunW = Math.max(2, wPx * 0.25);
  const maxBarW = wPx * 1.2; // widest extent a single bar (plus anti-aliasing) can have
  const minWhiteW = wPx * 0.72; // narrower runs may be black-key bars or the rounded cap of a white bar
  const maxFragmentGap = Math.max(2, Math.round(wPx * 0.55));
  const bridgeRadius = Math.max(1, Math.round(wPx * 0.25));

  // marks[pitch][y]: 0 = empty, 1 = right hand, 2 = left hand
  const marks = new Map<number, Uint8Array>();
  const mark = (pitch: number, y: number, hand: 'right' | 'left') => {
    let m = marks.get(pitch);
    if (!m) {
      m = new Uint8Array(rows);
      marks.set(pitch, m);
    }
    m[y] = hand === 'right' ? 1 : 2;
  };

  const rowClass = new Uint8Array(width);
  const fragStart: number[] = [];
  const fragEnd: number[] = [];

  for (let y = 0; y < rows; y++) {
    const rowOff = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowOff + x * 4;
      rowClass[x] = classifyPixel(data[i], data[i + 1], data[i + 2], classifier);
    }

    // 1. Solid fragments of note pixels (1px anti-aliasing holes tolerated)
    fragStart.length = 0;
    fragEnd.length = 0;
    let s = -1;
    let last = -1;
    for (let x = 0; x <= width; x++) {
      const isNote = x < width && rowClass[x] === PIXEL_NOTE;
      if (isNote) {
        if (s < 0) s = x;
        else if (x - last > 2) {
          fragStart.push(s);
          fragEnd.push(last);
          s = x;
        }
        last = x;
      }
    }
    if (s >= 0) {
      fragStart.push(s);
      fragEnd.push(last);
    }

    // 2. Re-join fragments of the same bar, then assign each bar to a lane
    const assign = (gs: number, ge: number) => {
      const w = ge - gs + 1;
      if (w < minRunW) return;
      const parts = w > maxBarW ? Math.max(2, Math.round(w / wPx)) : 1;
      const partW = w / parts;
      for (let p = 0; p < parts; p++) {
        const ps = gs + p * partW;
        const center = ps + partW / 2 - 0.5;
        const lane = nearestLane(partW >= minWhiteW ? whiteLanes : lanes, center);
        if (!lane || Math.abs(lane.x - center) > wPx * (lane.isBlack ? 0.35 : 0.45)) continue;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let n = 0;
        for (let x = Math.round(ps); x < Math.round(ps + partW); x++) {
          if (rowClass[x] !== PIXEL_NOTE) continue;
          const i = rowOff + x * 4;
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          n++;
        }
        if (n === 0) continue;
        mark(lane.pitch, y, classifyHand(rSum / n, gSum / n, bSum / n, lane.pitch, opts.colorOptions));
      }
    };

    let gs = -1;
    let ge = -1;
    for (let f = 0; f < fragStart.length; f++) {
      const fs = fragStart[f];
      const fe = fragEnd[f];
      if (gs < 0) {
        gs = fs;
        ge = fe;
      } else if (fs - ge - 1 <= maxFragmentGap && fe - gs + 1 <= maxBarW && ge - gs + 1 <= maxBarW) {
        ge = fe;
      } else {
        assign(gs, ge);
        gs = fs;
        ge = fe;
      }
    }
    if (gs >= 0) assign(gs, ge);
  }

  // 3. Vertical runs per lane
  const laneX = new Map(lanes.map((l) => [l.pitch, Math.round(l.x)]));
  const hasBarContent = (cx: number, y: number) => {
    const rowOff = y * width * 4;
    for (let x = Math.max(0, cx - bridgeRadius); x <= Math.min(width - 1, cx + bridgeRadius); x++) {
      const i = rowOff + x * 4;
      if (Math.max(data[i], data[i + 1], data[i + 2]) >= 90) return true;
    }
    return false;
  };

  const segments: KeyColumnSegment[] = [];
  for (const [pitch, m] of marks) {
    const cx = laneX.get(pitch) ?? 0;
    let segStart = -1;
    let lastNote = -1;
    let rv = 0;
    let lv = 0;

    const flush = () => {
      if (segStart >= 0 && lastNote - segStart + 1 >= 3) {
        segments.push({
          pitch,
          yTop: areaTopY + segStart,
          yBottom: areaTopY + lastNote,
          touchesTop: segStart <= 1,
          touchesBottom: lastNote >= rows - 2,
          rightVotes: rv,
          leftVotes: lv,
        });
      }
      segStart = -1;
      lastNote = -1;
      rv = 0;
      lv = 0;
    };

    for (let y = 0; y < rows; y++) {
      if (m[y] === 0) continue;
      if (segStart >= 0) {
        const gap = y - lastNote - 1;
        let bridged = gap <= 1;
        if (!bridged && gap <= bridgeRows) {
          bridged = true;
          for (let gy = lastNote + 1; gy < y; gy++) {
            if (!hasBarContent(cx, gy)) {
              bridged = false;
              break;
            }
          }
        }
        if (!bridged) flush();
      }
      if (segStart < 0) segStart = y;
      lastNote = y;
      if (m[y] === 1) rv++;
      else lv++;
    }
    flush();
  }

  return segments;
}

function segmentsToHits(segments: KeyColumnSegment[], layout: KeyboardLayout, splitPitch: number): KeyHit[] {
  const centerByPitch = new Map(layout.keys.map((k) => [k.pitch, k.centerRatio]));
  const byPitch = new Map<number, KeyHit>();
  for (const s of segments) {
    if (byPitch.has(s.pitch)) continue;
    byPitch.set(s.pitch, {
      pitch: s.pitch,
      hand: voteHand(s.rightVotes, s.leftVotes, s.pitch, splitPitch),
      centerRatio: centerByPitch.get(s.pitch) ?? 0,
    });
  }
  return [...byPitch.values()];
}

export interface KeyHitDetectionOptions {
  scanlineYRatio: number;
  keyboardXStartRatio: number;
  keyboardXEndRatio: number;
  minPitch: number;
  maxPitch: number;
  minSaturation: number;
  brightnessThreshold: number;
  colorMode: 'two-colors' | 'single-color' | 'auto';
  hand1Color: RGB;
  hand2Color: RGB;
  splitPitch: number;
  layout?: KeyboardLayout | null;
}

/**
 * Detects which keys have a bar touching the reading line in the current frame (live preview).
 */
export function detectKeyHitsFromVideoContext(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  width: number,
  height: number,
  o: KeyHitDetectionOptions
): KeyHit[] {
  const colorOptions: ColorOptions = {
    colorMode: o.colorMode,
    hand1Color: o.hand1Color,
    hand2Color: o.hand2Color,
    splitPitch: o.splitPitch,
  };

  const layout = o.layout ?? detectKeyboardLayoutInFrame(ctx, video, width, height, Math.min(0.45, o.scanlineYRatio * 0.75));

  if (layout) {
    ctx.drawImage(video, 0, 0, width, height);
    const scanY = Math.max(4, Math.min(height - 2, Math.round(height * o.scanlineYRatio)));
    const stripH = Math.max(6, Math.round(height * 0.025));
    const top = Math.max(0, scanY - stripH + 1);
    const rows = scanY - top + 1;
    const data = ctx.getImageData(0, top, width, rows).data;
    const segments = analyzeKeyColumns(data, width, rows, top, layout, {
      minSaturation: o.minSaturation,
      brightnessThreshold: o.brightnessThreshold,
      colorOptions,
      bridgeRows: 2,
    });
    return segmentsToHits(
      segments.filter((s) => s.touchesBottom),
      layout,
      o.splitPitch
    );
  }

  const segs = detectBarsFromVideoContext(ctx, video, width, height, {
    scanlineYRatio: o.scanlineYRatio,
    keyboardXStartRatio: o.keyboardXStartRatio,
    keyboardXEndRatio: o.keyboardXEndRatio,
    minPitch: o.minPitch,
    maxPitch: o.maxPitch,
    minSaturation: o.minSaturation,
    brightnessThreshold: o.brightnessThreshold,
    colorMode: o.colorMode,
    hand1Color: o.hand1Color,
    hand2Color: o.hand2Color,
    splitPitch: o.splitPitch,
  });
  const kbStartX = Math.max(0, Math.round(width * o.keyboardXStartRatio));
  return segs.map((s) => ({ pitch: s.pitch, hand: s.hand, centerRatio: (kbStartX + s.centerX) / width }));
}

// ---------------------------------------------------------------------------
// Note reconstruction ("tape" model)
// ---------------------------------------------------------------------------

/**
 * Estimates the constant bar fall speed (px/s) by matching bar edges of the same key
 * between frames ~0.15-0.6 s apart. Static overlays and rising smoke never vote.
 */
export function estimateFallSpeed(frames: FrameRecord[], maxSpeed: number): number | null {
  if (frames.length < 2 || maxSpeed <= 0) return null;
  const BIN = 2;
  const binCount = Math.ceil(maxSpeed / BIN) + 2;
  const hist = new Float64Array(binCount);
  const samples: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    const A = frames[i];
    for (let k = i + 1; k < frames.length; k++) {
      const dt = frames[k].t - A.t;
      if (dt < 0.12) continue;
      if (dt > 0.55) break;
      const B = frames[k];

      const edgesB = new Map<number, number[]>();
      const addEdge = (key: number, y: number) => {
        const list = edgesB.get(key);
        if (list) list.push(y);
        else edgesB.set(key, [y]);
      };
      for (const s of B.segments) {
        if (!s.touchesBottom) addEdge(s.pitch * 2, s.yBottom);
        if (!s.touchesTop) addEdge(s.pitch * 2 + 1, s.yTop);
      }

      for (const s of A.segments) {
        const edges: Array<[number, number]> = [];
        if (!s.touchesBottom) edges.push([s.pitch * 2, s.yBottom]);
        if (!s.touchesTop) edges.push([s.pitch * 2 + 1, s.yTop]);
        for (const [key, yA] of edges) {
          const list = edgesB.get(key);
          if (!list) continue;
          for (const yB of list) {
            const shift = yB - yA;
            if (shift <= 0) continue;
            const v = shift / dt;
            if (v >= maxSpeed) continue;
            hist[Math.floor(v / BIN)]++;
            samples.push(v);
          }
        }
      }
    }
    if (samples.length > 200000) break;
  }

  let bestBin = -1;
  let bestScore = 0;
  for (let k = 1; k < binCount - 1; k++) {
    const score = hist[k - 1] + 2 * hist[k] + hist[k + 1];
    if (score > bestScore) {
      bestScore = score;
      bestBin = k;
    }
  }
  if (bestBin < 0 || bestScore < 8) return null;

  const center = (bestBin + 0.5) * BIN;
  const near = samples.filter((v) => Math.abs(v - center) <= Math.max(BIN * 1.5, center * 0.03));
  if (near.length < 4) return null;
  return near.reduce((s, v) => s + v, 0) / near.length;
}

/**
 * Rebuilds the notes from every analysed frame. Because bars fall at a constant speed, each frame
 * reveals a window of the "piano-roll tape": a bar at height y in a frame taken at time t reaches the
 * reading line at t + (scanY - y) / speed. Every frame votes on that tape and a time bin is active only
 * when most frames that saw it agree, which removes particles, letters, static overlays and frame drops,
 * while the small dark gaps between repeated notes are preserved.
 */
export function buildNotesFromTape(
  frames: FrameRecord[],
  params: {
    fallSpeed: number;
    scanY: number;
    areaTop: number;
    areaBottom?: number; // lowest analysed row (defaults to scanY)
    startTime: number;
    duration: number;
    splitPitch?: number;
    hand1Color?: RGB;
    hand2Color?: RGB;
  }
): VisualNoteEvent[] {
  const { fallSpeed, scanY, areaTop, startTime, duration } = params;
  const areaBottom = Math.min(scanY, params.areaBottom ?? scanY);
  const splitPitch = params.splitPitch ?? 60;
  const hand1Color = params.hand1Color ?? { r: 34, g: 197, b: 94 };
  const hand2Color = params.hand2Color ?? { r: 56, g: 189, b: 248 };
  if (!(fallSpeed > 0)) return [];

  const BIN = 0.01;
  const lookahead = (scanY - areaTop) / fallSpeed;
  const blindAhead = (scanY - areaBottom) / fallSpeed; // tape between the area bottom and the reading line
  const totalBins = Math.ceil((duration + lookahead) / BIN) + 2;
  const observed = new Uint16Array(totalBins);
  const tapes = new Map<number, { colored: Uint16Array; right: Uint16Array; left: Uint16Array }>();

  const toBin = (sec: number) => Math.max(0, Math.min(totalBins - 1, Math.round(sec / BIN)));

  for (const frame of frames) {
    const rel = frame.t - startTime;
    if (rel < -lookahead || rel > duration) continue;

    const b0 = toBin(rel + blindAhead);
    const b1 = toBin(rel + lookahead);
    for (let b = b0; b <= b1; b++) if (observed[b] < 65535) observed[b]++;

    for (const s of frame.segments) {
      const tauBottom = rel + (scanY - s.yBottom) / fallSpeed;
      const tauTop = rel + (scanY - s.yTop) / fallSpeed;
      let tape = tapes.get(s.pitch);
      if (!tape) {
        tape = {
          colored: new Uint16Array(totalBins),
          right: new Uint16Array(totalBins),
          left: new Uint16Array(totalBins),
        };
        tapes.set(s.pitch, tape);
      }
      const isRight = voteHand(s.rightVotes, s.leftVotes, s.pitch, splitPitch) === 'right';
      const sb = Math.max(b0, toBin(tauBottom));
      const eb = Math.min(b1, toBin(tauTop));
      for (let b = sb; b <= eb; b++) {
        if (tape.colored[b] < 65535) tape.colored[b]++;
        if (isRight) {
          if (tape.right[b] < 65535) tape.right[b]++;
        } else if (tape.left[b] < 65535) {
          tape.left[b]++;
        }
      }
    }
  }

  const notes: VisualNoteEvent[] = [];
  for (const [pitch, tape] of tapes) {
    let start = -1;
    let rv = 0;
    let lv = 0;
    let gapBins = 0;
    for (let b = 0; b <= totalBins; b++) {
      // Majority of the frames that saw this instant must agree (particles and glitches never do)
      const isColored =
        b < totalBins &&
        observed[b] >= 1 &&
        tape.colored[b] >= Math.min(2, observed[b]) &&
        tape.colored[b] * 2 >= observed[b];

      if (isColored) {
        if (start < 0) {
          start = b;
          rv = 0;
          lv = 0;
        }
        gapBins = 0;
        rv += tape.right[b];
        lv += tape.left[b];
      } else if (start >= 0) {
        // Bridge single-bin flicker (<= 10ms gap) if the next bin is colored
        gapBins++;
        if (gapBins > 1 || b >= totalBins) {
          const endBin = b - gapBins;
          const startSec = start * BIN;
          const endSec = endBin * BIN;
          if (endSec - startSec >= 0.03 && startSec < duration) {
            const hand = voteHand(rv, lv, pitch, splitPitch);
            notes.push({
              pitch,
              startSec,
              endSec,
              hand,
              color: hand === 'right' ? hand1Color : hand2Color,
            });
          }
          start = -1;
          gapBins = 0;
        }
      }
    }
  }

  notes.sort((a, b) => a.startSec - b.startSec || a.pitch - b.pitch);
  return notes;
}

/**
 * Temporal fallback: tracks keys touching the reading line over time (used when no keyboard
 * or no fall speed could be established).
 */
function createScanlineTracker(splitPitch: number) {
  interface Tracked {
    pitch: number;
    startSec: number;
    lastSec: number;
    lastDt: number;
    frames: number;
    right: number;
    left: number;
  }
  const active = new Map<number, Tracked>();
  const notes: Array<{ pitch: number; startSec: number; endSec: number; hand: 'right' | 'left' }> = [];

  const finalize = (n: Tracked) => {
    const end = n.lastSec + n.lastDt;
    if (n.frames >= 2 || end - n.startSec >= 0.08) {
      notes.push({
        pitch: n.pitch,
        startSec: n.startSec,
        endSec: end,
        hand: voteHand(n.right, n.left, n.pitch, splitPitch),
      });
    }
  };

  return {
    track(rel: number, dt: number, hits: Array<{ pitch: number; hand: 'right' | 'left' }>) {
      const present = new Set<number>();
      for (const h of hits) {
        present.add(h.pitch);
        const n = active.get(h.pitch);
        if (n) {
          n.lastSec = rel;
          n.lastDt = dt;
          n.frames++;
          if (h.hand === 'right') n.right++;
          else n.left++;
        } else {
          active.set(h.pitch, {
            pitch: h.pitch,
            startSec: rel,
            lastSec: rel,
            lastDt: dt,
            frames: 1,
            right: h.hand === 'right' ? 1 : 0,
            left: h.hand === 'left' ? 1 : 0,
          });
        }
      }
      for (const [pitch, n] of active) {
        if (present.has(pitch)) {
          if (rel - n.startSec > 12) {
            finalize(n);
            active.delete(pitch);
          }
          continue;
        }
        if (rel - n.lastSec > Math.max(0.045, 1.6 * dt)) {
          finalize(n);
          active.delete(pitch);
        }
      }
    },
    finish() {
      for (const n of active.values()) finalize(n);
      active.clear();
      notes.sort((a, b) => a.startSec - b.startSec || a.pitch - b.pitch);
      return notes;
    },
  };
}

type FrameCallbackHost = {
  requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Scans the video inside [startTime, endTime]:
 * 1. Detects the real keyboard (or uses the provided layout) to know where every key is.
 * 2. Plays the video muted at an accelerated rate and analyses every presented frame using
 *    requestVideoFrameCallback (exact media timestamps), with polling/stepped-seek fallbacks.
 * 3. Reconstructs the notes with the tape model (falls back to scanline tracking if needed).
 */
export async function scanVideoFrames(
  videoElement: HTMLVideoElement,
  options: VideoScanOptions = {}
): Promise<VideoScanResult> {
  const {
    scanlineYRatio = 0.64,
    minPitch = 21,
    maxPitch = 108,
    keyboardXStartRatio = 0.0,
    keyboardXEndRatio = 1.0,
    brightnessThreshold = 38,
    minSaturation = 0.2,
    fps = 10,
    startTime = 0,
    endTime,
    colorMode = 'two-colors',
    hand1Color = { r: 34, g: 197, b: 94 },
    hand2Color = { r: 56, g: 189, b: 248 },
    splitPitch = 60,
    keyboardLayout = null,
    octaveShift = 0,
    playbackRate = 4,
    onProgress,
    onFrameDetections,
  } = options;

  const totalDuration = videoElement.duration || 0;
  const startCrop = Math.max(0, startTime);
  const endCrop = endTime && endTime > startCrop ? Math.min(totalDuration, endTime) : totalDuration;
  const duration = Math.max(0.5, endCrop - startCrop);

  const rawW = videoElement.videoWidth || 1280;
  const rawH = videoElement.videoHeight || 720;
  const scale = Math.min(1, 960 / rawW);
  const canvasWidth = Math.max(320, Math.round(rawW * scale));
  const canvasHeight = Math.max(180, Math.round(rawH * scale));

  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = canvasWidth;
  scanCanvas.height = canvasHeight;
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!scanCtx) {
    throw new Error('Não foi possível inicializar contexto 2D de renderização.');
  }

  const scanY = Math.max(12, Math.min(canvasHeight - 2, Math.round(canvasHeight * scanlineYRatio)));
  // Analysis window: from below the title area down to the reading line (which the user places above
  // the key glow). Amber flames are rejected by hue, smoke/particles by the tape majority vote.
  const areaTop = Math.max(0, Math.round(canvasHeight * 0.12));
  const areaBottom = Math.max(areaTop + 20, scanY - 3);
  const areaRows = areaBottom - areaTop + 1;
  const bridgeRows = Math.max(8, Math.round(canvasHeight * 0.03));
  const colorOptions: ColorOptions = { colorMode, hand1Color, hand2Color, splitPitch };

  const frames: FrameRecord[] = [];
  const tracker = createScanlineTracker(splitPitch);
  let baseLayout: KeyboardLayout | null = keyboardLayout;
  let layout: KeyboardLayout | null = null;
  let keyboardRowY = 0;
  let framesScanned = 0;
  let lastProcessedTime = startCrop;
  let lastUiUpdate = 0;

  const emitUi = (t: number, hits: KeyHit[]) => {
    const now = performance.now();
    if (now - lastUiUpdate < 100) return;
    lastUiUpdate = now;
    onFrameDetections?.(hits, t);
    const p = Math.max(0, Math.min(1, (t - startCrop) / duration));
    onProgress?.(p, `Lendo barras no vídeo (${Math.round(p * 100)}%) • ${framesScanned} quadros analisados...`);
  };

  const processFrame = (t: number, dt: number) => {
    framesScanned++;
    lastProcessedTime = t;
    let hits: KeyHit[];
    if (layout) {
      scanCtx.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
      const keyRow = scanCtx.getImageData(0, keyboardRowY, canvasWidth, 1).data;
      if (!keyboardRowMatches(keyRow, canvasWidth, layout)) {
        // Keyboard not on screen (intro/outro/cut): this frame saw nothing of the tape
        tracker.track(t - startCrop, dt, []);
        emitUi(t, []);
        return;
      }
      const data = scanCtx.getImageData(0, areaTop, canvasWidth, areaRows).data;
      const segments = analyzeKeyColumns(data, canvasWidth, areaRows, areaTop, layout, {
        minSaturation,
        brightnessThreshold,
        colorOptions,
        bridgeRows,
      });
      frames.push({ t, segments });
      hits = segmentsToHits(
        segments.filter((s) => s.touchesBottom),
        layout,
        splitPitch
      );
    } else {
      hits = detectKeyHitsFromVideoContext(scanCtx, videoElement, canvasWidth, canvasHeight, {
        scanlineYRatio,
        keyboardXStartRatio,
        keyboardXEndRatio,
        minPitch,
        maxPitch,
        minSaturation,
        brightnessThreshold,
        colorMode,
        hand1Color,
        hand2Color,
        splitPitch,
        layout: null,
      });
    }
    tracker.track(t - startCrop, dt, hits);
    emitUi(t, hits);
  };

  const seekAndWait = async (targetTime: number, maxWaitMs = 500) => {
    videoElement.currentTime = targetTime;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          videoElement.removeEventListener('seeked', done);
          resolve();
        }
      };
      videoElement.addEventListener('seeked', done, { once: true });
      setTimeout(done, maxWaitMs);
    });
  };

  const host = videoElement as unknown as FrameCallbackHost;

  const playWithFrameCallbacks = () =>
    new Promise<boolean>((resolve) => {
      let lastMedia = -1;
      let lastFrameWall = performance.now();
      let finished = false;
      let handle = 0;

      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        clearInterval(watchdog);
        videoElement.removeEventListener('ended', onEnded);
        if (handle && host.cancelVideoFrameCallback) host.cancelVideoFrameCallback(handle);
        videoElement.pause();
        resolve(ok);
      };
      const onEnded = () => finish(true);

      const onFrame = (_now: number, metadata: { mediaTime: number }) => {
        if (finished) return;
        const t = metadata.mediaTime;
        lastFrameWall = performance.now();
        if (t >= endCrop) {
          finish(true);
          return;
        }
        if (t >= startCrop - 0.005 && t > lastMedia) {
          const dt = lastMedia < 0 ? 1 / 30 : Math.min(0.25, Math.max(1 / 240, t - lastMedia));
          processFrame(t, dt);
          lastMedia = t;
        }
        handle = host.requestVideoFrameCallback!(onFrame);
      };

      videoElement.addEventListener('ended', onEnded);
      const watchdog = setInterval(() => {
        if (performance.now() - lastFrameWall > 2500) finish(false);
      }, 250);
      handle = host.requestVideoFrameCallback!(onFrame);
      videoElement.play().catch(() => finish(false));
    });

  const playWithPolling = () =>
    new Promise<boolean>((resolve) => {
      let lastMedia = -1;
      let lastAdvanceWall = performance.now();
      const interval = setInterval(() => {
        const now = performance.now();
        const t = videoElement.currentTime;
        if (t >= endCrop || videoElement.ended) {
          clearInterval(interval);
          videoElement.pause();
          resolve(true);
          return;
        }
        if (t - lastMedia >= 1 / 60) {
          const dt = lastMedia < 0 ? 1 / 30 : Math.min(0.25, t - lastMedia);
          lastMedia = t;
          lastAdvanceWall = now;
          processFrame(t, dt);
        } else if (now - lastAdvanceWall > 1500) {
          clearInterval(interval);
          videoElement.pause();
          resolve(false);
        }
      }, 15);
      videoElement.play().catch(() => {
        clearInterval(interval);
        resolve(false);
      });
    });

  const wasMuted = videoElement.muted;
  const prevRate = videoElement.playbackRate;
  videoElement.pause();
  videoElement.muted = true;

  try {
    if (!baseLayout) {
      onProgress?.(0, 'Procurando o teclado no vídeo...');
      for (let i = 0; i < 6; i++) {
        await seekAndWait(startCrop + (duration * (i + 0.5)) / 6, 900);
        const found = detectKeyboardLayoutInFrame(
          scanCtx,
          videoElement,
          canvasWidth,
          canvasHeight,
          Math.min(0.45, scanlineYRatio * 0.75)
        );
        if (found && (!baseLayout || found.score > baseLayout.score)) baseLayout = found;
      }
    }
    layout = baseLayout ? shiftLayoutOctave(baseLayout, octaveShift) : null;
    if (layout) {
      keyboardRowY = Math.max(0, Math.min(canvasHeight - 1, Math.round(layout.keyboardYRatio * canvasHeight)));
    }

    await seekAndWait(startCrop, 900);
    try {
      videoElement.playbackRate = playbackRate;
    } catch {
      videoElement.playbackRate = 2;
    }

    let reachedEnd = false;
    try {
      reachedEnd =
        typeof host.requestVideoFrameCallback === 'function'
          ? await playWithFrameCallbacks()
          : await playWithPolling();
    } catch {
      reachedEnd = false;
    }

    // Fallback: finish whatever is left with properly awaited seeks
    if (!reachedEnd) {
      videoElement.pause();
      const frameInterval = 1 / Math.max(8, fps);
      const resumeStart = Math.max(startCrop, lastProcessedTime + frameInterval);
      const remainingFrames = Math.max(0, Math.floor((endCrop - resumeStart) / frameInterval));
      for (let f = 0; f < remainingFrames; f++) {
        const t = resumeStart + f * frameInterval;
        await seekAndWait(t, 450);
        processFrame(t, frameInterval);
      }
    }
  } finally {
    videoElement.pause();
    videoElement.playbackRate = prevRate || 1.0;
    videoElement.muted = wasMuted;
  }

  let visualNotes: VisualNoteEvent[] | null = null;
  let fallSpeed: number | null = null;
  let method: 'tape' | 'scanline' = 'scanline';

  if (layout && frames.length >= 8) {
    fallSpeed = estimateFallSpeed(frames, canvasHeight * 4);
    if (fallSpeed) {
      const tapeNotes = buildNotesFromTape(frames, {
        fallSpeed,
        scanY,
        areaTop,
        areaBottom,
        startTime: startCrop,
        duration,
        splitPitch,
        hand1Color,
        hand2Color,
      });
      if (tapeNotes.length > 0) {
        visualNotes = tapeNotes;
        method = 'tape';
      }
    }
  }

  if (!visualNotes) {
    visualNotes = tracker.finish().map((n) => ({
      ...n,
      color: n.hand === 'right' ? hand1Color : hand2Color,
    }));
  }

  return {
    visualNotes,
    dominantColors: {
      rightHand: hand1Color,
      leftHand: hand2Color,
    },
    totalFramesScanned: framesScanned,
    keyboardLayout: baseLayout,
    sampleFps: framesScanned / duration,
    fallSpeedPxPerSec: fallSpeed,
    method,
  };
}

// ---------------------------------------------------------------------------
// Audio + video fusion
// ---------------------------------------------------------------------------

/**
 * Estimates the constant time offset between video onsets and audio onsets (the video reading line
 * sits above the keys, so bars touch it a little before the key sounds). Returns lag such that
 * audioSec ≈ visualSec + lag.
 */
export function estimateAudioVisualLag(
  audioNotes: Note[],
  visualNotes: VisualNoteEvent[],
  ticksPerSecond: number
): { lagSec: number; votes: number } {
  if (audioNotes.length === 0 || visualNotes.length === 0 || !(ticksPerSecond > 0)) {
    return { lagSec: 0, votes: 0 };
  }

  const byPitch = new Map<number, number[]>();
  for (const a of audioNotes) {
    const list = byPitch.get(a.pitch);
    const sec = a.startTick / ticksPerSecond;
    if (list) list.push(sec);
    else byPitch.set(a.pitch, [sec]);
  }

  const RANGE = 1.5;
  const BIN = 0.02;
  const binCount = Math.round((2 * RANGE) / BIN) + 1;
  const hist = new Float64Array(binCount);
  const diffs: number[] = [];
  const step = Math.max(1, Math.floor(visualNotes.length / 800));
  let sampled = 0;

  for (let i = 0; i < visualNotes.length; i += step) {
    const v = visualNotes[i];
    sampled++;
    const list = byPitch.get(v.pitch);
    if (!list) continue;
    for (const sec of list) {
      const d = sec - v.startSec;
      if (Math.abs(d) > RANGE) continue;
      hist[Math.round((d + RANGE) / BIN)]++;
      diffs.push(d);
    }
  }

  let best = -1;
  let bestScore = 0;
  for (let k = 1; k < binCount - 1; k++) {
    const score = hist[k - 1] + 2 * hist[k] + hist[k + 1];
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) return { lagSec: 0, votes: 0 };

  const center = best * BIN - RANGE;
  const near = diffs.filter((d) => Math.abs(d - center) <= 0.03);
  const minVotes = Math.max(8, 0.1 * Math.min(sampled, audioNotes.length));
  if (near.length < minVotes) return { lagSec: 0, votes: near.length };

  return { lagSec: near.reduce((s, d) => s + d, 0) / near.length, votes: near.length };
}

export interface FusionOptions {
  /**
   * 'audio': every audio note is kept, video assigns hands/durations.
   * 'video': every video note is kept (exact pitches from the keyboard), audio provides velocities.
   * 'auto': uses video when the video scan produced a rich result.
   */
  backbone?: 'audio' | 'video' | 'auto';
  autoAlign?: boolean;
}

/**
 * Fuses Audio-to-MIDI notes with Video Computer Vision notes.
 */
export function fuseAudioAndVisionNotes(
  audioNotes: Note[],
  visualNotes: VisualNoteEvent[],
  bpm: number,
  ticksPerBeat = TICKS_PER_BEAT,
  splitPitch = 60,
  options: FusionOptions = {}
): {
  rightHandNotes: Note[];
  leftHandNotes: Note[];
  allNotes: Note[];
  matchedVisualCount: number;
  lagSec: number;
  backbone: 'audio' | 'video';
} {
  const { backbone = 'audio', autoAlign = true } = options;
  const ticksPerSecond = (bpm * ticksPerBeat) / 60;

  const { lagSec } = autoAlign
    ? estimateAudioVisualLag(audioNotes, visualNotes, ticksPerSecond)
    : { lagSec: 0 };
  const aligned = lagSec !== 0;
  const shifted = visualNotes.map((v) => ({ ...v, startSec: v.startSec + lagSec, endSec: v.endSec + lagSec }));

  const useVideo =
    backbone === 'video' ||
    (backbone === 'auto' && visualNotes.length >= 20 && visualNotes.length >= audioNotes.length * 0.3);

  const rightHandNotes: Note[] = [];
  const leftHandNotes: Note[] = [];
  const allNotes: Note[] = [];
  let matchedVisualCount = 0;

  const push = (note: Note, hand: 'right' | 'left') => {
    allNotes.push(note);
    if (hand === 'right') rightHandNotes.push(note);
    else leftHandNotes.push(note);
  };

  if (useVideo) {
    const velocities = audioNotes.map((a) => a.velocity).sort((a, b) => a - b);
    const defaultVelocity = velocities.length ? velocities[Math.floor(velocities.length / 2)] : 85;
    const audioByPitch = new Map<number, Array<{ sec: number; idx: number }>>();
    audioNotes.forEach((a, idx) => {
      const list = audioByPitch.get(a.pitch);
      const entry = { sec: a.startTick / ticksPerSecond, idx };
      if (list) list.push(entry);
      else audioByPitch.set(a.pitch, [entry]);
    });
    const used = new Set<number>();
    const window = aligned ? 0.12 : 0.3;

    shifted.forEach((v, i) => {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (const a of audioByPitch.get(v.pitch) ?? []) {
        if (used.has(a.idx)) continue;
        const d = Math.abs(a.sec - v.startSec);
        if (d <= window && d < bestDist) {
          bestDist = d;
          bestIdx = a.idx;
        }
      }
      if (bestIdx >= 0) {
        used.add(bestIdx);
        matchedVisualCount++;
      }
      push(
        {
          id: `fv-${i}`,
          trackId: '',
          pitch: v.pitch,
          startTick: Math.max(0, Math.round(v.startSec * ticksPerSecond)),
          durationTicks: Math.max(30, Math.round((v.endSec - v.startSec) * ticksPerSecond)),
          velocity: bestIdx >= 0 ? audioNotes[bestIdx].velocity : defaultVelocity,
        },
        v.hand
      );
    });
  } else {
    const usedVisualIndices = new Set<number>();
    const exactWindow = aligned ? 0.2 : 0.45;
    const nearWindow = aligned ? 0.15 : 0.35;

    for (const aNote of audioNotes) {
      const noteSec = aNote.startTick / ticksPerSecond;

      let matchedIdx = shifted.findIndex(
        (v, idx) =>
          !usedVisualIndices.has(idx) && v.pitch === aNote.pitch && Math.abs(v.startSec - noteSec) <= exactWindow
      );
      if (matchedIdx === -1) {
        matchedIdx = shifted.findIndex(
          (v, idx) =>
            !usedVisualIndices.has(idx) &&
            Math.abs(v.pitch - aNote.pitch) <= 1 &&
            Math.abs(v.startSec - noteSec) <= nearWindow
        );
      }

      let assignedHand: 'right' | 'left';
      let durationTicks = aNote.durationTicks;

      if (matchedIdx !== -1) {
        usedVisualIndices.add(matchedIdx);
        const matchedVisual = shifted[matchedIdx];
        matchedVisualCount++;
        assignedHand = matchedVisual.hand;
        const vDurTicks = Math.round((matchedVisual.endSec - matchedVisual.startSec) * ticksPerSecond);
        if (vDurTicks >= 60 && vDurTicks <= 480 * 8) {
          durationTicks = vDurTicks;
        }
      } else {
        assignedHand = aNote.pitch >= splitPitch ? 'right' : 'left';
      }

      push({ ...aNote, durationTicks }, assignedHand);
    }
  }

  const byTime = (a: Note, b: Note) => a.startTick - b.startTick || a.pitch - b.pitch;
  rightHandNotes.sort(byTime);
  leftHandNotes.sort(byTime);
  allNotes.sort(byTime);

  return {
    rightHandNotes,
    leftHandNotes,
    allNotes,
    matchedVisualCount,
    lagSec,
    backbone: useVideo ? 'video' : 'audio',
  };
}
