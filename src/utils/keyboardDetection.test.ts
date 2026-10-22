import test from 'node:test';
import assert from 'node:assert/strict';
import { describeKeyboard, detectKeyboard, keyboardRange, whiteIndexToPitch } from './keyboardDetection.ts';

const BLACK = new Set([1, 2, 4, 5, 6]);
const mod7 = (v: number) => ((v % 7) + 7) % 7;

/**
 * Synthetic frame with a keyboard: `lowWhite` is the white index of the first key (A0 = 5, C2 = 14),
 * `edge(j)` the x of the left edge of white key j (j = 0..whites). Rows above 60% are background,
 * 60-85% hold black and white keys, 85-100% white keys only (with thin seams).
 */
function keyboardFrame(
  width: number,
  height: number,
  lowWhite: number,
  whites: number,
  edge: (j: number) => number,
  opts: { whiteLum?: (x: number) => number; background?: number } = {}
) {
  const data = new Uint8ClampedArray(width * height * 4);
  const whiteLum = opts.whiteLum ?? (() => 235);
  const bg = opts.background ?? 10;
  const top = Math.round(height * 0.6);
  const blackBottom = Math.round(height * 0.85);
  const kbLeft = edge(0);
  const kbRight = edge(whites);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = bg;
      if (y >= top && x >= kbLeft && x < kbRight) {
        v = whiteLum(x);
        for (let j = 0; j <= whites; j++) if (Math.abs(x - edge(j)) < 1) v = Math.round(whiteLum(x) * 0.55); // seam
        if (y < blackBottom) {
          for (let j = 1; j < whites; j++) {
            if (!BLACK.has(mod7(lowWhite + j))) continue;
            const w = (edge(j + 1) - edge(j - 1)) / 2;
            if (Math.abs(x - edge(j)) <= w * 0.28) v = 18;
          }
        }
      }
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

test('a whole 88-key keyboard gets the A0-C8 range and exactly 88 keys', () => {
  const W = 960;
  const H = 240;
  const kw = W / 52;
  const layout = detectKeyboard([keyboardFrame(W, H, 5, 52, (j) => j * kw)], W, H);
  assert.ok(layout);
  assert.equal(layout.standardSize, 88);
  assert.equal(layout.keyCount, 88);
  assert.equal(layout.lowestPitch, 21);
  assert.equal(layout.highestPitch, 108);
  const c4 = layout.keys.find((k) => k.pitch === 60)!;
  assert.ok(Math.abs(c4.centerRatio * W - (23 + 0.5) * kw) < kw * 0.15, 'C4 is the 24th white key');
  assert.equal(describeKeyboard(layout), '88 teclas (A0–C8)');
});

test('a 61-key keyboard with margins is recognised and the margins hold no keys', () => {
  const W = 960;
  const H = 240;
  const kw = 22;
  const left = 84;
  const layout = detectKeyboard([keyboardFrame(W, H, 14, 36, (j) => left + j * kw)], W, H);
  assert.ok(layout);
  assert.equal(layout.standardSize, 61);
  assert.equal(layout.keyCount, 61);
  assert.equal(layout.lowestPitch, 36);
  assert.equal(layout.highestPitch, 96);
  for (const k of layout.keys) assert.ok(k.centerRatio * W > left && k.centerRatio * W < left + 36 * kw);
});

test('a zoomed keyboard keeps only the visible keys and is centred around middle C', () => {
  const W = 960;
  const H = 240;
  const kw = 27.5;
  // 35 white keys starting on E, partly cut at both edges
  const layout = detectKeyboard([keyboardFrame(W, H, 2, 36, (j) => -14 + j * kw)], W, H);
  assert.ok(layout);
  assert.equal(layout.standardSize, null);
  assert.ok(layout.keyCount >= 58 && layout.keyCount <= 61, `got ${layout.keyCount}`);
  assert.ok(layout.lowestPitch <= 60 && layout.highestPitch >= 60);
  const xs = layout.keys.map((k) => k.centerRatio * W);
  assert.ok(Math.min(...xs) >= -kw * 0.1 && Math.max(...xs) <= W + kw * 0.1);
});

test('uneven lighting (dim half of the keyboard) does not lose keys', () => {
  const W = 960;
  const H = 240;
  const kw = W / 52;
  const layout = detectKeyboard(
    [keyboardFrame(W, H, 5, 52, (j) => j * kw, { whiteLum: (x) => (x < W / 2 ? 235 : 95) })],
    W,
    H
  );
  assert.ok(layout);
  assert.equal(layout.keyCount, 88);
});

test('camera perspective (keys widening across the frame) keeps every key on its lane', () => {
  const W = 960;
  const H = 240;
  // Key width grows from 15 to 22 px across the keyboard
  const edge = (j: number) => 15 * j + ((7 / 2) * (j * j)) / 52;
  const layout = detectKeyboard([keyboardFrame(W, H, 5, 52, edge)], W, H);
  assert.ok(layout);
  assert.equal(layout.lowestPitch, 21);
  const whites = layout.keys.filter((k) => !k.isBlack);
  whites.forEach((k, j) => {
    const truth = (edge(j) + edge(j + 1)) / 2;
    assert.ok(
      Math.abs(k.centerRatio * W - truth) < (edge(j + 1) - edge(j)) * 0.2,
      `white ${j} off by ${k.centerRatio * W - truth}`
    );
  });
});

test('note-name letters on every white key are not taken for black keys', () => {
  const W = 960;
  const H = 240;
  const data = new Uint8ClampedArray(W * H * 4).fill(235);
  // Dark letter strokes centred on every white key, evenly spaced, on a few rows
  for (let y = 200; y < 215; y++) {
    for (let j = 0; j < 52; j++) {
      const cx = (j + 0.5) * (W / 52);
      for (let x = Math.round(cx - 3); x <= Math.round(cx + 3); x++) {
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 20;
      }
    }
  }
  assert.equal(detectKeyboard([data], W, H), null);
});

test('keyboardRange: standard sizes, cut-off keyboards and zoomed views', () => {
  // 52 white keys starting on A (local index 5 -> A0)
  assert.deepEqual(keyboardRange(5, 56), { octaveOffset: 0, standardSize: 88 });
  // Same 88-key keyboard with A0 cut off by the frame edge (51 keys from B)
  const cut = keyboardRange(6 - 21, 56 - 21, true);
  assert.equal(cut.standardSize, 88);
  assert.equal(whiteIndexToPitch(6 - 21 + 7 * cut.octaveOffset), 23); // B0
  // Zoomed: 20 white keys, not cut -> centred, no standard size
  const zoom = keyboardRange(0, 19);
  assert.equal(zoom.standardSize, null);
});
