/**
 * Undo/redo history with change grouping.
 *
 * Updated synchronously (not through React state), so several edits in the same frame are all
 * recorded in order. Consecutive pushes with the same `group` within `groupWindowMs` (slider drags,
 * typing a tempo) collapse into one undo step.
 */

export interface UndoHistoryOptions<T> {
  limit?: number;
  groupWindowMs?: number;
  equals?: (a: T, b: T) => boolean;
}

interface Entry<T> {
  state: T;
  group?: string;
  time: number;
}

export class UndoHistory<T> {
  private entries: Entry<T>[];
  private index = 0;
  private readonly limit: number;
  private readonly groupWindowMs: number;
  private readonly equals: (a: T, b: T) => boolean;

  constructor(initial: T, opts: UndoHistoryOptions<T> = {}) {
    this.entries = [{ state: initial, time: 0 }];
    this.limit = opts.limit ?? 200;
    this.groupWindowMs = opts.groupWindowMs ?? 1000;
    this.equals = opts.equals ?? Object.is;
  }

  get current(): T {
    return this.entries[this.index].state;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  /** Records a new state. Returns false when nothing changed. */
  push(state: T, group?: string, now = Date.now()): boolean {
    const cur = this.entries[this.index];
    if (this.equals(cur.state, state)) return false;

    // Anything after the current position is discarded by a new edit
    this.entries.length = this.index + 1;

    if (group && cur.group === group && this.index > 0 && now - cur.time <= this.groupWindowMs) {
      this.entries[this.index] = { state, group, time: now };
      return true;
    }

    this.entries.push({ state, group, time: now });
    this.index++;
    if (this.entries.length > this.limit) {
      this.entries.shift();
      this.index--;
    }
    return true;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index--;
    return this.current;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index++;
    return this.current;
  }

  reset(state: T) {
    this.entries = [{ state, time: 0 }];
    this.index = 0;
  }
}
