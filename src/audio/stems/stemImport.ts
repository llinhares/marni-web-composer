/**
 * Audio or video file -> separated stems -> one note track per instrument (browser only).
 */

import type { Note } from '../../types/music.ts';
import { transcribeAudioBufferToNotes } from '../../utils/audioToMidi.ts';
import type { BdoInstrumentKey } from '../../bdo/bdoInstruments.ts';
import { DEMUCS_SAMPLE_RATE, type StemName, type Stems, type StereoStem } from './stemTypes.ts';
import {
  SILENT_STEM_DB,
  STEM_INSTRUMENTS,
  STEM_LABELS,
  foldIntoInstrument,
  mixToMono,
  monophonicLine,
  stemLevelDb,
  transcribeDrums,
} from './stemTranscription.ts';

export interface StemPart {
  stem: StemName;
  label: string;
  levelDb: number;
  silent: boolean;
  notes: Note[];
  instrument: BdoInstrumentKey;
}

export const STEM_ORDER: StemName[] = ['vocals', 'other', 'bass', 'drums'];

function stemToAudioBuffer(stem: StereoStem): AudioBuffer {
  const buf = new AudioBuffer({ length: stem.left.length, numberOfChannels: 2, sampleRate: DEMUCS_SAMPLE_RATE });
  buf.copyToChannel(stem.left, 0);
  buf.copyToChannel(stem.right, 1);
  return buf;
}

/** Notes of every stem, timed at `bpm` (ticks from the start of the separated range). */
export async function transcribeStems(
  stems: Stems,
  opts: { bpm: number; onProgress?: (progress: number, stage: string) => void; signal?: AbortSignal }
): Promise<StemPart[]> {
  const { bpm, onProgress, signal } = opts;
  const parts: StemPart[] = [];
  for (let i = 0; i < STEM_ORDER.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    const stem = STEM_ORDER[i];
    const label = STEM_LABELS[stem];
    const levelDb = stemLevelDb(stems[stem]);
    const silent = levelDb < SILENT_STEM_DB;
    const instrument = STEM_INSTRUMENTS[stem];
    const report = (p: number) => onProgress?.((i + p) / STEM_ORDER.length, `Transcrevendo ${label.toLowerCase()} (${i + 1} de ${STEM_ORDER.length})...`);
    report(0);

    let notes: Note[] = [];
    if (!silent) {
      if (stem === 'drums') {
        notes = transcribeDrums(mixToMono(stems.drums), DEMUCS_SAMPLE_RATE, bpm);
      } else {
        const result = await transcribeAudioBufferToNotes(stemToAudioBuffer(stems[stem]), {
          bpm,
          engine: 'ml',
          sensitivity: stem === 'other' ? 0.55 : 0.5,
          onProgress: (p) => report(p * 0.95),
        });
        notes = result.notes;
        if (stem === 'vocals') notes = monophonicLine(notes, 'loudest', 40);
        else if (stem === 'bass') notes = monophonicLine(notes, 'lowest', 40);
        notes = foldIntoInstrument(notes, instrument);
      }
    }
    parts.push({ stem, label, levelDb, silent, notes, instrument });
  }
  onProgress?.(1, 'Transcrição concluída.');
  return parts;
}
