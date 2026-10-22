/**
 * File import: detects the format of a dropped/opened file and decodes it into tracks or a project.
 * Supported: Standard MIDI, BDO in-game score (ICE), MusicXML, Marni/BDO XML, .marni projects and
 * legacy JSON track dumps.
 */

import type { EffectorSettings, InstrumentId, Note, TimeSignature, Track } from '../types/music.ts';
import { BDO_INSTRUMENTS } from '../types/music.ts';
import { parseStandardMidiFile } from '../midi/midiDecoder.ts';
import { isMusicXmlContent, parseMusicXml } from '../musicxml/musicXmlDecoder.ts';
import { isBdoBinaryContent, parseBdoBinaryFile } from '../bdo/bdoDecoder.ts';
import { detectBdoInstrument } from '../utils/instrumentDetection.ts';
import { isProjectFileContent, parseProjectFile, PROJECT_FORMAT } from '../project/projectFile.ts';
import { newId } from '../utils/ids.ts';

export type ImportFormat = 'midi' | 'bdo' | 'musicxml' | 'bdo-xml' | 'project' | 'json' | 'unknown';

export interface ImportedTracks {
  kind: 'tracks';
  format: Exclude<ImportFormat, 'project' | 'unknown'>;
  importedTracks: Track[];
  bpm?: number;
  title?: string;
  timeSignature?: TimeSignature;
  bdoMeta?: {
    author: string;
    composer: string;
    arranger: string;
    ownerId?: number | null;
    effectorSettings?: EffectorSettings;
  };
}

export type ImportedFile =
  | ImportedTracks
  | { kind: 'project'; text: string; fileName: string }
  | { kind: 'error'; message: string };

const FORMAT_NAMES: Record<Exclude<ImportFormat, 'unknown'>, string> = {
  midi: 'MIDI',
  bdo: 'de partitura do Black Desert',
  musicxml: 'MusicXML',
  'bdo-xml': 'XML',
  project: 'de projeto',
  json: 'JSON',
};

const hasExt = (name: string, ...exts: string[]) => exts.some((e) => name.toLowerCase().endsWith(e));

/** Detects the file format from its content (magic bytes / markers), falling back to the extension. */
export function detectImportFormat(bytes: Uint8Array, fileName: string, text: string | null): ImportFormat {
  const isSmf = bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
  if (isSmf || hasExt(fileName, '.mid', '.midi')) return 'midi';
  if (isBdoBinaryContent(bytes) || hasExt(fileName, '.bms')) return 'bdo';
  if (text === null) return 'unknown';
  if (isProjectFileContent(text) || hasExt(fileName, '.marni')) return 'project';
  if (isMusicXmlContent(text) || hasExt(fileName, '.musicxml')) return 'musicxml';
  if (text.includes('<MarniScore') || (text.includes('<?xml') && text.includes('<Tracks>'))) return 'bdo-xml';
  if (text.trimStart().startsWith('{')) return 'json';
  return 'unknown';
}

/** Legacy JSON ({ tracks, bpm, title }) validated with the project parser so broken data never reaches the editor. */
export function parseLegacyJson(text: string): Omit<ImportedTracks, 'kind' | 'format'> | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || !Array.isArray(raw.tracks) || raw.tracks.length === 0) return null;
  const project = parseProjectFile(JSON.stringify({ ...raw, format: PROJECT_FORMAT, version: 1 }));
  return {
    importedTracks: project.tracks,
    bpm: typeof raw.bpm === 'number' ? project.bpm : undefined,
    title: typeof raw.title === 'string' ? project.title : undefined,
    timeSignature: typeof raw.timeSignature === 'string' ? project.timeSignature : undefined,
  };
}

function parseBdoXml(text: string, fileName: string): Omit<ImportedTracks, 'kind' | 'format'> {
  const xmlDoc = new DOMParser().parseFromString(text, 'text/xml');
  const xmlTitle = xmlDoc.querySelector('Title')?.textContent || undefined;
  const bpmText = xmlDoc.querySelector('BPM')?.textContent;
  const importedTracks: Track[] = [];
  xmlDoc.querySelectorAll('Track').forEach((tEl, idx) => {
    const id = newId('track');
    const name = tEl.getAttribute('name') || `Faixa ${idx + 1}`;
    const notes: Note[] = [];
    tEl.querySelectorAll('Note').forEach((nEl) => {
      notes.push({
        id: newId('note'),
        trackId: id,
        pitch: Number(nEl.getAttribute('pitch')) || 60,
        startTick: Number(nEl.getAttribute('startTick')) || 0,
        durationTicks: Number(nEl.getAttribute('duration')) || 480,
        velocity: Number(nEl.getAttribute('velocity')) || 90,
      });
    });
    const rawInst = tEl.getAttribute('instrumentId');
    const instrumentId =
      rawInst && BDO_INSTRUMENTS.some((i) => i.id === rawInst)
        ? (rawInst as InstrumentId)
        : detectBdoInstrument({ name, fileName, notes });
    const inst = BDO_INSTRUMENTS.find((i) => i.id === instrumentId);
    importedTracks.push({
      id,
      name,
      instrumentId,
      color: inst?.color || '#d4a373',
      volume: inst?.defaultVolume || 75,
      pan: 0,
      isMuted: false,
      isSolo: false,
      auxSend: true,
      notes,
    });
  });
  return { importedTracks, bpm: bpmText ? Number(bpmText) : undefined, title: xmlTitle };
}

export async function readImportFile(file: File): Promise<ImportedFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const looksBinary = detectImportFormat(bytes, file.name, null);
  const text = looksBinary === 'unknown' ? new TextDecoder().decode(buffer) : null;
  const format = looksBinary === 'unknown' ? detectImportFormat(bytes, file.name, text) : looksBinary;

  const noNotes = (f: Exclude<ImportFormat, 'unknown'>): ImportedFile => ({
    kind: 'error',
    message: `O arquivo ${FORMAT_NAMES[f]} foi lido, mas nenhuma nota foi encontrada.`,
  });

  switch (format) {
    case 'midi': {
      const d = parseStandardMidiFile(buffer, file.name);
      return d.tracks.length > 0
        ? { kind: 'tracks', format, importedTracks: d.tracks, bpm: d.bpm, title: d.title, timeSignature: d.timeSignature }
        : noNotes(format);
    }
    case 'bdo': {
      const fileTitle = file.name.replace(/\.[^/.]+$/, '').trim();
      const d = parseBdoBinaryFile(bytes, fileTitle);
      if (d.tracks.length === 0) return noNotes(format);
      const composer = d.composer.trim();
      const arranger = d.arranger.trim();
      return {
        kind: 'tracks',
        format,
        importedTracks: d.tracks,
        bpm: d.bpm,
        title: fileTitle || d.title,
        timeSignature: d.timeSignature,
        bdoMeta: {
          author: (d.author || composer || arranger || 'Desconhecido').trim(),
          composer,
          arranger,
          ownerId: d.ownerId,
          effectorSettings: d.effectorSettings,
        },
      };
    }
    case 'project':
      return { kind: 'project', text: text!, fileName: file.name };
    case 'musicxml': {
      const d = parseMusicXml(text!);
      return d.tracks.length > 0
        ? { kind: 'tracks', format, importedTracks: d.tracks, bpm: d.bpm, title: d.title, timeSignature: d.timeSignature }
        : noNotes(format);
    }
    case 'bdo-xml': {
      const d = parseBdoXml(text!, file.name);
      return d.importedTracks.length > 0 ? { kind: 'tracks', format, ...d } : noNotes(format);
    }
    case 'json': {
      const d = parseLegacyJson(text!);
      return d ? { kind: 'tracks', format, ...d } : noNotes(format);
    }
    default:
      return {
        kind: 'error',
        message: 'Formato não reconhecido. Use MIDI (.mid), MusicXML, partitura do BDO, XML ou projeto .marni.',
      };
  }
}
