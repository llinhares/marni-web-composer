/**
 * Playhead position kept outside React state.
 *
 * The scheduler publishes the playhead ~50 times per second. Storing it in App state re-rendered the
 * whole UI on every tick; with this store only the subscribers (timecode, playhead overlay) update.
 */

import { useSyncExternalStore } from 'react';

export interface PlayheadStore {
  get(): number;
  set(tick: number): void;
  subscribe(listener: () => void): () => void;
}

export function createPlayheadStore(initialTick = 0): PlayheadStore {
  let tick = initialTick;
  const listeners = new Set<() => void>();
  return {
    get: () => tick,
    set(next: number) {
      if (next === tick) return;
      tick = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Re-renders the calling component when the playhead moves. */
export function usePlayheadTick(store: PlayheadStore): number {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
