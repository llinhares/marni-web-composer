import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateBars, resolveHandColors, type FrameSample } from './barCalibration.ts';

/** Synthetic note area: background colour, bars as rectangles, optional sparks (2px dots). */
function frame(
  width: number,
  rows: number,
  bg: [number, number, number],
  bars: Array<{ x: number; w: number; color: [number, number, number] }>,
  sparks: Array<{ x: number; y: number; color: [number, number, number] }> = []
): FrameSample {
  const data = new Uint8ClampedArray(width * rows * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let c = bg;
      for (const b of bars) if (x >= b.x && x < b.x + b.w && y >= 10 && y < rows - 10) c = b.color;
      for (const s of sparks) if (Math.abs(x - s.x) <= 1 && Math.abs(y - s.y) <= 1) c = s.color;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data, width, rows };
}

test('black background with blue and purple bars: two colours, purple on the right', () => {
  const s = frame(400, 120, [0, 0, 0], [
    { x: 50, w: 18, color: [56, 131, 216] }, // blue, left
    { x: 90, w: 18, color: [56, 131, 216] },
    { x: 300, w: 18, color: [168, 85, 247] }, // purple, right
  ]);
  const cal = calibrateBars([s], 18);
  assert.equal(cal.barHues.length, 2);
  const purple = cal.barHues.find((h) => h.hue > 250)!;
  const blue = cal.barHues.find((h) => h.hue < 230)!;
  assert.ok(purple.meanXRatio > blue.meanXRatio);
  assert.ok(cal.minChroma <= 30, 'Black background keeps a low threshold');
});

test('teal background behind teal bars: threshold rises above the background, sparks are ignored', () => {
  const sparks = Array.from({ length: 40 }, (_, k) => ({ x: 20 + k * 9, y: 20 + (k % 8) * 10, color: [170, 230, 60] as [number, number, number] }));
  const s = frame(400, 120, [60, 83, 80], [{ x: 200, w: 17, color: [70, 190, 175] }], sparks);
  const cal = calibrateBars([s], 18);
  assert.ok(cal.minChroma > 23 + 10, `background chroma ~23 must be excluded (got ${cal.minChroma})`);
  assert.equal(cal.barHues.length, 1, 'Sparks (dots) do not count as a bar colour');
  assert.ok(Math.abs(cal.barHues[0].hue - 173) < 10);
});

test('user colours that match the video are kept', () => {
  const cal = { minChroma: 20, edgeBrightness: 200, barHues: [{ hue: 212, share: 0.7, meanXRatio: 0.3, color: { r: 56, g: 131, b: 216 } }, { hue: 270, share: 0.3, meanXRatio: 0.7, color: { r: 168, g: 85, b: 247 } }] };
  const r = resolveHandColors({ colorMode: 'two-colors', hand1Color: { r: 168, g: 85, b: 247 }, hand2Color: { r: 56, g: 189, b: 248 } }, cal);
  assert.equal(r.adjusted, false);
  assert.deepEqual(r.hand1Color, { r: 168, g: 85, b: 247 });
});

test('mismatching user colours are replaced: the colour further right is the right hand', () => {
  const cal = { minChroma: 20, edgeBrightness: 200, barHues: [{ hue: 212, share: 0.7, meanXRatio: 0.3, color: { r: 56, g: 131, b: 216 } }, { hue: 270, share: 0.3, meanXRatio: 0.7, color: { r: 168, g: 85, b: 247 } }] };
  const r = resolveHandColors({ colorMode: 'two-colors', hand1Color: { r: 34, g: 197, b: 94 }, hand2Color: { r: 239, g: 68, b: 68 } }, cal);
  assert.equal(r.adjusted, true);
  assert.equal(r.colorMode, 'two-colors');
  assert.deepEqual(r.hand1Color, { r: 168, g: 85, b: 247 });
  assert.deepEqual(r.hand2Color, { r: 56, g: 131, b: 216 });
});

test('a single bar colour switches to one-colour mode (hands split by pitch)', () => {
  const cal = { minChroma: 40, edgeBrightness: 200, barHues: [{ hue: 173, share: 1, meanXRatio: 0.4, color: { r: 70, g: 190, b: 175 } }] };
  const r = resolveHandColors({ colorMode: 'two-colors', hand1Color: { r: 34, g: 197, b: 94 }, hand2Color: { r: 56, g: 189, b: 248 } }, cal);
  assert.equal(r.colorMode, 'single-color');
  assert.equal(r.adjusted, true);
});

test('a dense cloud of sparks wide enough to look like a run is still not a bar colour', () => {
  // Rows of touching spark dots form wide horizontal runs, but they are only 1-3 px tall
  const w = 400;
  const rows = 120;
  const s = frame(w, rows, [60, 83, 80], [{ x: 200, w: 17, color: [70, 190, 175] }]);
  for (const y of [30, 60, 90]) {
    for (let x = 40; x < 140; x++) {
      const i = (y * w + x) * 4;
      s.data[i] = 170;
      s.data[i + 1] = 230;
      s.data[i + 2] = 60;
    }
  }
  const cal = calibrateBars([s], 18);
  assert.equal(cal.barHues.length, 1);
  assert.ok(Math.abs(cal.barHues[0].hue - 173) < 10);
});
