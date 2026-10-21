import type { Note } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

export interface VisualNoteEvent {
  pitch: number;
  startSec: number;
  endSec: number;
  hand: 'right' | 'left';
  color: { r: number; g: number; b: number };
}

export interface DetectedBarSegment {
  centerX: number;
  width: number;
  pitch: number;
  color: { r: number; g: number; b: number };
  hand: 'right' | 'left';
}

export interface VideoScanOptions {
  scanlineYRatio?: number; // 0.0 to 1.0 (default 0.64, above flames/smoke)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  keyboardXStartRatio?: number; // 0.0 to 1.0 (default 0.0)
  keyboardXEndRatio?: number; // 0.0 to 1.0 (default 1.0)
  brightnessThreshold?: number; // 0 to 255 (default 40)
  minSaturation?: number; // 0.0 to 1.0 (default 0.20 - ignores white flames/smoke/keys)
  fps?: number; // sampling fps (default 10 fps)
  startTime?: number; // Crop start in seconds
  endTime?: number; // Crop end in seconds
  colorMode?: 'two-colors' | 'single-color' | 'auto';
  hand1Color?: { r: number; g: number; b: number }; // Right hand target color
  hand2Color?: { r: number; g: number; b: number }; // Left hand target color
  splitPitch?: number; // Pitch to split hands when single-color (default 60 = Middle C)
  onProgress?: (progress: number, stage: string) => void;
  onFrameDetections?: (segments: DetectedBarSegment[], currentTime: number) => void;
}

export interface VideoScanResult {
  visualNotes: VisualNoteEvent[];
  dominantColors: {
    rightHand: { r: number; g: number; b: number };
    leftHand: { r: number; g: number; b: number };
  };
  totalFramesScanned: number;
}

/**
 * Converts Hex string (#22c55e) to RGB object.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
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
export function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number }
): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export interface PianoKeyInfo {
  pitch: number;
  isBlack: boolean;
  center: number;
}

/**
 * Pre-computed geometric layout of a standard 88-key piano keyboard (A0 to C8).
 * Synthesia cascade bars strictly align with the 52 white keys and 36 black keys.
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
 * using the geometrically accurate piano keyboard layout.
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

/**
 * Collapses a 2D vertical strip of pixels (kbWidth x stripHeight) into a single 1D line
 * (kbWidth x 1) by selecting, for each X column, the pixel row with the highest chromatic
 * intensity. This completely eliminates white note-name text (e.g. "D", "F#", "A") printed
 * inside Synthesia bars as well as localized smoke wisps at the key impact line.
 */
export function collapseStripToBestLine(
  stripData: Uint8ClampedArray,
  kbWidth: number,
  stripHeight: number
): Uint8ClampedArray {
  if (stripHeight <= 1) return stripData;

  const outLine = new Uint8ClampedArray(kbWidth * 4);
  // Sample up to 6 rows across the strip height
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

      // Penalize pure white/grey pixels (smoke, white text inside bars, white keys)
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
 * Classifies whether a detected color is Right Hand or Left Hand based on user colors (Hue + RGB),
 * color mode, or pitch split fallback.
 */
export function classifyHand(
  r: number,
  g: number,
  b: number,
  pitch: number,
  options: {
    colorMode?: 'two-colors' | 'single-color' | 'auto';
    hand1Color?: { r: number; g: number; b: number };
    hand2Color?: { r: number; g: number; b: number };
    splitPitch?: number;
  } = {}
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

  // Compare Hue angular distance first (invariant to 3D bar highlights and key-hit glow!)
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

/**
 * Scans a horizontal line of image data across the keyboard,
 * grouping adjacent colorful pixels into discrete falling bar segments.
 * Filters out white smoke, flame particles, white note text, white keys, and black keys!
 */
export function detectBarsInImageData(
  lineData: Uint8ClampedArray,
  kbWidth: number,
  minPitch = 21,
  maxPitch = 108,
  minSaturation = 0.2,
  brightnessThreshold = 38,
  colorOptions?: {
    colorMode?: 'two-colors' | 'single-color' | 'auto';
    hand1Color?: { r: number; g: number; b: number };
    hand2Color?: { r: number; g: number; b: number };
    splitPitch?: number;
  }
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

      // If two or more adjacent keys of the same color are pressed together, split them by key width
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

    // Reject white keys, grey smoke, and bright white flares
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
        // Check if color hand abruptly changed (e.g. Left Hand blue bar immediately adjacent to Right Hand green bar)
        const prevAvgR = Math.round(rSum / pixelCount);
        const prevAvgG = Math.round(gSum / pixelCount);
        const prevAvgB = Math.round(bSum / pixelCount);
        const prevHsl = rgbToHsl(prevAvgR, prevAvgG, prevAvgB);
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
      // Bridge tiny 1-2px gaps inside a bar (e.g. letter outline or anti-aliasing)
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
 * Helper to extract a vertical strip above scanY from a video/canvas context and detect bars.
 */
export function detectBarsFromVideoContext(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
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
    hand1Color: { r: number; g: number; b: number };
    hand2Color: { r: number; g: number; b: number };
    splitPitch: number;
  }
): DetectedBarSegment[] {
  // Draw full frame scaled to working canvas (universally hardware-accelerated on all GPUs)
  ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

  const scanY = Math.max(2, Math.min(canvasHeight - 2, Math.round(canvasHeight * options.scanlineYRatio)));
  const kbStartX = Math.max(0, Math.round(canvasWidth * options.keyboardXStartRatio));
  const kbEndX = Math.min(canvasWidth, Math.round(canvasWidth * options.keyboardXEndRatio));
  const kbWidth = Math.max(10, kbEndX - kbStartX);

  // Read a 4% vertical strip extending upward from scanY so white note-name letters ("D", "F#", "A")
  // and key-edge smoke flares are bypassed
  const stripHeight = Math.max(6, Math.round(canvasHeight * 0.04));
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

/**
 * Scans an HTML5 Video element along a calibrated hit-line,
 * grouping colored pixels into falling bars and tracking their onsets and releases
 * strictly within the [startTime, endTime] cropped window.
 *
 * Uses accelerated forward playback on the mounted video element (avoiding H.264 keyframe seek flushes),
 * with automatic fallback to properly-awaited stepped seeking if playback is blocked.
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
    onProgress,
    onFrameDetections,
  } = options;

  const totalDuration = videoElement.duration || 0;
  const startCrop = Math.max(0, startTime);
  const endCrop = endTime && endTime > startCrop ? Math.min(totalDuration, endTime) : totalDuration;
  const duration = Math.max(0.5, endCrop - startCrop);

  // Use a compact 960x540 working canvas for fast, reliable full-frame GPU blits
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

  interface ActiveBarNote {
    pitch: number;
    startSec: number;
    lastSec: number;
    hand: 'right' | 'left';
    colors: { r: number; g: number; b: number }[];
    missingCount: number;
  }

  const activeNotes = new Map<number, ActiveBarNote>();
  const collectedNotes: VisualNoteEvent[] = [];
  let framesScanned = 0;

  const detectOpts = {
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
  };

  const processFrameAtTime = (videoCurrentTime: number, dt: number) => {
    const relativeTime = Math.max(0, videoCurrentTime - startCrop);
    framesScanned++;

    const detectedSegments = detectBarsFromVideoContext(
      scanCtx,
      videoElement,
      canvasWidth,
      canvasHeight,
      detectOpts
    );

    onFrameDetections?.(detectedSegments, videoCurrentTime);

    const currentFramePitches = new Map<number, DetectedBarSegment>();
    for (const seg of detectedSegments) {
      currentFramePitches.set(seg.pitch, seg);
    }

    // 1. Update existing active notes or trigger new onsets
    for (const [pitch, seg] of currentFramePitches.entries()) {
      if (!activeNotes.has(pitch)) {
        activeNotes.set(pitch, {
          pitch,
          startSec: relativeTime,
          lastSec: relativeTime,
          hand: seg.hand,
          colors: [seg.color],
          missingCount: 0,
        });
      } else {
        const existing = activeNotes.get(pitch)!;
        existing.lastSec = relativeTime;
        existing.colors.push(seg.color);
        existing.missingCount = 0;
      }
    }

    // 2. Check for released notes
    for (const [pitch, note] of activeNotes.entries()) {
      const durationSoFar = relativeTime - note.startSec;
      const isMissing = !currentFramePitches.has(pitch);
      const isTooLong = durationSoFar > 5.0;

      if (isMissing) {
        note.missingCount++;
      }

      if (note.missingCount >= 2 || isTooLong) {
        const noteDuration = Math.max(dt, note.lastSec - note.startSec + dt);
        if (noteDuration >= 0.05) {
          const count = note.colors.length;
          const avgColor = {
            r: Math.round(note.colors.reduce((acc, c) => acc + c.r, 0) / count),
            g: Math.round(note.colors.reduce((acc, c) => acc + c.g, 0) / count),
            b: Math.round(note.colors.reduce((acc, c) => acc + c.b, 0) / count),
          };

          collectedNotes.push({
            pitch: note.pitch,
            startSec: note.startSec,
            endSec: note.startSec + noteDuration,
            hand: note.hand,
            color: avgColor,
          });
        }
        activeNotes.delete(pitch);
      }
    }
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

  const wasMuted = videoElement.muted;
  const prevRate = videoElement.playbackRate;
  videoElement.pause();
  videoElement.muted = true;

  try {
    // Seek to startCrop once
    await seekAndWait(startCrop, 800);

    // Attempt high-speed forward playback first (avoids H.264 GOP keyframe seek flushes!)
    let playbackSucceeded = false;
    try {
      try {
        videoElement.playbackRate = 3.5;
      } catch {
        videoElement.playbackRate = 2.0;
      }

      await videoElement.play();

      await new Promise<void>((resolve) => {
        let lastMediaTime = videoElement.currentTime;
        let lastAdvanceWallTime = performance.now();

        const interval = setInterval(() => {
          const now = performance.now();
          const curTime = videoElement.currentTime;

          if (curTime >= endCrop || videoElement.ended) {
            clearInterval(interval);
            videoElement.pause();
            playbackSucceeded = framesScanned > 3;
            resolve();
            return;
          }

          const dt = curTime - lastMediaTime;
          if (dt >= 0.05) {
            lastMediaTime = curTime;
            lastAdvanceWallTime = now;
            processFrameAtTime(curTime, Math.min(0.25, dt));

            const p = Math.max(0, Math.min(1, (curTime - startCrop) / duration));
            onProgress?.(
              p,
              `Lendo barras no vídeo (${Math.round(p * 100)}%) • ${
                collectedNotes.length + activeNotes.size
              } notas detectadas...`
            );
          } else if (now - lastAdvanceWallTime > 900) {
            // Playback stalled; switch to stepped seek fallback
            clearInterval(interval);
            videoElement.pause();
            resolve();
          }
        }, 25);
      });
    } catch {
      playbackSucceeded = false;
    }

    // Fallback: If fast playback was blocked or stalled early, finish from current position via stepped seek
    if (!playbackSucceeded) {
      const resumeStart =
        framesScanned > 0 ? Math.max(startCrop, videoElement.currentTime) : startCrop;
      const frameInterval = 1 / fps;
      const remainingDuration = Math.max(0.1, endCrop - resumeStart);
      const remainingFrames = Math.max(1, Math.floor(remainingDuration / frameInterval));

      for (let f = 0; f < remainingFrames; f++) {
        const t = resumeStart + f * frameInterval;
        await seekAndWait(t, 450);
        processFrameAtTime(t, frameInterval);

        if (f % 4 === 0 && onProgress) {
          const p = Math.max(0, Math.min(1, (t - startCrop) / duration));
          onProgress(
            p,
            `Lendo barras no vídeo (${Math.round(p * 100)}%) • ${
              collectedNotes.length + activeNotes.size
            } notas detectadas...`
          );
        }
      }
    }
  } finally {
    videoElement.pause();
    videoElement.playbackRate = prevRate || 1.0;
    videoElement.muted = wasMuted;
  }

  // Flush remaining active notes
  const defaultFrameDt = 1 / fps;
  for (const note of activeNotes.values()) {
    const noteDuration = Math.min(4.0, Math.max(defaultFrameDt, note.lastSec - note.startSec + defaultFrameDt));
    if (noteDuration >= 0.05) {
      const count = note.colors.length;
      const avgColor = {
        r: Math.round(note.colors.reduce((acc, c) => acc + c.r, 0) / count),
        g: Math.round(note.colors.reduce((acc, c) => acc + c.g, 0) / count),
        b: Math.round(note.colors.reduce((acc, c) => acc + c.b, 0) / count),
      };

      collectedNotes.push({
        pitch: note.pitch,
        startSec: note.startSec,
        endSec: note.startSec + noteDuration,
        hand: note.hand,
        color: avgColor,
      });
    }
  }

  collectedNotes.sort((a, b) => a.startSec - b.startSec || a.pitch - b.pitch);

  return {
    visualNotes: collectedNotes,
    dominantColors: {
      rightHand: hand1Color,
      leftHand: hand2Color,
    },
    totalFramesScanned: framesScanned,
  };
}

/**
 * Fuses Audio-to-MIDI notes with Video Computer Vision notes:
 * - If visualNotes has rich detections, combines visual hand separation + durations with audio velocities.
 * - Also includes visual notes that the audio detector missed (e.g. soft bass notes or masked inner chord notes),
 *   so the video scan actively improves both completeness and hand separation!
 */
export function fuseAudioAndVisionNotes(
  audioNotes: Note[],
  visualNotes: VisualNoteEvent[],
  bpm: number,
  ticksPerBeat = TICKS_PER_BEAT,
  splitPitch = 60
): {
  rightHandNotes: Note[];
  leftHandNotes: Note[];
  allNotes: Note[];
  matchedVisualCount: number;
} {
  const ticksPerSecond = (bpm * ticksPerBeat) / 60;

  const rightHandNotes: Note[] = [];
  const leftHandNotes: Note[] = [];
  const allNotes: Note[] = [];

  let matchedVisualCount = 0;
  const usedVisualIndices = new Set<number>();

  for (const aNote of audioNotes) {
    const noteSec = aNote.startTick / ticksPerSecond;

    // 1. Look for exact pitch match within +-0.45s
    let matchedIdx = visualNotes.findIndex(
      (v, idx) => !usedVisualIndices.has(idx) && v.pitch === aNote.pitch && Math.abs(v.startSec - noteSec) <= 0.45
    );

    // 2. If no exact match, allow +-1 semitone tolerance in case keyboard calibration slider had a slight 1% offset
    if (matchedIdx === -1) {
      matchedIdx = visualNotes.findIndex(
        (v, idx) =>
          !usedVisualIndices.has(idx) &&
          Math.abs(v.pitch - aNote.pitch) <= 1 &&
          Math.abs(v.startSec - noteSec) <= 0.35
      );
    }

    let assignedHand: 'right' | 'left';
    let durationTicks = aNote.durationTicks;

    if (matchedIdx !== -1) {
      usedVisualIndices.add(matchedIdx);
      const matchedVisual = visualNotes[matchedIdx];
      matchedVisualCount++;
      assignedHand = matchedVisual.hand;
      const vDurTicks = Math.round((matchedVisual.endSec - matchedVisual.startSec) * ticksPerSecond);
      if (vDurTicks >= 60 && vDurTicks <= 480 * 8) {
        durationTicks = vDurTicks;
      }
    } else {
      assignedHand = aNote.pitch >= splitPitch ? 'right' : 'left';
    }

    const note: Note = {
      ...aNote,
      durationTicks,
    };

    allNotes.push(note);
    if (assignedHand === 'right') {
      rightHandNotes.push(note);
    } else {
      leftHandNotes.push(note);
    }
  }

  // Sort chronologically
  rightHandNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  leftHandNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  allNotes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);

  return {
    rightHandNotes,
    leftHandNotes,
    allNotes,
    matchedVisualCount,
  };
}
