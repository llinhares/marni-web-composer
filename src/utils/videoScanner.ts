import type { Note } from '../types/music.ts';
import { TICKS_PER_BEAT } from '../types/music.ts';

export interface VisualNoteEvent {
  pitch: number;
  startSec: number;
  endSec: number;
  hand: 'right' | 'left';
  color: { r: number; g: number; b: number };
}

export interface VideoScanOptions {
  scanlineYRatio?: number; // 0.0 to 1.0 (default 0.85, just above the piano keys)
  minPitch?: number; // default 21 (A0)
  maxPitch?: number; // default 108 (C8)
  keyboardXStartRatio?: number; // 0.0 to 1.0 (default 0.03)
  keyboardXEndRatio?: number; // 0.0 to 1.0 (default 0.97)
  brightnessThreshold?: number; // 0 to 255 (default 45)
  colorDifferenceThreshold?: number; // threshold to distinguish left vs right hand colors
  fps?: number; // sampling fps (default 30)
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
 * Scans an HTML5 Video element frame by frame along a calibrated hit-line,
 * tracking falling Synthesia bars, their durations, and color-coded hand attribution.
 */
export async function scanVideoFrames(
  videoElement: HTMLVideoElement,
  options: VideoScanOptions = {}
): Promise<VideoScanResult> {
  const {
    scanlineYRatio = 0.85,
    minPitch = 21,
    maxPitch = 108,
    keyboardXStartRatio = 0.02,
    keyboardXEndRatio = 0.98,
    brightnessThreshold = 40,
    fps = 30,
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

  const scanY = Math.round(height * scanlineYRatio);
  const kbStartX = Math.round(width * keyboardXStartRatio);
  const kbEndX = Math.round(width * keyboardXEndRatio);
  const kbWidth = Math.max(10, kbEndX - kbStartX);

  const frameInterval = 1 / fps;
  const totalFrames = Math.floor(duration / frameInterval);

  interface ActiveVisualNote {
    pitch: number;
    startSec: number;
    lastSec: number;
    colors: { r: number; g: number; b: number }[];
  }

  const activeNotes = new Map<number, ActiveVisualNote>();
  const collectedNotes: {
    pitch: number;
    startSec: number;
    endSec: number;
    avgColor: { r: number; g: number; b: number };
  }[] = [];

  const sampledColors: { r: number; g: number; b: number }[] = [];

  // Seek and sample frame by frame
  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = frame * frameInterval;

    if (frame % 15 === 0 && onProgress) {
      const progress = frame / totalFrames;
      onProgress(progress, `Lendo frames visuais (${Math.round(progress * 100)}%)...`);
    }

    // Seek video to exact time and wait for seeked event
    videoElement.currentTime = currentTime;
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        videoElement.removeEventListener('seeked', onSeeked);
        resolve();
      };
      videoElement.addEventListener('seeked', onSeeked, { once: true });
    });

    ctx.drawImage(videoElement, 0, 0, width, height);

    // Read pixel data across the keyboard hit-line
    const lineData = ctx.getImageData(kbStartX, scanY, kbWidth, 1).data;

    // Detect active keys in this frame
    const currentFramePitches = new Map<number, { r: number; g: number; b: number }>();

    for (let px = 0; px < kbWidth; px += 2) {
      const idx = px * 4;
      const r = lineData[idx];
      const g = lineData[idx + 1];
      const b = lineData[idx + 2];

      const brightness = Math.max(r, g, b);
      if (brightness > brightnessThreshold) {
        // Exclude pure white/grey key edges if saturation is near zero and not high brightness
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

        if (saturation > 0.18 || brightness > 140) {
          const pitch = xToPianoPitch(px, kbWidth, minPitch, maxPitch);
          if (!currentFramePitches.has(pitch)) {
            currentFramePitches.set(pitch, { r, g, b });
            if (sampledColors.length < 500) {
              sampledColors.push({ r, g, b });
            }
          }
        }
      }
    }

    // Update active notes
    for (const [pitch, color] of currentFramePitches.entries()) {
      if (!activeNotes.has(pitch)) {
        activeNotes.set(pitch, {
          pitch,
          startSec: currentTime,
          lastSec: currentTime,
          colors: [color],
        });
      } else {
        const existing = activeNotes.get(pitch)!;
        existing.lastSec = currentTime;
        existing.colors.push(color);
      }
    }

    // Check for released notes in this frame
    for (const [pitch, note] of activeNotes.entries()) {
      if (!currentFramePitches.has(pitch)) {
        const durationSec = note.lastSec - note.startSec;
        if (durationSec >= 0.05) {
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
            endSec: note.lastSec + frameInterval,
            avgColor,
          });
        }
        activeNotes.delete(pitch);
      }
    }
  }

  // Flush remaining notes
  for (const note of activeNotes.values()) {
    const durationSec = note.lastSec - note.startSec;
    if (durationSec >= 0.05) {
      const count = note.colors.length;
      const avgColor = {
        r: Math.round(note.colors.reduce((acc, c) => acc + c.r, 0) / count),
        g: Math.round(note.colors.reduce((acc, c) => acc + c.g, 0) / count),
        b: Math.round(note.colors.reduce((acc, c) => acc + c.b, 0) / count),
      };
      collectedNotes.push({
        pitch: note.pitch,
        startSec: note.startSec,
        endSec: note.lastSec + frameInterval,
        avgColor,
      });
    }
  }

  // 2-Means Color Clustering to distinguish Left Hand vs Right Hand
  let dominantRight = { r: 0, g: 200, b: 120 }; // default green/cyan
  let dominantLeft = { r: 80, g: 140, b: 240 };  // default blue/purple

  if (sampledColors.length >= 10) {
    // Seed cluster 1 with highest hue, cluster 2 with lowest hue
    const withHsl = sampledColors.map((c) => ({ rgb: c, hsl: rgbToHsl(c.r, c.g, c.b) }));
    withHsl.sort((a, b) => a.hsl.h - b.hsl.h);

    const c1Seed = withHsl[Math.floor(withHsl.length * 0.25)].rgb;
    const c2Seed = withHsl[Math.floor(withHsl.length * 0.75)].rgb;

    if (colorDistance(c1Seed, c2Seed) > 30) {
      dominantRight = c2Seed; // typically higher frequency / treble
      dominantLeft = c1Seed;  // typically lower frequency / bass
    }
  }

  // Assign hands based on color distance and pitch heuristics
  const visualNotes: VisualNoteEvent[] = collectedNotes.map((note) => {
    const distRight = colorDistance(note.avgColor, dominantRight);
    const distLeft = colorDistance(note.avgColor, dominantLeft);

    let hand: 'right' | 'left' = distRight <= distLeft ? 'right' : 'left';

    // Pitch sanity heuristic (Right hand is usually >= Middle C 60, Left hand usually < 60)
    if (Math.abs(distRight - distLeft) < 15) {
      hand = note.pitch >= 60 ? 'right' : 'left';
    }

    return {
      pitch: note.pitch,
      startSec: note.startSec,
      endSec: note.endSec,
      hand,
      color: note.avgColor,
    };
  });

  return {
    visualNotes,
    dominantColors: {
      rightHand: dominantRight,
      leftHand: dominantLeft,
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
    const durationTicks = Math.max(60, Math.round((vNote.endSec - vNote.startSec) * ticksPerSecond));

    // Find closest audio note with identical pitch and time within 250ms tolerance
    const toleranceTicks = Math.round(0.25 * ticksPerSecond);
    const matchedAudio = audioNotes.find(
      (a) => a.pitch === vNote.pitch && Math.abs(a.startTick - startTick) <= toleranceTicks
    );

    const velocity = matchedAudio?.velocity || 95;

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
