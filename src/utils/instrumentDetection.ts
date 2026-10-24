/**
 * Picks the Black Desert instrument for an imported part (MIDI track/channel, MusicXML part...).
 *
 * Order of evidence:
 * 1. MIDI channel 10 is always the drum kit.
 * 2. A General MIDI program other than 0 (professional DAWs write the instrument they used).
 * 3. Instrument words in the track name or file name (pt-BR and English).
 * 4. Program 0, when present, is a piano.
 * 5. The register of the notes (low parts -> contrabass, high parts -> flute).
 */

import type { InstrumentId } from '../types/music.ts';
import {
  bdoInstrumentForGmProgram,
  getBdoInstrument,
  type BdoInstrumentKey,
} from '../bdo/bdoInstruments.ts';

export interface DetectInstrumentParams {
  name?: string;
  fileName?: string;
  program?: number;
  channel?: number;
  notes?: { pitch: number }[];
}

/** Words that name an instrument, most specific first. */
const NAME_RULES: Array<[RegExp, BdoInstrumentKey]> = [
  [/\b(drums?|drum ?kit|kit de bateria|bateria|percuss(ion|ão|ao)|snare|kick|hi-?hat|cymbals?|toms?|bumbo|caixa|chimbal)\b/, 'florchestra-drum-set'],
  [/\b(hand ?pan|steel ?drums?|tamborim|marimba|xylo(phone)?|xilofone|kalimba|timpani|t[ií]mpanos?)\b/, 'florchestra-handpan'],
  [/\b(distortion|distorted|distor[cç][aã]o|hexe|metal guitar)\b/, 'guitar-hexe-glam'],
  [/\b(overdrive|overdriven|drive guitar|highway|rock guitar)\b/, 'guitar-highway'],
  [/\b(electric guitar|e\.? ?guitar|guitarra|clean guitar|jazz guitar|lead guitar|rhythm guitar)\b/, 'guitar-silver-wave'],
  [/\b(electric bass|e\.? ?bass|bass guitar|baixo el[eé]trico|slap|synth ?bass|finger bass|pick bass|marnibass)\b/, 'marnibass'],
  [/\b(cellos?|violoncel(l)?os?|celli|contrabass(es)?|contrabaixos?|double ?bass|upright bass|acoustic bass|baixo ac[uú]stico|bass(es)?|baixos?|vlc)\b/, 'florchestra-contrabass'],
  [/\b(acoustic guitar|nylon|steel guitar|viol[aã]o|viol[aã]es|guitars?|gtr|banjo|ukulele|mandolin|bandolim|sitar|koto)\b/, 'florchestra-acoustic-guitar'],
  [/\b(harps?|harpas?|lyre|lira|celesta|glockenspiel|music ?box|caixa de m[uú]sica)\b/, 'florchestra-harp'],
  [/\b(violins?|violinos?|violas?|vln|fiddle|rabeca|strings?|cordas|ensemble|pizz(icato)?|spiccato)\b/, 'florchestra-violin'],
  [/\b(recorders?|flauta doce|gravador)\b/, 'beginner-recorder'],
  [/\b(clarinets?|clarinetes?|sax(ophone)?s?|saxofones?|oboes?|obo[eé]s?|bassoons?|fagotes?|english horn|accordion|acorde[aã]o|harmonica|gaita)\b/, 'florchestra-clarinet'],
  [/\b(horns?|trompas?|trumpets?|trompetes?|trombones?|tubas?|brass|metais|cornet|flugelhorn)\b/, 'florchestra-horn'],
  [/\b(flutes?|flautas?|piccolos?|flautim|pan ?flute|ocarinas?|whistle|pife|p[ií]fano|shakuhachi|choir|coro|voice|voz|vocals?)\b/, 'florchestra-flute'],
  [/\b(organs?|[oó]rg[aã]os?|synth ?brass)\b/, 'marnion-sandwich'],
  [/\b(pads?|atmosphere|ambient|strings? pad|warm)\b/, 'marnion-illusion-tree'],
  [/\b(fx|sfx|effects?|efeitos?)\b/, 'marnion-secret-note'],
  [/\b(synths?|sintetizador(es)?|leads?|saw(tooth)?|square|chiptune|8-?bit|marni(on|synth)?|wavy)\b/, 'marnion-wavy-planet'],
  [/\b(pianos?|grand|pno|keys|keyboards?|teclados?|rhodes|e\.? ?piano|epiano|harpsichord|cravo|clav(inet)?)\b/, 'florchestra-piano'],
];

// Word boundaries that also work with accented letters (\b only knows ASCII)
const LETTER_OR_DIGIT = '\\p{L}\\p{N}';
const WORD_RULES = NAME_RULES.map(
  ([re, key]) =>
    [
      new RegExp(
        `(?<![${LETTER_OR_DIGIT}])(?:${re.source.replaceAll('\\b', '')})(?![${LETTER_OR_DIGIT}])`,
        'u'
      ),
      key,
    ] as const
);

/** Detects the exact game instrument for an imported part. */
export function detectGameInstrument(params: DetectInstrumentParams): BdoInstrumentKey {
  const { name, fileName, program, channel, notes } = params;

  if (channel === 9) return 'florchestra-drum-set';
  if (program !== undefined && program > 0) return bdoInstrumentForGmProgram(program, channel);

  const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, '') : '';
  const text = ` ${name || ''} ${cleanFileName} `
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [re, key] of WORD_RULES) if (re.test(text)) return key;

  if (program === 0) return 'florchestra-piano';

  if (notes && notes.length > 0) {
    let sum = 0;
    let min = 127;
    let max = 0;
    for (const n of notes) {
      sum += n.pitch;
      if (n.pitch < min) min = n.pitch;
      if (n.pitch > max) max = n.pitch;
    }
    const avg = sum / notes.length;
    if (avg < 50 && max <= 65 && min <= 43) return 'florchestra-contrabass';
    if (min >= 58 && avg >= 72) return 'florchestra-flute';
  }
  return 'florchestra-piano';
}

/** Sound family of the detected instrument (playback). */
export function detectBdoInstrument(params: DetectInstrumentParams): InstrumentId {
  return getBdoInstrument(detectGameInstrument(params))!.family;
}
