/**
 * Finds the piano keyboard drawn in a video frame and maps every visible key to its MIDI pitch.
 *
 * Black keys are dark neutral runs on a row crossing them; the 2-3 grouping of their spacing tells
 * which ones are C#/D# and F#/G#/A#. Positions are measured key by key (not forced onto an even
 * ruler), so camera perspective and lens distortion on filmed pianos do not shift the outer keys.
 * Rows from several frames are merged, so hands covering keys in one frame do not hide them.
 * The number of visible keys decides the range: a whole 88/76/73/61/49/37/25-key keyboard gets its
 * real range, a zoomed or cropped one is centred around E4/F4.
 */

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
  keyboardYRatio: number; // row (0..1 of frame height) crossing the black keys, used to check frames
  /** Top edge of the keys (0..1 of frame height): falling bars are played when they reach it. */
  topYRatio: number;
  lowestPitch: number;
  highestPitch: number;
  /** Number of keys visible in the video (only these keys are in `keys`). */
  keyCount: number;
  /** 88, 76, 61... when a whole keyboard of a standard size is visible; null for zoomed/cropped views. */
  standardSize: number | null;
  score: number; // number of black keys that fit the piano pattern
}

/** Black keys measured on one pixel row. Boundary/white indices are local: index mod 7 = letter (0 = C). */
export interface KeyboardRowGeometry {
  width: number;
  yRatio: number;
  /** Boundary index B (between white keys B-1 and B) -> measured black key center (px). */
  black: Map<number, number>;
  jMin: number; // first visible white key (local index)
  jMax: number; // last visible white key
  whiteW: number;
  blackW: number;
  score: number;
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

/** Position of every key boundary from the measured black keys (interpolated/extrapolated elsewhere). */
function boundaryPositions(black: Map<number, number>, whiteW: number): (B: number) => number {
  const Bs = [...black.keys()].sort((a, b) => a - b);
  const xs = Bs.map((B) => black.get(B)!);
  const slopeAt = (i: number, j: number) => (xs[j] - xs[i]) / (Bs[j] - Bs[i]);
  return (B: number) => {
    if (Bs.length === 0) return B * whiteW;
    if (Bs.length === 1) return xs[0] + (B - Bs[0]) * whiteW;
    let lo = 0;
    let hi = Bs.length - 1;
    if (B <= Bs[0]) return xs[0] + (B - Bs[0]) * slopeAt(0, Math.min(Bs.length - 1, 2));
    if (B >= Bs[hi]) return xs[hi] + (B - Bs[hi]) * slopeAt(Math.max(0, hi - 2), hi);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (Bs[mid] <= B) lo = mid;
      else hi = mid;
    }
    if (Bs[lo] === B) return xs[lo];
    return xs[lo] + ((B - Bs[lo]) / (Bs[hi] - Bs[lo])) * (xs[hi] - xs[lo]);
  };
}

/**
 * Measures the black keys on one pixel row. Dark/bright is decided against the local contrast, so
 * uneven lighting (filmed pianos, vignettes, glow) does not hide part of the keyboard.
 */
export function detectKeyboardRow(rowData: Uint8ClampedArray, width: number, yRatio = 0): KeyboardRowGeometry | null {
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

  // Local min/max over a window a few keys wide (computed on 8px blocks)
  const BLOCK = 8;
  const blocks = Math.ceil(width / BLOCK);
  const bMin = new Float32Array(blocks).fill(255);
  const bMax = new Float32Array(blocks);
  for (let px = 0; px < width; px++) {
    const k = (px / BLOCK) | 0;
    if (lum[px] < bMin[k]) bMin[k] = lum[px];
    if (lum[px] > bMax[k]) bMax[k] = lum[px];
  }
  const radius = Math.max(3, Math.round(width / 14 / BLOCK));
  const threshold = new Float32Array(width);
  const contrastOk = new Uint8Array(width);
  for (let k = 0; k < blocks; k++) {
    let mn = 255;
    let mx = 0;
    for (let q = Math.max(0, k - radius); q <= Math.min(blocks - 1, k + radius); q++) {
      if (bMin[q] < mn) mn = bMin[q];
      if (bMax[q] > mx) mx = bMax[q];
    }
    for (let px = k * BLOCK; px < Math.min(width, (k + 1) * BLOCK); px++) {
      // Black keys sit near the local minimum; seams and shadows between white keys are mid-grey
      threshold[px] = mn + (mx - mn) * 0.35;
      contrastOk[px] = mx - mn >= 45 && mx >= 70 ? 1 : 0;
    }
  }

  // Dark neutral runs (pressed keys are coloured, so they are excluded and treated as "missing")
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let px = 0; px <= width; px++) {
    const dark = px < width && contrastOk[px] === 1 && lum[px] < threshold[px] && neutral[px] === 1;
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
  // Black keys come in groups of 2 and 3: about 2 of every 5 gaps skip a white key (E-F, B-C).
  // Note-name letters printed on every white key are evenly spaced and fail this test.
  if (units.filter((u) => u === 2).length < gaps.length * 0.2) return null;
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

  const black = new Map<number, number>();
  boundaries.forEach((b, i) => {
    const B = b + bestShift;
    if (BLACK_KEY_BOUNDARIES.has(mod7(B))) black.set(B, centers[i]);
  });
  const Bs = [...black.keys()].sort((a, b) => a - b);
  const whiteW = (black.get(Bs[Bs.length - 1])! - black.get(Bs[0])!) / (Bs[Bs.length - 1] - Bs[0]);
  if (!(whiteW > blackW)) return null;

  // Spacing must stay regular between neighbouring black keys (rejects text and random patterns)
  const pos = boundaryPositions(black, whiteW);
  let bad = 0;
  for (let i = 1; i < Bs.length; i++) {
    const local = (black.get(Bs[i])! - black.get(Bs[i - 1])!) / (Bs[i] - Bs[i - 1]);
    if (Math.abs(local - whiteW) > whiteW * 0.3) bad++;
  }
  if (bad > Bs.length * 0.15) return null;

  // White keys actually drawn: extend past the outermost black keys while the keys are still bright
  // (or lit) inside the frame. Margins and backgrounds beside the keyboard are not keys.
  const isKey = (x: number) => {
    const px = Math.round(x);
    if (px < 0 || px >= width) return false;
    const i = px * 4;
    const maxC = Math.max(rowData[i], rowData[i + 1], rowData[i + 2]);
    const lit = maxC > 80 && (maxC - Math.min(rowData[i], rowData[i + 1], rowData[i + 2])) / maxC > 0.3;
    return (contrastOk[px] === 1 && lum[px] >= threshold[px]) || lit;
  };
  const visible = (j: number) => pos(j) + 0.4 * whiteW >= 0 && pos(j + 1) - 0.4 * whiteW <= width;
  let jMin = Bs[0];
  let jMax = Bs[Bs.length - 1] - 1;
  while (visible(jMin - 1) && isKey((pos(jMin - 1) + pos(jMin)) / 2)) jMin--;
  while (visible(jMax + 1) && isKey((pos(jMax + 1) + pos(jMax + 2)) / 2)) jMax++;
  if (jMax - jMin + 1 < 14) return null;

  return { width, yRatio, black, jMin, jMax, whiteW, blackW, score: bestAligned };
}

/** Common keyboard sizes: lowest white key (white index, C0 = 0) and number of white keys. */
const STANDARD_KEYBOARDS = [
  { keys: 88, lowWhite: 5, whites: 52 }, // A0-C8
  { keys: 76, lowWhite: 9, whites: 45 }, // E1-G7
  { keys: 73, lowWhite: 9, whites: 43 }, // E1-E7
  { keys: 61, lowWhite: 14, whites: 36 }, // C2-C7
  { keys: 49, lowWhite: 14, whites: 29 }, // C2-C6
  { keys: 37, lowWhite: 21, whites: 22 }, // C3-C6
  { keys: 25, lowWhite: 21, whites: 15 }, // C3-C5
];

/**
 * Absolute range of the visible keys. A whole keyboard of a standard size (same number of white keys
 * and same first note) gets its real range. When the keyboard runs past both frame edges, the smallest
 * standard keyboard it fits in, missing at most two cut-off keys, is used. Otherwise (zoomed view) the
 * keys are centred around E4/F4.
 * `jMin`/`jMax` are white-key indices whose value mod 7 is the note letter (0 = C).
 * Returns the number of octaves to add to the local indices.
 */
export function keyboardRange(
  jMin: number,
  jMax: number,
  cutAtEdges = false
): { octaveOffset: number; standardSize: number | null } {
  const whites = jMax - jMin + 1;
  for (const k of STANDARD_KEYBOARDS) {
    if (k.whites === whites && mod7(k.lowWhite) === mod7(jMin)) {
      return { octaveOffset: (k.lowWhite - jMin) / 7, standardSize: k.keys };
    }
  }
  if (cutAtEdges) {
    for (const k of [...STANDARD_KEYBOARDS].reverse()) {
      if (k.whites < whites || k.whites - whites > 2) continue;
      // Placements of the visible keys inside this keyboard, by whole octaves
      for (let m = -12; m <= 12; m++) {
        const lo = jMin + 7 * m;
        const hi = jMax + 7 * m;
        if (lo >= k.lowWhite && hi <= k.lowWhite + k.whites - 1) return { octaveOffset: m, standardSize: k.keys };
      }
    }
  }
  const centerJ = (jMin + jMax) / 2;
  let offset = Math.round((30.5 - centerJ) / 7);
  while (jMin + 7 * offset < 0) offset++;
  while (jMax + 7 * offset > 74) offset--;
  return { octaveOffset: offset, standardSize: null };
}

/**
 * Merges the rows measured on one or more frames into one keyboard. Rows that disagree with the best
 * row (note-name letters, labels, overlays) are dropped; the others fill in keys hidden by hands.
 */
export function mergeKeyboardRows(
  rows: KeyboardRowGeometry[],
  frames: Uint8ClampedArray[] = [],
  height = 0
): KeyboardLayout | null {
  if (rows.length === 0) return null;
  const width = rows[0].width;

  // Align every row to a reference row (local indices differ by whole octaves between rows)
  const alignTo = (ref: KeyboardRowGeometry) => {
    const refPos = boundaryPositions(ref.black, ref.whiteW);
    const group: Array<{ row: KeyboardRowGeometry; shift: number }> = [];
    for (const row of rows) {
      if (Math.abs(row.whiteW - ref.whiteW) > ref.whiteW * 0.08) continue;
      let bestShift = 0;
      let bestHits = -1;
      for (let s = -70; s <= 70; s += 7) {
        let hits = 0;
        for (const [B, x] of row.black) if (Math.abs(refPos(B + s) - x) <= ref.whiteW * 0.3) hits++;
        if (hits > bestHits) {
          bestHits = hits;
          bestShift = s;
        }
      }
      if (bestHits >= row.black.size * 0.7) group.push({ row, shift: bestShift });
    }
    return group;
  };

  // The real keyboard is the geometry most rows agree on (black keys are tall; labels, letters and
  // overlays only span a few rows). Candidates: the best-scoring rows plus an even sample.
  const byScore = [...rows].sort((a, b) => b.score - a.score);
  const step = Math.max(1, Math.floor(rows.length / 24));
  const refs = new Set([...byScore.slice(0, 8), ...rows.filter((_, i) => i % step === 0)]);
  let ref = byScore[0];
  let group: Array<{ row: KeyboardRowGeometry; shift: number }> = [];
  for (const candidate of refs) {
    const g = alignTo(candidate);
    if (g.length > group.length || (g.length === group.length && candidate.score > ref.score)) {
      group = g;
      ref = candidate;
    }
  }
  if (group.length === 0) return null;

  // Black key positions: median over the rows that saw each key
  const seen = new Map<number, number[]>();
  for (const { row, shift } of group) {
    for (const [B, x] of row.black) {
      const list = seen.get(B + shift);
      if (list) list.push(x);
      else seen.set(B + shift, [x]);
    }
  }
  const black = new Map<number, number>();
  for (const [B, xs] of seen) {
    xs.sort((a, b) => a - b);
    black.set(B, xs[xs.length >> 1]);
  }

  // Visible white keys: those seen by a fair share of the rows (hands hide different keys each frame)
  const support = new Map<number, number>();
  for (const { row, shift } of group) {
    for (let j = row.jMin + shift; j <= row.jMax + shift; j++) support.set(j, (support.get(j) ?? 0) + 1);
  }
  const minSupport = Math.max(1, Math.ceil(group.length * 0.2));
  const visibleJ = [...support.entries()].filter(([, n]) => n >= minSupport).map(([j]) => j);
  if (visibleJ.length < 14) return null;
  let jMin = Math.min(...visibleJ);
  let jMax = Math.max(...visibleJ);

  const blackWs = group.map((g) => g.row.blackW).sort((a, b) => a - b);
  const blackW = blackWs[blackWs.length >> 1];
  const ys = group.map((g) => g.row.yRatio).sort((a, b) => a - b);

  // Key boundaries follow a smooth curve (straight for rendered keyboards, slightly bent by camera
  // perspective). Black keys sit near, not exactly on, the white boundaries, so the curve through them
  // only predicts; the thin dark seams between white keys (on a row below the black keys) measure the
  // white keys exactly when they are visible.
  const pos = fitBoundaryCurve([...black.entries()], ref.whiteW, 0.25) ?? boundaryPositions(black, ref.whiteW);
  let boundary = pos;
  const white = frames.length > 0 && height > 0 ? whiteKeyRow(frames, width, height, ys[ys.length - 1]) : null;
  if (white) {
    const seams = findSeams(white, ref.whiteW);
    const matched: Array<[number, number]> = [];
    for (let B = jMin - 3; B <= jMax + 4; B++) {
      const p = pos(B);
      let best = Infinity;
      for (const x of seams) if (Math.abs(x - p) < Math.abs(best - p)) best = x;
      if (Math.abs(best - p) <= ref.whiteW * 0.4) matched.push([B, best]);
    }
    const seamCurve = matched.length >= (jMax - jMin) * 0.6 ? fitBoundaryCurve(matched, ref.whiteW, 0.15) : null;
    if (seamCurve) boundary = seamCurve;

    // Extent: white keys still bright on that row (more reliable than the black-key row at the ends)
    const bright = (j: number) => {
      const a = boundary(j);
      const b = boundary(j + 1);
      if (a + (b - a) * 0.4 < 0 || b - (b - a) * 0.4 > width) return false;
      const x = Math.round(Math.max(0, Math.min(width - 1, (a + b) / 2)));
      return white.lum[x] >= white.whiteLevel * 0.6;
    };
    while (bright(jMin - 1)) jMin--;
    while (bright(jMax + 1)) jMax++;
  }

  const whiteW = (boundary(jMax + 1) - boundary(jMin)) / (jMax + 1 - jMin);
  const cutAtEdges = boundary(jMin) < whiteW * 0.6 && boundary(jMax + 1) > width - whiteW * 0.6;
  const { octaveOffset, standardSize } = keyboardRange(jMin, jMax, cutAtEdges);
  const keys: KeyboardKey[] = [];
  for (let j = jMin; j <= jMax; j++) {
    const whitePitch = whiteIndexToPitch(j + 7 * octaveOffset);
    const left = boundary(j);
    const right = boundary(j + 1);
    keys.push({
      pitch: whitePitch,
      isBlack: false,
      centerRatio: (left + right) / 2 / width,
      widthRatio: (right - left) / width,
    });
    if (j < jMax && BLACK_KEY_BOUNDARIES.has(mod7(j + 1))) {
      const x = black.get(j + 1) ?? pos(j + 1);
      keys.push({ pitch: whitePitch + 1, isBlack: true, centerRatio: x / width, widthRatio: blackW / width });
    }
  }

  return {
    keys,
    whiteKeyWidthRatio: whiteW / width,
    blackKeyWidthRatio: blackW / width,
    keyboardYRatio: ys[ys.length >> 1],
    topYRatio: percentileOf(ys, 0.05),
    lowestPitch: keys[0].pitch,
    highestPitch: keys[keys.length - 1].pitch,
    keyCount: keys.length,
    standardSize,
    score: ref.score,
  };
}

/**
 * Robust quadratic fit x = f(B) through (boundary index, x) points; points further than
 * `tolerance` white keys from the curve are dropped and the fit repeated. Null with too few points.
 */
function fitBoundaryCurve(
  points: Array<[number, number]>,
  whiteW: number,
  tolerance: number
): ((B: number) => number) | null {
  let pts = points;
  let f: ((B: number) => number) | null = null;
  for (let iter = 0; iter < 5; iter++) {
    if (pts.length < 6) return f;
    const mB = pts.reduce((a, [B]) => a + B, 0) / pts.length;
    // Normal equations for x = a + b·u + c·u², u = B - mean (well conditioned)
    let s0 = 0,
      s1 = 0,
      s2 = 0,
      s3 = 0,
      s4 = 0,
      t0 = 0,
      t1 = 0,
      t2 = 0;
    for (const [B, x] of pts) {
      const u = B - mB;
      const u2 = u * u;
      s0 += 1;
      s1 += u;
      s2 += u2;
      s3 += u2 * u;
      s4 += u2 * u2;
      t0 += x;
      t1 += x * u;
      t2 += x * u2;
    }
    const det = (m: number[]) =>
      m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    const M = [s0, s1, s2, s1, s2, s3, s2, s3, s4];
    const D = det(M);
    if (Math.abs(D) < 1e-9) return f;
    const a = det([t0, s1, s2, t1, s2, s3, t2, s3, s4]) / D;
    const b = det([s0, t0, s2, s1, t1, s3, s2, t2, s4]) / D;
    const c = det([s0, s1, t0, s1, s2, t1, s2, s3, t2]) / D;
    f = (B: number) => a + b * (B - mB) + c * (B - mB) * (B - mB);
    const fit = f;
    const kept = points.filter(([B, x]) => Math.abs(fit(B) - x) <= whiteW * tolerance);
    if (kept.length === pts.length) break;
    pts = kept;
  }
  return f;
}

/**
 * A row across the white keys only, below the black keys (median over the frames, so pressed keys
 * and hands in one frame do not matter). Null when the keys end right below the black keys.
 */
function whiteKeyRow(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  blackBottomRatio: number
): { lum: Float32Array; whiteLevel: number } | null {
  const y = Math.round((blackBottomRatio + 0.03) * height);
  if (y >= height) return null;
  const lum = new Float32Array(width);
  const vals = new Float32Array(frames.length);
  for (let x = 0; x < width; x++) {
    for (let f = 0; f < frames.length; f++) {
      const i = (y * width + x) * 4;
      const d = frames[f];
      vals[f] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    vals.sort();
    lum[x] = vals[vals.length >> 1];
  }
  const sorted = Float32Array.from(lum).sort();
  const whiteLevel = percentileOf(sorted, 0.75);
  if (whiteLevel < 90) return null;
  return { lum, whiteLevel };
}

/** Thin dark lines between white keys: local minima clearly below the neighbouring key surface. */
function findSeams(white: { lum: Float32Array }, whiteW: number): number[] {
  const { lum } = white;
  const r = Math.max(2, Math.round(whiteW * 0.4));
  const seams: number[] = [];
  for (let x = 1; x < lum.length - 1; x++) {
    if (lum[x] > lum[x - 1] || lum[x] > lum[x + 1]) continue;
    let left = 0;
    let right = 0;
    for (let d = 2; d <= r; d++) {
      if (x - d >= 0) left = Math.max(left, lum[x - d]);
      if (x + d < lum.length) right = Math.max(right, lum[x + d]);
    }
    if (lum[x] < Math.min(left, right) * 0.85) {
      // Merge plateaus (2-3px wide seams) into their centre
      if (seams.length && x - seams[seams.length - 1] <= 3) seams[seams.length - 1] = (seams[seams.length - 1] + x) / 2;
      else seams.push(x);
    }
  }
  return seams;
}

/** Detects the keyboard from a single row (tests, quick checks). */
export function detectKeyboardLayoutFromRow(
  rowData: Uint8ClampedArray,
  width: number,
  keyboardYRatio = 0
): KeyboardLayout | null {
  const row = detectKeyboardRow(rowData, width, keyboardYRatio);
  return row ? mergeKeyboardRows([row]) : null;
}

/** Finds the keyboard in full RGBA frames (several frames: hands and pressed keys hide less). */
export function detectKeyboard(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  minYRatio = 0.4
): KeyboardLayout | null {
  const rows = frames.flatMap((d) => collectKeyboardRows(d, width, height, minYRatio));
  return mergeKeyboardRows(rows, frames, height);
}

/** Measures every few rows of an RGBA frame below `minYRatio`. */
export function collectKeyboardRows(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minYRatio = 0.4
): KeyboardRowGeometry[] {
  const startY = Math.max(0, Math.min(height - 1, Math.floor(height * minYRatio)));
  const step = Math.max(1, Math.round(height * 0.006));
  const found: KeyboardRowGeometry[] = [];
  for (let y = startY; y < height; y += step) {
    const row = detectKeyboardRow(data.subarray(y * width * 4, (y + 1) * width * 4), width, y / height);
    if (row) found.push(row);
  }
  return found;
}

/** Draws the frame and returns its keyboard (or null). */
export function detectKeyboardLayoutInFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  minYRatio = 0.4
): KeyboardLayout | null {
  ctx.drawImage(source, 0, 0, width, height);
  return detectKeyboard([ctx.getImageData(0, 0, width, height).data], width, height, minYRatio);
}

/**
 * Checks that the detected keyboard is still on screen in a frame, using the pixel row where its
 * black keys were measured: black keys must be dark, white keys bright, pressed keys coloured.
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
  if (lit > samples.length * 0.4) return false; // coloured screen, not a keyboard with a few keys pressed

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

/** Short description such as "88 teclas (A0–C8)" or "59 teclas visíveis (E2–D7)". */
export function describeKeyboard(layout: KeyboardLayout): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = (p: number) => `${names[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
  const range = `${name(layout.lowestPitch)}–${name(layout.highestPitch)}`;
  return layout.standardSize
    ? `${layout.standardSize} teclas (${range})`
    : `${layout.keyCount} teclas visíveis (${range})`;
}

/**
 * Suggested reading line (0..1 of frame height): just above the keys and above the glow, smoke and
 * flames that visualizers draw where the bars hit the keyboard. `frames` are full RGBA frames.
 */
export function suggestReadingLine(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  layout: KeyboardLayout
): number {
  const top = Math.max(10, Math.round(layout.topYRatio * height) - 2);
  if (frames.length === 0) return Math.max(0.2, (top - Math.round(height * 0.03)) / height);

  // Mean brightness of each row above the keys, over all sample frames
  const rowLum = new Float32Array(top);
  for (const data of frames) {
    for (let y = 0; y < top; y++) {
      let sum = 0;
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        sum += Math.max(data[i], data[i + 1], data[i + 2]);
      }
      rowLum[y] += sum / Math.ceil(width / 2) / frames.length;
    }
  }
  // Background level: the note area well above the keys
  const upper = Array.from(rowLum.slice(Math.round(top * 0.25), Math.round(top * 0.7))).sort((a, b) => a - b);
  const background = upper[upper.length >> 1] ?? 0;
  const spread = Math.max(8, (upper[Math.round(upper.length * 0.9)] ?? background) - background);

  // Walk up from the keys while rows are still lit by the impact effects
  const maxZone = Math.round(height * 0.2);
  let y = top - 1;
  while (y > top - maxZone && rowLum[y] > background + spread * 1.5) y--;
  const margin = Math.max(3, Math.round(height * 0.012));
  return Math.max(0.2, (y - margin) / height);
}
