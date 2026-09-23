import { type InstrumentType } from '@/types';

export const generateScale = (top: string, bottom: string): string[] => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const topOct = parseInt(top.replace(/\D/g, ''));
  const botOct = parseInt(bottom.replace(/\D/g, ''));

  const result: string[] = [];
  let started = false;

  for (let oct = topOct; oct >= botOct; oct--) {
    for (let i = notes.length - 1; i >= 0; i--) {
      const current = `${notes[i]}${oct}`;
      if (!started && current === top) started = true;
      if (started) {
        result.push(current);
        if (current === bottom) return result;
      }
    }
  }
  return result;
};

export const DRUM_KIT_NOTES = [
  'SnrRollL', 'SnrRollS', 'CymRide', 'CymCrsh', 'Tom5', 'Tom4',
  'HihatO', 'Tom3', 'HatPdl', 'Tom2', 'HihatC', 'Tom1',
  'SnrFlam', 'RimShot', 'SnrHit', 'SnrSide', 'Kck'
];

export const GM_TO_DRUM_NAME: Record<number, string> = {
  35: 'Kck',       // Acoustic Bass Drum
  36: 'Kck',       // Bass Drum 1
  37: 'RimShot',   // Side Stick
  38: 'SnrHit',    // Acoustic Snare
  39: 'SnrHit',    // Hand Clap
  40: 'SnrHit',    // Electric Snare
  41: 'Tom1',      // Low Floor Tom
  42: 'HihatC',    // Closed Hi-Hat
  43: 'Tom2',      // High Floor Tom
  44: 'HatPdl',    // Pedal Hi-Hat
  45: 'Tom3',      // Low Tom
  46: 'HihatO',    // Open Hi-Hat
  47: 'Tom4',      // Low-Mid Tom
  48: 'Tom5',      // Hi-Mid Tom
  49: 'CymCrsh',   // Crash Cymbal 1
  50: 'Tom5',      // High Tom
  51: 'CymRide',   // Ride Cymbal 1
  52: 'CymCrsh',   // Chinese Cymbal
  53: 'CymRide',   // Ride Bell
  54: 'CymCrsh',   // Tambourine
  55: 'CymCrsh',   // Splash Cymbal
  56: 'RimShot',   // Cowbell
  57: 'CymCrsh',   // Crash Cymbal 2
  58: 'RimShot',   // Vibraslap
  59: 'CymRide',   // Ride Cymbal 2
};

const FULL_PIANO_SCALE = generateScale('C8', 'C1');

export const INSTRUMENT_DICT: Record<InstrumentType, string[]> = {
  // Florchestra / Tradicionais
  'Grand Piano': FULL_PIANO_SCALE,
  'Violão Acústico': FULL_PIANO_SCALE,
  'Contrabaixo': FULL_PIANO_SCALE,
  'Harpa': FULL_PIANO_SCALE,
  'Violino': FULL_PIANO_SCALE,
  'Flauta Transversal': FULL_PIANO_SCALE,
  'Clarinete': FULL_PIANO_SCALE,
  'Trompa': FULL_PIANO_SCALE,
  
  // Guitarras Elétricas
  'Guitarra Silver Wave': FULL_PIANO_SCALE,
  'Guitarra Highway': FULL_PIANO_SCALE,
  'Guitarra Hexe Glam': FULL_PIANO_SCALE,
  
  // Sintetizadores Marnian
  'Marnibass': FULL_PIANO_SCALE,
  'Marnian Wavy Planet': FULL_PIANO_SCALE,
  'Marnian Illusion Tree': FULL_PIANO_SCALE,
  'Marnian Secret Note': FULL_PIANO_SCALE,
  'Marnian Sandwich': FULL_PIANO_SCALE,
  
  // Percussão & Étnicos
  'Kit de Bateria': DRUM_KIT_NOTES,
  'Tamborim': DRUM_KIT_NOTES,
  'Pratos': DRUM_KIT_NOTES,
  'Handpan': FULL_PIANO_SCALE,
  
  // Iniciante
  'Piano de Iniciante': FULL_PIANO_SCALE,
  'Violão de Iniciante': FULL_PIANO_SCALE,
  'Harpa de Iniciante': FULL_PIANO_SCALE,
  'Violino de Iniciante': FULL_PIANO_SCALE,
  'Flauta de Iniciante': FULL_PIANO_SCALE,
  'Flauta Doce de Iniciante': FULL_PIANO_SCALE,
};

export const PIANO_ROLL = {
  NOTE_HEIGHT: 24,         
  BEAT_WIDTH: 80,          
  KEYBOARD_WIDTH: 75,
  TICKS_PER_BEAT: 480,     
  TIMELINE_HEIGHT: 30,
};