/**
 * Per-video calibration of the falling-bar reader.
 *
 * Videos differ a lot: black or coloured backgrounds, filled or glassy bars, sparks and particles.
 * Instead of fixed thresholds, the reader measures the video first:
 *  - background chroma: bars must be clearly more colourful than the background (a teal backdrop
 *    behind teal bars is otherwise "bar colour" everywhere);
 *  - bar colours: hue of pixels that form bar-sized horizontal runs (dots and sparks are ignored),
 *    with the average horizontal position of each colour (to tell left and right hand apart).
 */

import type { RGB } from './videoScanner.ts';

export interface BarHue {
  hue: number; // 0-360
  share: number; // fraction of bar pixels with this colour
  meanXRatio: number; // average horizontal position 0..1 (right hand plays higher = further right)
  color: RGB;
}

export interface BarCalibration {
  /** Minimum chroma (max-min channel) for a pixel to count as bar colour. */
  minChroma: number;
  /** Brightness of outline edges (hollow bars drawn as a light frame): clearly above the background. */
  edgeBrightness: number;
  /** Bar colours found in the video, most common first (at most 2). */
  barHues: BarHue[];
  /**
   * Typical brightness (max channel) of bar pixels, 0 when unknown. Pixels much darker than this are
   * not bar body: shading between stacked repeated notes, outlines, background showing through.
   */
  barBrightness: number;
}

export interface FrameSample {
  data: Uint8ClampedArray; // RGBA rows
  width: number;
  rows: number;
}

const hueOf = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
};

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Measures background chroma and the bar colours from a few frames of the note area. */
export function calibrateBars(samples: FrameSample[], whiteKeyPx: number): BarCalibration {
  // 1. Background level: most of the note area is background
  const chromaHist = new Uint32Array(256);
  const brightHist = new Uint32Array(256);
  let total = 0;
  for (const s of samples) {
    for (let i = 0; i < s.data.length; i += 16) {
      const r = s.data[i];
      const g = s.data[i + 1];
      const b = s.data[i + 2];
      chromaHist[Math.max(r, g, b) - Math.min(r, g, b)]++;
      brightHist[Math.max(r, g, b)]++;
      total++;
    }
  }
  let acc = 0;
  let p75 = 0;
  for (let c = 0; c < 256; c++) {
    acc += chromaHist[c];
    if (acc >= total * 0.75) {
      p75 = c;
      break;
    }
  }
  const minChroma = Math.max(20, Math.min(90, p75 + 18));
  let accB = 0;
  let p90 = 0;
  for (let c = 0; c < 256; c++) {
    accB += brightHist[c];
    if (accB >= total * 0.9) {
      p90 = c;
      break;
    }
  }
  const edgeBrightness = Math.max(150, Math.min(235, p90 + 60));

  // 2. Bar colours: hue of runs at least ~40% of a white key wide that also continue a few rows
  //    above and below (bars are tall; sparks and particle clouds are made of small dots)
  const minRun = Math.max(3, Math.round(whiteKeyPx * 0.4));
  const tall = Math.max(3, Math.round(whiteKeyPx * 0.35));
  const isBarPixel = (s: FrameSample, x: number, y: number, hue: number) => {
    if (y < 0 || y >= s.rows) return false;
    const i = (y * s.width + x) * 4;
    const r = s.data[i];
    const g = s.data[i + 1];
    const b = s.data[i + 2];
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    return chroma >= minChroma && max >= 80 && chroma / max >= 0.25 && hueDist(hueOf(r, g, b), hue) <= 25;
  };
  const bins = new Float64Array(36);
  const barBrightHist = new Float64Array(256);
  const binX = new Float64Array(36);
  const binRgb = Array.from({ length: 36 }, () => [0, 0, 0]);
  for (const s of samples) {
    const rowStep = Math.max(1, Math.floor(s.rows / 120));
    // Upper two thirds only: impact effects (sparks, flames, glow) gather right above the keys,
    // while falling bars cross the whole area
    const lastRow = Math.floor(s.rows * 0.66);
    for (let y = 0; y < lastRow; y += rowStep) {
      let runStart = -1;
      let runHue = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      const flush = (end: number) => {
        const len = end - runStart;
        const mid = Math.floor((runStart + end) / 2);
        if (len >= minRun && isBarPixel(s, mid, y - tall, runHue) && isBarPixel(s, mid, y + tall, runHue)) {
          const r = sumR / len;
          const g = sumG / len;
          const b = sumB / len;
          const bin = Math.floor(hueOf(r, g, b) / 10) % 36;
          bins[bin] += len;
          barBrightHist[Math.round(Math.max(r, g, b))] += len;
          binX[bin] += ((runStart + end) / 2 / s.width) * len;
          binRgb[bin][0] += r * len;
          binRgb[bin][1] += g * len;
          binRgb[bin][2] += b * len;
        }
        runStart = -1;
      };
      for (let x = 0; x <= s.width; x++) {
        let on = false;
        let h = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        if (x < s.width) {
          const i = (y * s.width + x) * 4;
          r = s.data[i];
          g = s.data[i + 1];
          b = s.data[i + 2];
          const max = Math.max(r, g, b);
          const chroma = max - Math.min(r, g, b);
          on = chroma >= minChroma && max >= 80 && chroma / max >= 0.25;
          if (on) h = hueOf(r, g, b);
        }
        // A run continues while the hue stays the same colour family
        if (on && runStart >= 0 && hueDist(h, runHue) > 25) flush(x);
        if (on) {
          if (runStart < 0) {
            runStart = x;
            runHue = h;
            sumR = sumG = sumB = 0;
          }
          sumR += r;
          sumG += g;
          sumB += b;
        } else if (runStart >= 0) {
          flush(x);
        }
      }
    }
  }

  // 3. Peaks of the hue histogram (merging each peak with its neighbours)
  const sum = bins.reduce((a, v) => a + v, 0);
  const barHues: BarHue[] = [];
  if (sum > 0) {
    const used = new Set<number>();
    for (let k = 0; k < 2; k++) {
      let best = -1;
      for (let i = 0; i < 36; i++) {
        if (used.has(i)) continue;
        if (barHues.some((p) => hueDist(i * 10 + 5, p.hue) < 35)) continue;
        if (best < 0 || bins[i] > bins[best]) best = i;
      }
      if (best < 0) break;
      const group = [best - 1, best, best + 1].map((i) => (i + 36) % 36);
      const weight = group.reduce((a, i) => a + bins[i], 0);
      // A second colour must be a real share of the bars, not a stray accent
      if (k > 0 && weight < sum * 0.12) break;
      if (weight === 0) break;
      group.forEach((i) => used.add(i));
      const rgb = group.reduce((a, i) => [a[0] + binRgb[i][0], a[1] + binRgb[i][1], a[2] + binRgb[i][2]], [0, 0, 0]);
      const color = { r: Math.round(rgb[0] / weight), g: Math.round(rgb[1] / weight), b: Math.round(rgb[2] / weight) };
      barHues.push({
        hue: Math.round(hueOf(color.r, color.g, color.b)),
        share: weight / sum,
        meanXRatio: group.reduce((a, i) => a + binX[i], 0) / weight,
        color,
      });
    }
  }
  let barBrightness = 0;
  const barTotal = barBrightHist.reduce((a, v) => a + v, 0);
  if (barTotal > 0) {
    let accBar = 0;
    for (let v = 0; v < 256; v++) {
      accBar += barBrightHist[v];
      if (accBar >= barTotal * 0.5) {
        barBrightness = v;
        break;
      }
    }
  }
  return { minChroma, edgeBrightness, barHues, barBrightness };
}

export interface ResolvedColors {
  colorMode: 'two-colors' | 'single-color';
  hand1Color: RGB; // right hand
  hand2Color: RGB; // left hand
  /** True when the user's colours did not match the video and the detected ones are used. */
  adjusted: boolean;
}

/**
 * Keeps the user's hand colours when they match the bars in the video; otherwise uses the detected
 * ones (two colours: the one further right is the right hand; one colour: hands split by pitch).
 */
export function resolveHandColors(
  user: { colorMode: 'two-colors' | 'single-color' | 'auto'; hand1Color: RGB; hand2Color: RGB },
  cal: BarCalibration
): ResolvedColors {
  const userMode = user.colorMode === 'single-color' ? 'single-color' : 'two-colors';
  const keep: ResolvedColors = { colorMode: userMode, hand1Color: user.hand1Color, hand2Color: user.hand2Color, adjusted: false };
  const peaks = cal.barHues;
  if (peaks.length === 0) return keep;

  // Both hands drawn in the same colour: colour cannot separate them, the pitch split does
  if (peaks.length === 1 && userMode === 'two-colors') {
    return { colorMode: 'single-color', hand1Color: peaks[0].color, hand2Color: peaks[0].color, adjusted: true };
  }

  const userHues = [hueOf(user.hand1Color.r, user.hand1Color.g, user.hand1Color.b)];
  if (userMode === 'two-colors') userHues.push(hueOf(user.hand2Color.r, user.hand2Color.g, user.hand2Color.b));
  const matches = peaks.every((p) => userHues.some((h) => hueDist(h, p.hue) <= 35));
  if (matches && user.colorMode !== 'auto') return keep;

  if (peaks.length >= 2) {
    const [a, b] = peaks[0].meanXRatio >= peaks[1].meanXRatio ? [peaks[0], peaks[1]] : [peaks[1], peaks[0]];
    return { colorMode: 'two-colors', hand1Color: a.color, hand2Color: b.color, adjusted: !matches || user.colorMode === 'auto' };
  }
  return { colorMode: 'single-color', hand1Color: peaks[0].color, hand2Color: peaks[0].color, adjusted: true };
}
