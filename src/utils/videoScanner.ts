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
  scanlineYRatio?: number; // 0.0 to 1.0 (default 0.70, above flames/particles)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  keyboardXStartRatio?: number; // 0.0 to 1.0 (default 0.0)
  keyboardXEndRatio?: number; // 0.0 to 1.0 (default 1.0)
  brightnessThreshold?: number; // 0 to 255 (default 50)
  minSaturation?: number; // 0.0 to 1.0 (default 0.28 - ignores white flames/keys)
  fps?: number; // sampling fps (default 15 fps)
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

/**
 * Maps a horizontal pixel coordinate along the keyboard span to a standard piano MIDI pitch (21 to 108).
 */
export function xToPianoPitch(
  x: number,
  keyboardWidth: number,
  minPitch = 21,
  maxPitch = 108
): number {
  const clampedX = Math.max(0, Math.min(keyboardWidth, x));
  const ratio = clampedX / Math.max(1, keyboardWidth);
  const totalKeys = maxPitch - minPitch + 1;
  const keyIndex = Math.min(totalKeys - 1, Math.floor(ratio * totalKeys));
  return minPitch + keyIndex;
}

/**
 * Classifies whether a detected color is Right Hand (Green / Warm) or Left Hand (Blue / Cyan / Cool).
 */
export function classifyHandColor(r: number, g: number, b: number): 'right' | 'left' {
  const hsl = rgbToHsl(r, g, b);
  // In Synthesia:
  // Green is ~80deg to 160deg (Right Hand)
  // Blue/Cyan is ~170deg to 260deg (Left Hand)
  // Orange/Red is 0deg to 45deg (sometimes Right or Left)
  if (hsl.h >= 70 && hsl.h <= 165) {
    return 'right'; // Green
  }
  if (hsl.h >= 170 && hsl.h <= 265) {
    return 'left'; // Blue / Cyan
  }
  // Fallback: if green is significantly higher than blue -> right, otherwise left
  return g > b + 20 ? 'right' : 'left';
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
  minSaturation = 0.28,
  brightnessThreshold = 50
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

    // A note bar MUST be colorful (saturation >= minSaturation and delta >= 30) and bright enough!
    // White smoke, flames, and keys have saturation < 0.15 and delta < 25.
    const isNotePixel = brightness >= brightnessThreshold && saturation >= minSaturation && delta >= 30;

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
        // Segment finished. Must be at least 3 pixels wide to filter out tiny video compression noise.
        if (pixelCount >= 3) {
          const centerX = segmentStartX + pixelCount / 2;
          const avgR = Math.round(rSum / pixelCount);
          const avgG = Math.round(gSum / pixelCount);
          const avgB = Math.round(bSum / pixelCount);
          const pitch = xToPianoPitch(centerX, kbWidth, minPitch, maxPitch);
          const hand = classifyHandColor(avgR, avgG, avgB);

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
  if (inSegment && pixelCount >= 3) {
    const centerX = segmentStartX + pixelCount / 2;
    const avgR = Math.round(rSum / pixelCount);
    const avgG = Math.round(gSum / pixelCount);
    const avgB = Math.round(bSum / pixelCount);
    const pitch = xToPianoPitch(centerX, kbWidth, minPitch, maxPitch);
    const hand = classifyHandColor(avgR, avgG, avgB);

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
 * Scans an HTML5 Video element frame by frame along a calibrated hit-line,
 * grouping colored pixels into falling bars and tracking their onsets and releases.
 */
export async function scanVideoFrames(
  videoElement: HTMLVideoElement,
  options: VideoScanOptions = {}
): Promise<VideoScanResult> {
  const {
    scanlineYRatio = 0.70, // Default 70% (comfortably above flame effects)
    minPitch = 21,
    maxPitch = 108,
    keyboardXStartRatio = 0.0,
    keyboardXEndRatio = 1.0,
    brightnessThreshold = 50,
    minSaturation = 0.28,
    fps = 15, // 15 fps gives ~66ms resolution, ample for 16th notes while running fast
    onProgress,
  } = options;

  const duration = videoElement.duration;
  if (!duration || duration <= 0 || isNaN(duration)) {
    throw new Error('Vídeo inválido ou duração indefinida.');
  }

  const width = videoElement.videoWidth || 1280;
  const height = videoElement.videoHeight || 720;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Não foi possível inicializar contexto 2D de renderização.');
  }

  const scanY = Math.max(1, Math.min(height - 2, Math.round(height * scanlineYRatio)));
  const kbStartX = Math.max(0, Math.round(width * keyboardXStartRatio));
  const kbEndX = Math.min(width, Math.round(width * keyboardXEndRatio));
  const kbWidth = Math.max(10, kbEndX - kbStartX);

  const frameInterval = 1 / fps;
  const totalFrames = Math.floor(duration / frameInterval);

  interface ActiveBarNote {
    pitch: number;
    startSec: number;
    lastSec: number;
    hand: 'right' | 'left';
    colors: { r: number; g: number; b: number }[];
  }

  const activeNotes = new Map<number, ActiveBarNote>();
  const collectedNotes: VisualNoteEvent[] = [];

  // Seek and sample frame by frame
  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = frame * frameInterval;

    if (frame % 10 === 0 && onProgress) {
      const progress = frame / totalFrames;
      onProgress(progress, `Lendo barras coloridas (${Math.round(progress * 100)}%)...`);
    }

    // Seek video with timeout safeguard
    videoElement.currentTime = currentTime;
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
      setTimeout(done, 120); // Safety fallback so it never hangs
    });

    ctx.drawImage(videoElement, 0, 0, width, height);

    // Read pixel data across the keyboard hit-line
    const lineData = ctx.getImageData(kbStartX, scanY, kbWidth, 1).data;

    // Detect bar segments in this frame
    const detectedSegments = detectBarsInImageData(
      lineData,
      kbWidth,
      minPitch,
      maxPitch,
      minSaturation,
      brightnessThreshold
    );

    const currentFramePitches = new Map<number, DetectedBarSegment>();
    for (const seg of detectedSegments) {
      currentFramePitches.set(seg.pitch, seg);
    }

    // 1. Update existing active notes or trigger new onsets
    for (const [pitch, seg] of currentFramePitches.entries()) {
      if (!activeNotes.has(pitch)) {
        // New note onset
        activeNotes.set(pitch, {
          pitch,
          startSec: currentTime,
          lastSec: currentTime,
          hand: seg.hand,
          colors: [seg.color],
        });
      } else {
        // Continuing note
        const existing = activeNotes.get(pitch)!;
        existing.lastSec = currentTime;
        existing.colors.push(seg.color);
      }
    }

    // 2. Check for released notes (absent in this frame or exceeded max realistic duration)
    for (const [pitch, note] of activeNotes.entries()) {
      const durationSoFar = currentTime - note.startSec;
      const isMissing = !currentFramePitches.has(pitch);
      const isTooLong = durationSoFar > 5.0; // Cut off if bar has been continuously on for > 5 seconds

      if (isMissing || isTooLong) {
        const noteDuration = note.lastSec - note.startSec + frameInterval;
        if (noteDuration >= 0.05) {
          // Average color
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
    const noteDuration = Math.min(3.0, note.lastSec - note.startSec + frameInterval);
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

  // Sort chronologically
  collectedNotes.sort((a, b) => a.startSec - b.startSec || a.pitch - b.pitch);

  return {
    visualNotes: collectedNotes,
    dominantColors: {
      rightHand: { r: 60, g: 220, b: 90 }, // Green
      leftHand: { r: 70, g: 150, b: 245 },  // Blue
    },
    totalFramesScanned: totalFrames,
  };
}

/**
 * Fuses Audio-to-MIDI notes with Video Computer Vision notes:
 * - Uses Visual scanner as ground-truth for pitch, hand separation, and clean note releases.
 * - Uses Audio transcriber for realistic note velocity/dynamics and micro-attacks.
 * - Suppresses audio octave harmonics that have no visual bar.
 */
export function fuseAudioAndVisionNotes(
  audioNotes: Note[],
  visualNotes: VisualNoteEvent[],
  bpm: number,
  ticksPerBeat = TICKS_PER_BEAT
): {
  rightHandNotes: Note[];
  leftHandNotes: Note[];
  allNotes: Note[];
  suppressedHarmonicsCount: number;
} {
  const ticksPerSecond = (bpm * ticksPerBeat) / 60;

  const rightHandNotes: Note[] = [];
  const leftHandNotes: Note[] = [];
  const allNotes: Note[] = [];

  let suppressedHarmonicsCount = 0;

  for (const vNote of visualNotes) {
    const startTick = Math.max(0, Math.round(vNote.startSec * ticksPerSecond));
    const rawDurationTicks = Math.round((vNote.endSec - vNote.startSec) * ticksPerSecond);
    const durationTicks = Math.max(60, Math.min(480 * 8, rawDurationTicks));

    // Find closest audio note with identical pitch and time within 250ms tolerance
    const toleranceTicks = Math.round(0.25 * ticksPerSecond);
    const matchedAudio = audioNotes.find(
      (a) => a.pitch === vNote.pitch && Math.abs(a.startTick - startTick) <= toleranceTicks
    );

    const velocity = matchedAudio?.velocity || 92;

    const note: Note = {
      id: `fused-note-${Date.now()}-${Math.random()}`,
      trackId: '',
      pitch: vNote.pitch,
      startTick: matchedAudio ? matchedAudio.startTick : startTick,
      durationTicks,
      velocity,
      selected: false,
    };

    allNotes.push(note);
    if (vNote.hand === 'right') {
      rightHandNotes.push(note);
    } else {
      leftHandNotes.push(note);
    }
  }

  // Check how many audio notes were suppressed as phantom harmonics
  for (const aNote of audioNotes) {
    const hasVisualMatch = visualNotes.some(
      (v) =>
        v.pitch === aNote.pitch &&
        Math.abs(v.startSec * ticksPerSecond - aNote.startTick) <= 0.3 * ticksPerSecond
    );
    if (!hasVisualMatch) {
      suppressedHarmonicsCount++;
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
    suppressedHarmonicsCount,
  };
}
