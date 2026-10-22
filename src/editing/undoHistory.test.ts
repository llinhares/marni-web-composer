import test from 'node:test';
import assert from 'node:assert/strict';
import { UndoHistory } from './undoHistory.ts';

test('push, undo and redo walk the history', () => {
  const h = new UndoHistory(0);
  h.push(1);
  h.push(2);
  assert.equal(h.undo(), 1);
  assert.equal(h.undo(), 0);
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 1);
  assert.equal(h.current, 1);
});

test('several pushes in a row are all kept (no stale index)', () => {
  const h = new UndoHistory('a');
  h.push('b');
  h.push('c');
  h.push('d');
  assert.equal(h.undo(), 'c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
});

test('a new edit after undo discards the redo branch', () => {
  const h = new UndoHistory(0);
  h.push(1);
  h.push(2);
  h.undo();
  h.push(5);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), 1);
});

test('identical states are ignored', () => {
  const h = new UndoHistory({ v: 1 }, { equals: (a, b) => a.v === b.v });
  assert.equal(h.push({ v: 1 }), false);
  assert.equal(h.canUndo, false);
});

test('grouped changes within the window collapse into one undo step', () => {
  const h = new UndoHistory(50);
  h.push(51, 'volume', 1000);
  h.push(55, 'volume', 1400);
  h.push(60, 'volume', 1800);
  h.push(70, 'volume', 5000); // after the window: new step
  assert.equal(h.undo(), 60);
  assert.equal(h.undo(), 50, 'The whole drag is a single step');
});

test('different groups never merge, and the limit drops the oldest steps', () => {
  const h = new UndoHistory(0, { limit: 3 });
  h.push(1, 'a', 0);
  h.push(2, 'b', 1);
  h.push(3, 'b', 2000);
  assert.equal(h.undo(), 2);
  assert.equal(h.undo(), 1);
  assert.equal(h.undo(), null, 'Initial state fell off the 3-entry limit');
});

test('reset starts a fresh history', () => {
  const h = new UndoHistory(0);
  h.push(1);
  h.reset(9);
  assert.equal(h.current, 9);
  assert.equal(h.canUndo, false);
});
