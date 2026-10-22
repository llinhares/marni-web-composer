/**
 * Track Import Utilities
 * Handles merging imported tracks into the project workspace (append vs replace).
 */

import type { Track } from '../types/music.ts';
import { newId } from './ids.ts';

export type ImportMode = 'replace' | 'append';

export interface MergeTracksResult {
  tracks: Track[];
  activeTrackId: string;
  isAppended: boolean;
}

/**
 * Merges imported tracks with current workspace tracks according to selected import mode.
 * In 'append' mode, adds imported tracks to the existing track list with unique IDs.
 * If current project is empty (single track with 0 notes), replaces the empty placeholder.
 * In 'replace' mode, replaces all tracks.
 */
export function mergeImportedTracks(
  currentTracks: Track[],
  importedTracks: Track[],
  mode: ImportMode
): MergeTracksResult {
  if (!importedTracks || importedTracks.length === 0) {
    return {
      tracks: currentTracks,
      activeTrackId: currentTracks[0]?.id || '',
      isAppended: false,
    };
  }

  const isCurrentProjectEmpty =
    currentTracks.length === 1 && currentTracks[0].notes.length === 0;

  if (mode === 'append' && !isCurrentProjectEmpty) {
    const remappedTracks: Track[] = importedTracks.map((t) => {
      const newTrackId = newId('track-imp');
      return {
        ...t,
        id: newTrackId,
        notes: t.notes.map((n) => ({
          ...n,
          id: newId('note-imp'),
          trackId: newTrackId,
        })),
      };
    });

    return {
      tracks: [...currentTracks, ...remappedTracks],
      activeTrackId: remappedTracks[0].id,
      isAppended: true,
    };
  }

  // Replace mode (or empty canvas placeholder)
  return {
    tracks: importedTracks,
    activeTrackId: importedTracks[0].id,
    isAppended: false,
  };
}
