import test from 'node:test';
import assert from 'node:assert/strict';
import { findShortcut, SHORTCUTS } from './shortcuts.ts';

const ev = (key: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {}, code?: string) => ({
  key,
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

test('plain tool keys do not fire with Ctrl (Ctrl+V paste, Ctrl+R reload)', () => {
  assert.equal(findShortcut(ev('v'), false)?.id, 'toolPointer');
  assert.equal(findShortcut(ev('v', { ctrl: true }), false), null);
  assert.equal(findShortcut(ev('r', { ctrl: true }), false), null);
  assert.equal(findShortcut(ev('R', { shift: true }), false), null);
});

test('modifier combinations resolve to the right action', () => {
  assert.equal(findShortcut(ev('s', { ctrl: true }), false)?.id, 'save');
  assert.equal(findShortcut(ev('S', { ctrl: true, shift: true }), false)?.id, 'saveAs');
  assert.equal(findShortcut(ev('z', { meta: true }), false)?.id, 'undo');
  assert.equal(findShortcut(ev('Z', { ctrl: true, shift: true }), false)?.id, 'redoAlt');
  assert.equal(findShortcut(ev('M', { shift: true }), false)?.id, 'addMarker');
  assert.equal(findShortcut(ev('m'), false)?.id, 'toolSelect');
  assert.equal(findShortcut(ev(' ', {}, 'Space'), false)?.id, 'playPause');
  assert.equal(findShortcut(ev('?', { shift: true }), false)?.id, 'help');
});

test('only project shortcuts work while typing', () => {
  assert.equal(findShortcut(ev('v'), true), null);
  assert.equal(findShortcut(ev(' ', {}, 'Space'), true), null);
  assert.equal(findShortcut(ev('s', { ctrl: true }), true)?.id, 'save');
});

test('every shortcut has a unique key combination', () => {
  const combos = SHORTCUTS.map((s) => `${s.mod ? 'C' : ''}${s.shift ? 'S' : ''}${s.alt ? 'A' : ''}${s.key.toLowerCase()}`);
  assert.equal(new Set(combos).size, combos.length);
});
