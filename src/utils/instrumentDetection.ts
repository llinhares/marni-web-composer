/**
 * BDO Instrument Detection Utility
 * Automatically identifies the best matching Black Desert Online instrument
 * based on track name, file name, MIDI Program Change, MIDI Channel, and note pitch registers.
 */

import type { InstrumentId } from '../types/music.ts';

export interface DetectInstrumentParams {
  name?: string;
  fileName?: string;
  program?: number;
  channel?: number;
  notes?: { pitch: number }[];
}

/**
 * Detects the most appropriate BDO instrument for a given track.
 */
export function detectBdoInstrument(params: DetectInstrumentParams): InstrumentId {
  const { name, fileName, program, channel, notes } = params;

  // 1. Channel 9 (MIDI Channel 10, 0-indexed) is standard GM Percussion/Drums
  if (channel === 9) {
    return 'percussion';
  }

  // 2. Keyword matching on track name and file name
  // Clean names removing extension
  const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, '') : '';
  const combinedText = `${name || ''} ${cleanFileName}`.toLowerCase();

  // A. Drums / Percussion
  if (
    /\b(drums?|perc(ussion)?|snare|kick|cymbal|hi-?hat|toms?|bateria|bumbo|caixa|tambor(es)?|pandeiro|pratos?|percussão|percussao)\b/i.test(combinedText) ||
    combinedText.includes('bateria') ||
    combinedText.includes('percuss') ||
    combinedText.includes('drum')
  ) {
    return 'percussion';
  }

  // B. Cello (violoncelo / cello) - checked before bass and violin
  if (
    /\b(cello|cellos|violoncelo|violoncelos|violoncello|celli|vlc)\b/i.test(combinedText) ||
    combinedText.includes('cello') ||
    combinedText.includes('violoncel')
  ) {
    return 'cello';
  }

  // C. Bass (contrabaixo / baixo / bass) - checked before guitar
  if (
    /\b(bass|basses|baixo|baixos|contrabaixo|contrabaixos|contra-baixo|upright|fretless|slap|subbass|double_?bass)\b/i.test(combinedText) ||
    combinedText.includes('baixo') ||
    combinedText.includes('contrabaixo') ||
    combinedText.includes('bass_') ||
    combinedText.includes('_bass')
  ) {
    return 'bass';
  }

  // D. Guitar (violão / guitarra)
  if (
    /\b(guitars?|viol[aã]o|viol[aã]os|gtr|acoust(ic)?|nylon|electric|guitarra|dedilhado)\b/i.test(combinedText) ||
    combinedText.includes('guitar') ||
    combinedText.includes('violao') ||
    combinedText.includes('violão')
  ) {
    return 'guitar';
  }

  // E. Flute (flauta)
  if (
    /\b(flute?s?|flautas?|piccolo|recorder|pan_?flute|ocarina|whistle|woodwinds?|p[ií]fano|sopra)\b/i.test(combinedText) ||
    combinedText.includes('flute') ||
    combinedText.includes('flauta') ||
    combinedText.includes('piccolo')
  ) {
    return 'flute';
  }

  // F. Trumpet / Brass (trompete / trompa / metais)
  if (
    /\b(trumpets?|trompetes?|horns?|trompas?|brass|trombones?|tubas?|clarim|metais|cornet)\b/i.test(combinedText) ||
    combinedText.includes('trumpet') ||
    combinedText.includes('trompete') ||
    combinedText.includes('brass') ||
    combinedText.includes('trompa')
  ) {
    return 'trumpet';
  }

  // G. Harp (harpa)
  if (
    /\b(harps?|harpas?|lyre|lira)\b/i.test(combinedText) ||
    combinedText.includes('harp') ||
    combinedText.includes('harpa')
  ) {
    return 'harp';
  }

  // H. Violin / Strings (violino / cordas)
  if (
    /\b(violins?|violinos?|vln|fiddle|strings?|cordas|violas?|spiccato|pizzicato)\b/i.test(combinedText) ||
    combinedText.includes('violin') ||
    combinedText.includes('violino') ||
    combinedText.includes('string') ||
    combinedText.includes('cordas')
  ) {
    return 'violin';
  }

  // I. Marnisynth / Synth (sintetizador)
  if (
    /\b(synths?|sintetizador(es)?|leads?|pads?|marni|marnisynth|saw|square|waves?|electronic|techno)\b/i.test(combinedText) ||
    combinedText.includes('synth') ||
    combinedText.includes('marni') ||
    combinedText.includes('sintetizador')
  ) {
    return 'marnisynth';
  }

  // J. Piano
  if (
    /\b(pianos?|grand_?piano|pno|keys?|keyboards?|teclados?|steinway|cauda|upright_?piano)\b/i.test(combinedText) ||
    combinedText.includes('piano') ||
    combinedText.includes('teclado')
  ) {
    return 'grand-piano';
  }

  // 3. General MIDI (GM) Program Change Mapping
  if (program !== undefined) {
    if (program >= 112 && program <= 127) return 'percussion';
    if (program >= 24 && program <= 31) return 'guitar';
    if (program >= 32 && program <= 39) return 'bass';
    if (program === 42) return 'cello';
    if (program === 46) return 'harp';
    if ((program >= 40 && program <= 41) || (program >= 43 && program <= 51)) return 'violin';
    if (program >= 56 && program <= 63) return 'trumpet';
    if (program >= 71 && program <= 79) return 'flute';
    if (program >= 80 && program <= 103) return 'marnisynth';
    if (program >= 0 && program <= 7) return 'grand-piano';
    if (program >= 8 && program <= 15) return 'harp'; // Chromatic bells, celesta, marimba
    if (program >= 16 && program <= 23) return 'grand-piano'; // Organ
  }

  // 4. Note Pitch Register Heuristics
  if (notes && notes.length > 0) {
    let sumPitch = 0;
    let minPitch = 127;
    let maxPitch = 0;
    for (const n of notes) {
      sumPitch += n.pitch;
      if (n.pitch < minPitch) minPitch = n.pitch;
      if (n.pitch > maxPitch) maxPitch = n.pitch;
    }
    const avgPitch = sumPitch / notes.length;

    // Deep bass register (typically pitches 28 to 55, average < 48)
    if (avgPitch < 50 && maxPitch <= 65 && minPitch <= 43) {
      return 'bass';
    }

    // High woodwind/violin register (rarely goes below 58, average > 72)
    if (minPitch >= 58 && avgPitch >= 72) {
      return 'flute';
    }
  }

  // Default fallback
  return 'grand-piano';
}
