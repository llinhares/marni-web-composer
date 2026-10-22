/**
 * Black Desert Online (BDO) Music Exporter and MML Generator
 * Matches Marni Web Composer format & BDO Music Album specifications.
 */

import type { Track, SongMetadata } from '../types/music.ts';
import { BDO_INSTRUMENTS, BDO_GRADE_LIMITS } from '../types/music.ts';
import { pitchToNoteName } from '../utils/musicMath.ts';

export interface BdoExportResult {
  xmlContent: string;
  mmlContent: string;
  totalNotes: number;
  maxNotesAllowed: number;
  isWithinLimits: boolean;
  notesPerTrack: { trackName: string; count: number; instrument: string }[];
  recommendedGrade: string;
}

/**
 * Converts musical notes of a track into MML (Music Macro Language) text
 * which is directly supported by Black Desert Online's music composer system.
 */
export function trackToMML(track: Track, bpm: number): string {
  if (track.notes.length === 0) return '';

  const sortedNotes = [...track.notes].sort((a, b) => a.startTick - b.startTick);
  const mmlTokens: string[] = [];

  mmlTokens.push(`T${bpm}`);
  let currentOctave = 4;
  let currentVelocity = 100;
  let currentTick = 0;

  for (const note of sortedNotes) {
    // Check if there is rest between notes
    if (note.startTick > currentTick) {
      const restTicks = note.startTick - currentTick;
      const restLength = ticksToMmlLength(restTicks);
      mmlTokens.push(`r${restLength}`);
      currentTick = note.startTick;
    }

    // Velocity update if changed
    const targetVel = Math.min(127, Math.max(1, Math.round((note.velocity / 127) * 100)));
    if (Math.abs(targetVel - currentVelocity) > 4) {
      mmlTokens.push(`v${targetVel}`);
      currentVelocity = targetVel;
    }

    // Octave calculation
    const noteOctave = Math.floor(note.pitch / 12) - 1;
    if (noteOctave !== currentOctave) {
      if (noteOctave === currentOctave + 1) {
        mmlTokens.push('>');
      } else if (noteOctave === currentOctave - 1) {
        mmlTokens.push('<');
      } else {
        mmlTokens.push(`o${noteOctave}`);
      }
      currentOctave = noteOctave;
    }

    // Note pitch representation
    const pitchClass = note.pitch % 12;
    const noteNames = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'];
    const noteChar = noteNames[pitchClass];

    // Duration representation
    const durStr = ticksToMmlLength(note.durationTicks);
    mmlTokens.push(`${noteChar}${durStr}`);

    currentTick = note.startTick + note.durationTicks;
  }

  return mmlTokens.join('');
}

/**
 * Converts ticks to standard musical fraction length string (1, 2, 4, 8, 16, 32, 64)
 */
function ticksToMmlLength(ticks: number, ticksPerBeat = 480): string {
  // 1 beat = quarter note = 480 ticks = length "4"
  // 1 whole note = 1920 ticks = "1"
  // half note = 960 ticks = "2"
  // eighth note = 240 ticks = "8"
  // sixteenth = 120 ticks = "16"
  // 32nd = 60 ticks = "32"
  // 64th = 30 ticks = "64"

  const whole = ticksPerBeat * 4;
  const ratio = whole / Math.max(15, ticks);

  if (Math.abs(ratio - 1) < 0.1) return '1';
  if (Math.abs(ratio - 2) < 0.1) return '2';
  if (Math.abs(ratio - 4) < 0.1) return '4';
  if (Math.abs(ratio - 8) < 0.1) return '8';
  if (Math.abs(ratio - 16) < 0.1) return '16';
  if (Math.abs(ratio - 32) < 0.1) return '32';
  if (Math.abs(ratio - 64) < 0.1) return '64';

  // Dotted lengths
  if (Math.abs(ticks - 720) < 15) return '4.'; // dotted quarter
  if (Math.abs(ticks - 360) < 15) return '8.'; // dotted eighth
  if (Math.abs(ticks - 180) < 10) return '16.'; // dotted 16th

  // Fallback to nearest power of 2
  const nearest = Math.pow(2, Math.round(Math.log2(Math.max(1, ratio))));
  return String(Math.min(64, Math.max(1, nearest)));
}

/**
 * Determines the required BDO Music Grade based on total note count
 */
export function getRecommendedBdoGrade(totalNotes: number): string {
  if (totalNotes <= 500) return 'F';
  if (totalNotes <= 1000) return 'D';
  if (totalNotes <= 2000) return 'C';
  if (totalNotes <= 4000) return 'B';
  if (totalNotes <= 7000) return 'A';
  return 'S';
}

/**
 * Generates both the XML and MML scores for Black Desert Online
 */
export function generateBdoScore(tracks: Track[], metadata: SongMetadata): BdoExportResult {
  const totalNotes = tracks.reduce((sum, tr) => sum + tr.notes.length, 0);
  const grade = metadata.bdoGrade || 'S';
  const maxNotesAllowed = BDO_GRADE_LIMITS[grade]?.maxNotes || 10000;
  const isWithinLimits = totalNotes <= maxNotesAllowed;
  const recommendedGrade = getRecommendedBdoGrade(totalNotes);

  const notesPerTrack = tracks.map((tr) => {
    const inst = BDO_INSTRUMENTS.find((i) => i.id === tr.instrumentId);
    return {
      trackName: tr.name,
      count: tr.notes.length,
      instrument: inst?.name || tr.instrumentId,
    };
  });

  // Build authentic XML format
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<MarniScore version="2.0" generator="Marni Web Composer Optimized">\n';
  xml += '  <Metadata>\n';
  xml += `    <Title>${escapeXml(metadata.title || 'Sem Título')}</Title>\n`;
  xml += `    <Author>${escapeXml(metadata.author || 'Marni Composer')}</Author>\n`;
  if (metadata.isBdoProtected) {
    xml += '    <Protected>true</Protected>\n';
  }
  xml += `    <BPM>${metadata.bpm}</BPM>\n`;
  xml += `    <TimeSignature>${metadata.timeSignature}</TimeSignature>\n`;
  xml += `    <TotalNotes>${totalNotes}</TotalNotes>\n`;
  xml += `    <GradeRequirement>${recommendedGrade}</GradeRequirement>\n`;
  xml += `    <CreatedAt>${new Date().toISOString()}</CreatedAt>\n`;
  xml += '  </Metadata>\n';
  xml += '  <Tracks count="' + tracks.length + '">\n';

  tracks.forEach((track, idx) => {
    const inst = BDO_INSTRUMENTS.find((i) => i.id === track.instrumentId);
    const bdoCode = inst?.bdoCode ?? 0;
    const bdoMnemonic = inst?.bdoMnemonic ?? 'PNO';

    xml += `    <Track index="${idx}" id="${track.id}" name="${escapeXml(track.name)}" instrumentId="${track.instrumentId}" bdoCode="${bdoCode}" mnemonic="${bdoMnemonic}">\n`;
    xml += `      <Settings volume="${track.volume}" pan="${track.pan}" mute="${track.isMuted}" auxSend="${track.auxSend}" />\n`;
    xml += `      <Notes count="${track.notes.length}">\n`;

    const sorted = [...track.notes].sort((a, b) => a.startTick - b.startTick);
    for (const n of sorted) {
      const noteName = pitchToNoteName(n.pitch, metadata.accidentals);
      xml += `        <Note pitch="${n.pitch}" name="${noteName}" startTick="${n.startTick}" duration="${n.durationTicks}" velocity="${n.velocity}" />\n`;
    }

    xml += '      </Notes>\n';
    xml += '    </Track>\n';
  });

  xml += '  </Tracks>\n';
  xml += '</MarniScore>\n';

  // Build MML multi-track string
  const mmlParts: string[] = [];
  mmlParts.push(`// Marni Web Composer - Score for BDO: ${metadata.title || 'Sem Título'}`);
  mmlParts.push(`// BPM: ${metadata.bpm} | Compass: ${metadata.timeSignature} | Total de Notas: ${totalNotes}`);

  tracks.forEach((track, idx) => {
    const inst = BDO_INSTRUMENTS.find((i) => i.id === track.instrumentId);
    const mml = trackToMML(track, metadata.bpm);
    mmlParts.push(`\n[Track ${idx + 1}: ${track.name} (${inst?.name || 'Instrumento'}) - Vol: ${track.volume}%]`);
    mmlParts.push(mml || 'r1');
  });

  return {
    xmlContent: xml,
    mmlContent: mmlParts.join('\n'),
    totalNotes,
    maxNotesAllowed,
    isWithinLimits,
    notesPerTrack,
    recommendedGrade,
  };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}
