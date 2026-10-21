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
  scanlineYRatio?: number; // 0.0 to 1.0 (default 0.68, above flames/particles)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  keyboardXStartRatio?: number; // 0.0 to 1.0 (default 0.0)
  keyboardXEndRatio?: number; // 0.0 to 1.0 (default 1.0)
  brightnessThreshold?: number; // 0 to 255 (default 45)
  minSaturation?: number; // 0.0 to 1.0 (default 0.25 - ignores white flames/keys)
  fps?: number; // sampling fps (default 12 fps)
  startTime?: number; // Crop start in seconds
  endTime?: number; // Crop end in seconds
  colorMode?: 'two-colors' | 'single-color' | 'auto';
  hand1Color?: { r: number; g: number; b: number }; // Right hand target color
  hand2Color?: { r: number; g: number; b: number }; // Left hand target color
  splitPitch?: number; // Pitch to split hands when single-color (default 60 = Middle C)
  onProgress?: (progress: number, stage: string) => void;
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
 * Calculates color distance between two RGB colors.
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
 * exactly at the boundaries between adjacent white keys.
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
 * Classifies whether a detected color is Right Hand or Left Hand based on user colors,
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

  // Compare distance to user-chosen hand colors
  const d1 = colorDistance({ r, g, b }, hand1Color);
  const d2 = colorDistance({ r, g, b }, hand2Color);

  if (Math.abs(d1 - d2) < 25) {
    // Colors are ambiguous, use pitch register fallback
    return pitch >= splitPitch ? 'right' : 'left';
  }

  return d1 <= d2 ? 'right' : 'left';
}

/**
 * Scans a 1-pixel horizontal line of image data across the keyboard,
 * grouping adjacent colorful pixels into discrete falling bar segments.
 * Filters out white smoke, flame particles, white keys, and black keys!
 */
export function detectBarsInImageData(
  lineData: Uint8ClampedArray,
  kbWidth: number,
  minPitch = 21,
  maxPitch = 108,
  minSaturation = 0.25,
  brightnessThreshold = 45,
  colorOptions?: {
    colorMode?: 'two-colors' | 'single-color' | 'auto';
    hand1Color?: { r: number; g: number; b: number };
    hand2Color?: { r: number; g: number; b: number };
    splitPitch?: number;
  }
): DetectedBarSegment[] {
  const segments: DetectedBarSegment[] = [];

  let inSegment = false;
  let segmentStartX = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let pixelCount = 0;

  for (let px = 0; px < kbWidth; px++) {
    const idx = px * 4;
    const r = lineData[idx];
    const g = lineData[idx + 1];
    const b = lineData[idx + 2];

    const brightness = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const delta = brightness - minC;
    const saturation = brightness > 0 ? delta / brightness : 0;

    // Reject white keys, grey smoke, and flames:
    // White keys or flames have high brightness and low delta (grey/white)
    const isWhiteOrGrey = delta < 18 || (r > 225 && g > 225 && b > 225);

    // If user provided custom hand colors, check distance
    let matchesTargetColor = false;
    if (colorOptions?.hand1Color) {
      const d1 = colorDistance({ r, g, b }, colorOptions.hand1Color);
      if (d1 < 75) matchesTargetColor = true;
    }
    if (!matchesTargetColor && colorOptions?.colorMode === 'two-colors' && colorOptions?.hand2Color) {
      const d2 = colorDistance({ r, g, b }, colorOptions.hand2Color);
      if (d2 < 75) matchesTargetColor = true;
    }

    const isNotePixel =
      !isWhiteOrGrey &&
      brightness >= brightnessThreshold &&
      (matchesTargetColor || (saturation >= minSaturation && delta >= 22));

    if (isNotePixel) {
      if (!inSegment) {
        inSegment = true;
        segmentStartX = px;
        rSum = r;
        gSum = g;
        bSum = b;
        pixelCount = 1;
      } else {
        rSum += r;
        gSum += g;
        bSum += b;
        pixelCount++;
      }
    } else {
      if (inSegment) {
        if (pixelCount >= 2) {
          const centerX = segmentStartX + pixelCount / 2;
          const avgR = Math.round(rSum / pixelCount);
          const avgG = Math.round(gSum / pixelCount);
          const avgB = Math.round(bSum / pixelCount);
          const pitch = xToPianoPitch(centerX, kbWidth, minPitch, maxPitch);
          const hand = classifyHand(avgR, avgG, avgB, pitch, colorOptions);

          segments.push({
            centerX,
            width: pixelCount,
            pitch,
            color: { r: avgR, g: avgG, b: avgB },
            hand,
          });
        }
        inSegment = false;
        pixelCount = 0;
      }
    }
  }

  // Flush trailing segment if any
  if (inSegment && pixelCount >= 2) {
    const centerX = segmentStartX + pixelCount / 2;
    const avgR = Math.round(rSum / pixelCount);
    const avgG = Math.round(gSum / pixelCount);
    const avgB = Math.round(bSum / pixelCount);
    const pitch = xToPianoPitch(centerX, kbWidth, minPitch, maxPitch);
    const hand = classifyHand(avgR, avgG, avgB, pitch, colorOptions);

    segments.push({
      centerX,
      width: pixelCount,
      pitch,
      color: { r: avgR, g: avgG, b: avgB },
      hand,
    });
  }

  return segments;
}

/**
 * Scans an HTML5 Video frame by frame along a calibrated hit-line,
 * grouping colored pixels into falling bars and tracking their onsets and releases
 * strictly within the [startTime, endTime] cropped window.
 *
 * Uses a detached offscreen video element to guarantee zero preview stuttering
 * and a 1-pixel height canvas for 1500x faster processing than drawing 1080p frames.
 */
export async function scanVideoFrames(
  videoElement: HTMLVideoElement,
  options: VideoScanOptions = {}
): Promise<VideoScanResult> {
  const {
    scanlineYRatio = 0.68,
    minPitch = 21,
    maxPitch = 108,
    keyboardXStartRatio = 0.0,
    keyboardXEndRatio = 1.0,
    brightnessThreshold = 45,
    minSaturation = 0.25,
    fps = 10, // 10 fps provides smooth tracking while running quickly
    startTime = 0,
    endTime,
    colorMode = 'two-colors',
    hand1Color = { r: 34, g: 197, b: 94 },
    hand2Color = { r: 56, g: 189, b: 248 },
    splitPitch = 60,
    onProgress,
  } = options;

  const totalDuration = videoElement.duration || 0;
  const startCrop = Math.max(0, startTime);
  const endCrop = endTime && endTime > startCrop ? Math.min(totalDuration, endTime) : totalDuration;
  const duration = Math.max(0.5, endCrop - startCrop);

  // Use an offscreen video element so the visible preview video in the modal
  // NEVER freezes, stutters, or jumps, and no React re-renders are triggered during scan!
  let targetVideo: HTMLVideoElement = videoElement;
  let isUsingOffscreen = false;
  const videoSrc = videoElement.currentSrc || videoElement.src;

  if (videoSrc) {
    try {
      const offscreenVideo = document.createElement('video');
      offscreenVideo.muted = true;
      offscreenVideo.playsInline = true;
      offscreenVideo.preload = 'auto';
      offscreenVideo.src = videoSrc;

      if (offscreenVideo.readyState < 2) {
        await new Promise<void>((resolve) => {
          offscreenVideo.onloadedmetadata = () => resolve();
          offscreenVideo.onerror = () => resolve();
          setTimeout(resolve, 800);
        });
      }

      if (offscreenVideo.videoWidth > 0 && offscreenVideo.videoHeight > 0) {
        targetVideo = offscreenVideo;
        isUsingOffscreen = true;
      }
    } catch {
      targetVideo = videoElement;
    }
  }

  const width = targetVideo.videoWidth || 1280;
  const height = targetVideo.videoHeight || 720;

  const scanY = Math.max(1, Math.min(height - 2, Math.round(height * scanlineYRatio)));
  const kbStartX = Math.max(0, Math.round(width * keyboardXStartRatio));
  const kbEndX = Math.min(width, Math.round(width * keyboardXEndRatio));
  const kbWidth = Math.max(10, kbEndX - kbStartX);

  // Tiny 1-pixel canvas: draws ONLY the keyboard scanline slice!
  // This is 1500x faster than drawing a full 1080p frame to canvas!
  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = kbWidth;
  scanCanvas.height = 1;
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

  if (!scanCtx) {
    throw new Error('Não foi possível inicializar contexto 2D de renderização.');
  }

  const frameInterval = 1 / fps;
  const totalFrames = Math.max(1, Math.floor(duration / frameInterval));

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

  const colorOptions = { colorMode, hand1Color, hand2Color, splitPitch };

  for (let frame = 0; frame < totalFrames; frame++) {
    const videoCurrentTime = startCrop + frame * frameInterval;
    const relativeTime = frame * frameInterval;

    if (frame % 6 === 0 && onProgress) {
      const p = frame / totalFrames;
      onProgress(p, `Lendo barras coloridas (${Math.round(p * 100)}%)...`);
    }

    // Seek target video to frame with quick safeguard
    targetVideo.currentTime = videoCurrentTime;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          targetVideo.removeEventListener('seeked', done);
          resolve();
        }
      };
      targetVideo.addEventListener('seeked', done, { once: true });
      setTimeout(done, 75);
    });

    // Draw ONLY the 1-pixel scanline from the video
    scanCtx.drawImage(targetVideo, kbStartX, scanY, kbWidth, 1, 0, 0, kbWidth, 1);
    const lineData = scanCtx.getImageData(0, 0, kbWidth, 1).data;

    // Detect bar segments in this frame
    const detectedSegments = detectBarsInImageData(
      lineData,
      kbWidth,
      minPitch,
      maxPitch,
      minSaturation,
      brightnessThreshold,
      colorOptions
    );

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

    // 2. Check for released notes (debounced with missingCount >= 2 to avoid flicker artifacts)
    for (const [pitch, note] of activeNotes.entries()) {
      const durationSoFar = relativeTime - note.startSec;
      const isMissing = !currentFramePitches.has(pitch);
      const isTooLong = durationSoFar > 6.0;

      if (isMissing) {
        note.missingCount++;
      }

      if (note.missingCount >= 2 || isTooLong) {
        const noteDuration = note.lastSec - note.startSec + frameInterval;
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
  }

  // Flush remaining active notes
  for (const note of activeNotes.values()) {
    const noteDuration = Math.min(4.0, note.lastSec - note.startSec + frameInterval);
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

  // Clean up offscreen video if used
  if (isUsingOffscreen) {
    targetVideo.src = '';
  }

  collectedNotes.sort((a, b) => a.startSec - b.startSec || a.pitch - b.pitch);

  return {
    visualNotes: collectedNotes,
    dominantColors: {
      rightHand: hand1Color,
      leftHand: hand2Color,
    },
    totalFramesScanned: totalFrames,
  };
}

/**
 * Fuses Audio-to-MIDI notes with Video Computer Vision notes:
 * - Uses the full set of Audio notes as the solid foundational backbone (never throws away notes!).
 * - Uses Visual detections to accurately partition notes into Right Hand and Left Hand tracks.
 * - Matches with exact pitch or +-1 semitone tolerance (to withstand minor keyboard slider offsets).
 * - If video had a visual match, inherits exact hand and refines duration.
 * - If video missed a note (occlusion/dark bar), falls back cleanly to the pitch register split.
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

  for (const aNote of audioNotes) {
    const noteSec = aNote.startTick / ticksPerSecond;

    // 1. Look for exact pitch match within +-0.35s
    let matchedVisual = visualNotes.find(
      (v) => v.pitch === aNote.pitch && Math.abs(v.startSec - noteSec) <= 0.35
    );

    // 2. If no exact match, allow +-1 semitone tolerance in case keyboard calibration slider
    // had a slight 1% offset
    if (!matchedVisual) {
      matchedVisual = visualNotes.find(
        (v) => Math.abs(v.pitch - aNote.pitch) <= 1 && Math.abs(v.startSec - noteSec) <= 0.28
      );
    }

    let assignedHand: 'right' | 'left';
    let durationTicks = aNote.durationTicks;

    if (matchedVisual) {
      matchedVisualCount++;
      assignedHand = matchedVisual.hand;
      const vDurTicks = Math.round((matchedVisual.endSec - matchedVisual.startSec) * ticksPerSecond);
      if (vDurTicks >= 60 && vDurTicks <= 480 * 6) {
        durationTicks = vDurTicks;
      }
    } else {
      // Natural pitch split heuristic when visual didn't capture that exact frame
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
